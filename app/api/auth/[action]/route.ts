import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authChallenges, sessions, twoFactors, users } from "@/db/schema";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../request-security";
import { clearSessionCookie, createSession, deleteAllSessions, deleteSession, getCurrentUser, hashPassword, needsPasswordUpgrade, verifyPassword } from "../auth-lib";
import { chargeAttempt, clearAttempts, rateKey } from "../rate-limit";
import { requestRegistration, verifyRegistration } from "../email-registration";
import { beginSecondFactor, clearChallenge, consumeFactor, factorLimit, manageSecondFactor, twoFactorStatus, verifySecondFactor } from "../two-factor";

const DUMMY_HASH = `600000:${"0".repeat(32)}:${"0".repeat(64)}`;
const fail = (error: string, status = 400, headers?: HeadersInit) => privateJson({ error }, status, headers);

async function GETHandler(request: Request) {
  if (new URL(request.url).pathname.endsWith("/me")) return privateJson({ user: await getCurrentUser(request) });
  if (new URL(request.url).pathname.endsWith("/two-factor")) return twoFactorStatus(request);
  return fail("Not found", 404);
}

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const action = new URL(request.url).pathname.split("/").pop();
  if (action === "register" || action === "resend-verification") return requestRegistration(request);
  if (action === "verify-email") return verifyRegistration(request);
  if (action === "two-factor-login") return verifySecondFactor(request);
  if (["two-factor-setup", "two-factor-enable", "two-factor-disable", "two-factor-recovery"].includes(action ?? "")) return manageSecondFactor(request, action!);
  if (action === "logout") {
    await deleteSession(request);
    const headers = new Headers();
    headers.append("Set-Cookie", clearSessionCookie(request));
    headers.append("Set-Cookie", await clearChallenge(request));
    return privateJson({ ok: true }, 200, headers);
  }
  if (action === "logout-all") {
    const user = await getCurrentUser(request);
    if (!user) return fail("Sign in required", 401);
    await deleteAllSessions(user.id);
    return privateJson({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
  }
  if (action === "password") {
    const user = await getCurrentUser(request);
    if (!user) return fail("Sign in required", 401);
    const input = await jsonInput(request);
    if (!input) return fail("Invalid request");
    const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
    if (!currentPassword || currentPassword.length > 128) return fail("Incorrect current password", 401);
    if (newPassword.length < 12 || newPassword.length > 128) return fail("New password must be 12–128 characters");
    if (newPassword === currentPassword) return fail("Choose a different password");
    const key = await rateKey("password", null, user.id);
    const retry = await chargeAttempt(key, 5, 15 * 60_000);
    if (retry) return fail("Too many attempts. Try again later", 429, { "Retry-After": String(retry) });
    const db = getDb();
    const [account] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!account || account.sessionVersion !== user.sessionVersion || !(await verifyPassword(currentPassword, account.passwordHash))) return fail("Incorrect current password", 401);
    if (user.twoFactorEnabled) {
      const retry = await factorLimit(user.id, request);
      if (retry) return fail("Too many attempts. Try again later", 429, { "Retry-After": String(retry) });
    }
    const passwordHash = await hashPassword(newPassword);
    const updated = db.transaction(tx => {
      const current = tx.select().from(users).where(and(eq(users.id, user.id), eq(users.passwordHash, account.passwordHash), eq(users.sessionVersion, user.sessionVersion))).get();
      if (!current) return { error: "Account changed. Refresh and try again", status: 409 };
      if (user.twoFactorEnabled && !consumeFactor(tx, user.id, input.code)) return { error: "Invalid or already used verification code", status: 401 };
      const changed = tx.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, user.id)).returning({ version: users.sessionVersion }).get()!;
      tx.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.version, changed.version))).run();
      tx.delete(authChallenges).where(eq(authChallenges.userId, user.id)).run();
      return changed;
    });
    if ("error" in updated) return fail(updated.error!, updated.status);
    await clearAttempts(key);
    if (user.twoFactorEnabled) await clearAttempts(await rateKey("mfa-account", null, user.id));
    const cookie = await createSession(user.id, updated.version, request, user.twoFactorEnabled);
    return privateJson({ ok: true }, 200, { "Set-Cookie": cookie });
  }
  if (action !== "login") return fail("Not found", 404);

  const ipKey = await rateKey("login-ip", request);
  const ipRetry = await chargeAttempt(ipKey, 40, 15 * 60_000);
  if (ipRetry) return fail("Too many attempts. Try again later", 429, { "Retry-After": String(ipRetry) });

  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email");
  if (!password || password.length > 128) return fail("Incorrect email or password", 401);

  const key = await rateKey("login-account", null, email);
  const retry = await chargeAttempt(key, 10, 15 * 60_000);
  if (retry) return fail("Too many attempts. Try again later", 429, { "Retry-After": String(retry) });

  const db = getDb();
  const [found] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);
  if (!found || !valid) return fail("Incorrect email or password", 401);
  const version = found.sessionVersion;
  if (needsPasswordUpgrade(found.passwordHash)) {
    const updated = await db.update(users).set({ passwordHash: await hashPassword(password) }).where(and(eq(users.id, found.id), eq(users.passwordHash, found.passwordHash))).returning({ id: users.id });
    if (!updated.length) return fail("Incorrect email or password", 401);
  }
  const factor = db.select().from(twoFactors).where(eq(twoFactors.userId, found.id)).get();
  if (factor?.enabledAt) return beginSecondFactor(found.id, version, request);
  await clearAttempts(key);
  const user = { id: found.id, email: found.email, role: found.role };
  await deleteSession(request);
  const clearedChallenge = await clearChallenge(request);
  const cookie = await createSession(user.id, version, request);
  const headers = new Headers();
  headers.append("Set-Cookie", cookie);
  headers.append("Set-Cookie", clearedChallenge);
  return privateJson({ user }, 200, headers);
}

export const GET = safeApi(GETHandler);
export const POST = safeApi(POSTHandler);
