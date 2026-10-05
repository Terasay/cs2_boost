import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { getDb } from "@/db";
import { authChallenges, recoveryCodes, sessions, twoFactors, users } from "@/db/schema";
import { authenticatorUri, generateRecoveryCodes, generateSecret, openSecret, recoveryHash, sealSecret, tokenHash, verifyTotp } from "@/lib/two-factor.mjs";
import { publicOrigin } from "@/lib/server-config.mjs";
import { jsonInput, privateJson } from "../request-security";
import { clearSessionCookie, createSession, deleteSession, getCurrentUser, verifyPassword } from "./auth-lib";
import { chargeAttempt, clearAttempts, rateKey } from "./rate-limit";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const fail = (error: string, status = 400, retry?: number) => privateJson({ error }, status, retry ? { "Retry-After": String(retry) } : undefined);
const lifetime = 5 * 60_000;
const setupLifetime = 10 * 60_000;

function challengeCookie(request: Request, token = "") {
  const secure = publicOrigin(request).startsWith("https:");
  return `${secure ? "__Host-cs2_mfa" : "cs2_mfa"}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? lifetime / 1000 : 0}${secure ? "; Secure" : ""}`;
}

function challengeId(request: Request) {
  const name = publicOrigin(request).startsWith("https:") ? "__Host-cs2_mfa" : "cs2_mfa";
  const token = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([0-9a-f]{64})(?:;|$)`))?.[1];
  return token ? tokenHash(token) : null;
}

export async function clearChallenge(request: Request) {
  const id = challengeId(request);
  if (id) getDb().delete(authChallenges).where(eq(authChallenges.id, id)).run();
  return challengeCookie(request);
}

export async function beginSecondFactor(userId: string, version: number, request: Request) {
  await deleteSession(request);
  await clearChallenge(request);
  const token = randomBytes(32).toString("hex");
  const db = getDb();
  db.delete(authChallenges).where(lt(authChallenges.expiresAt, Date.now())).run();
  db.insert(authChallenges).values({ id: tokenHash(token), userId, version, expiresAt: Date.now() + lifetime }).run();
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(request));
  headers.append("Set-Cookie", challengeCookie(request, token));
  return privateJson({ twoFactorRequired: true, expiresIn: lifetime / 1000 }, 200, headers);
}

export function consumeFactor(tx: Transaction, userId: string, code: unknown) {
  const factor = tx.select().from(twoFactors).where(and(eq(twoFactors.userId, userId), isNotNull(twoFactors.enabledAt))).get();
  if (!factor || typeof code !== "string") return false;
  const step = verifyTotp(openSecret(userId, factor.secret), code.trim(), factor.lastStep);
  if (step !== null) return tx.update(twoFactors).set({ lastStep: step }).where(and(eq(twoFactors.userId, userId), lt(twoFactors.lastStep, step))).returning().all().length === 1;
  const id = recoveryHash(userId, code);
  return id ? tx.delete(recoveryCodes).where(and(eq(recoveryCodes.id, id), eq(recoveryCodes.userId, userId))).returning().all().length === 1 : false;
}

export async function factorLimit(userId: string, request: Request) {
  const ip = await chargeAttempt(await rateKey("mfa-ip", request), 40, 15 * 60_000);
  const account = await chargeAttempt(await rateKey("mfa-account", null, userId), 10, 15 * 60_000);
  return Math.max(ip, account);
}

export async function verifySecondFactor(request: Request) {
  const id = challengeId(request);
  if (!id) return fail("Sign-in verification expired. Sign in again", 401);
  const db = getDb();
  const challenge = db.select().from(authChallenges).where(and(eq(authChallenges.id, id), gt(authChallenges.expiresAt, Date.now()))).get();
  if (!challenge) return fail("Sign-in verification expired. Sign in again", 401);
  const retry = await factorLimit(challenge.userId, request);
  if (retry) return fail("Too many attempts. Try again later", 429, retry);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const account = db.transaction(tx => {
    const valid = tx.select().from(authChallenges).innerJoin(users, and(eq(users.id, authChallenges.userId), eq(users.sessionVersion, authChallenges.version))).where(and(eq(authChallenges.id, id), gt(authChallenges.expiresAt, Date.now()))).get();
    if (!valid || !consumeFactor(tx, valid.users.id, input.code)) return null;
    tx.delete(authChallenges).where(eq(authChallenges.id, id)).run();
    return valid.users;
  });
  if (!account) return fail("Invalid or already used verification code", 401);
  await clearAttempts(await rateKey("mfa-account", null, account.id));
  await clearAttempts(await rateKey("login-account", null, account.email));
  const cookie = await createSession(account.id, account.sessionVersion, request, true);
  const headers = new Headers();
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", challengeCookie(request));
  return privateJson({ user: { id: account.id, email: account.email, role: account.role, twoFactorEnabled: true } }, 200, headers);
}

export async function twoFactorStatus(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "admin") return fail("Admin access required", 403);
  const codes = getDb().select({ count: sql<number>`count(*)` }).from(recoveryCodes).where(eq(recoveryCodes.userId, user.id)).get();
  return privateJson({ enabled: user.twoFactorEnabled, recoveryRemaining: codes?.count ?? 0 });
}

export async function manageSecondFactor(request: Request, action: string) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "admin") return fail("Admin access required", 403);
  const retry = await factorLimit(user.id, request);
  if (retry) return fail("Too many attempts. Try again later", 429, retry);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const db = getDb();
  const account = db.select().from(users).where(eq(users.id, user.id)).get();
  const password = typeof input.password === "string" ? input.password : "";
  if (!account || account.sessionVersion !== user.sessionVersion || !password || password.length > 128 || !(await verifyPassword(password, account.passwordHash))) return fail("Incorrect current password", 401);

  if (action === "two-factor-setup") {
    if (user.twoFactorEnabled) return fail("Two-factor protection is already enabled", 409);
    const secret = generateSecret();
    const sealed = sealSecret(user.id, secret);
    const qr = await QRCode.toDataURL(authenticatorUri(user.email, secret), { width: 260, margin: 2, errorCorrectionLevel: "M" });
    const created = db.transaction(tx => {
      const current = tx.select().from(users).where(and(eq(users.id, user.id), eq(users.sessionVersion, user.sessionVersion))).get();
      const factor = tx.select().from(twoFactors).where(eq(twoFactors.userId, user.id)).get();
      if (!current || factor?.enabledAt) return false;
      tx.insert(twoFactors).values({ userId: user.id, secret: sealed, expiresAt: Date.now() + setupLifetime }).onConflictDoUpdate({ target: twoFactors.userId, set: { secret: sealed, expiresAt: Date.now() + setupLifetime, lastStep: -1 } }).run();
      return true;
    });
    return created ? privateJson({ secret, qr, expiresIn: setupLifetime / 1000 }) : fail("Account changed. Refresh and try again", 409);
  }

  const codes = action === "two-factor-disable" ? [] : generateRecoveryCodes();
  const result = db.transaction(tx => {
    const current = tx.select().from(users).where(and(eq(users.id, user.id), eq(users.sessionVersion, user.sessionVersion), eq(users.passwordHash, account.passwordHash))).get();
    if (!current) return { error: "Account changed. Refresh and try again", status: 409 };
    const factor = tx.select().from(twoFactors).where(eq(twoFactors.userId, user.id)).get();
    if (action === "two-factor-enable") {
      if (!factor || factor.enabledAt || factor.expiresAt <= Date.now()) return { error: "Authenticator setup expired. Start again", status: 409 };
      const step = verifyTotp(openSecret(user.id, factor.secret), typeof input.code === "string" ? input.code.trim() : "", factor.lastStep);
      if (step === null) return { error: "Invalid or already used verification code", status: 401 };
      tx.update(twoFactors).set({ enabledAt: Date.now(), lastStep: step, expiresAt: 0 }).where(and(eq(twoFactors.userId, user.id), isNull(twoFactors.enabledAt))).run();
    } else {
      if (!factor?.enabledAt) return { error: "Two-factor protection is not enabled", status: 409 };
      if (!consumeFactor(tx, user.id, input.code)) return { error: "Invalid or already used verification code", status: 401 };
      if (action === "two-factor-disable") tx.delete(twoFactors).where(eq(twoFactors.userId, user.id)).run();
    }
    tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id)).run();
    if (codes.length) tx.insert(recoveryCodes).values(codes.map(code => ({ id: recoveryHash(user.id, code)!, userId: user.id }))).run();
    const updated = tx.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, user.id)).returning({ version: users.sessionVersion }).get();
    tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
    tx.delete(authChallenges).where(eq(authChallenges.userId, user.id)).run();
    return { version: updated!.version };
  });
  if ("error" in result) return fail(result.error!, result.status);
  await clearAttempts(await rateKey("mfa-account", null, user.id));
  const cookie = await createSession(user.id, result.version, request, action !== "two-factor-disable");
  return privateJson({ enabled: action !== "two-factor-disable", recoveryCodes: codes }, 200, { "Set-Cookie": cookie });
}
