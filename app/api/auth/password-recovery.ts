import { and, eq, gt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { authChallenges, passwordResets, sessions, twoFactors, users } from "@/db/schema";
import { accessKey } from "@/lib/order-access.mjs";
import { mailConfig, recoveryLetter } from "@/lib/mail.mjs";
import { enqueueEmail, enqueuePasswordChanged } from "@/lib/notifications.mjs";
import { publicOrigin } from "@/lib/server-config.mjs";
import { jsonInput, privateJson } from "../request-security";
import { clearSessionCookie, hashPassword, verifyPassword } from "./auth-lib";
import { clearChallenge, consumeFactor, factorLimit } from "./two-factor";
import { chargeAttempt, clearAttempts, rateKey } from "./rate-limit";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const fail = (error: string, status = 400, retry?: number) => privateJson({ error }, status, retry ? { "Retry-After": String(retry) } : undefined);

export async function requestPasswordReset(request: Request) {
  const started = Date.now();
  const retry = await chargeAttempt(await rateKey("password-reset-request", request), 5, 60 * 60_000);
  if (retry) return fail("Too many attempts. Try again later", 429, retry);
  const input = await jsonInput(request);
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email");
  try { mailConfig(); accessKey(); } catch { return fail("Recovery email unavailable. Try again later", 503); }
  const cooldown = await chargeAttempt(await rateKey("password-reset-cooldown", null, email), 1, 60_000);
  if (cooldown) return fail("Wait before requesting another email", 429, cooldown);
  const perEmail = await chargeAttempt(await rateKey("password-reset-email", null, email), 5, 60 * 60_000);
  if (perEmail) return fail("Too many attempts. Try again later", 429, perEmail);
  const db = getDb();
  const origin = publicOrigin(request);
  db.transaction(tx => {
    const account = tx.select().from(users).where(eq(users.email, email)).get();
    if (!account?.emailVerifiedAt) return;
    const token = randomBytes(32).toString("hex");
    const id = digest(token);
    const now = Date.now();
    const expiresAt = now + 30 * 60_000;
    const lang = input?.lang === "en" ? "en" : "ru";
    tx.insert(passwordResets).values({ id, userId: account.id, version: account.sessionVersion, createdAt: now, expiresAt }).run();
    enqueueEmail(db.$client, { key: `reset:${id}`, userId: account.id, kind: "password-reset", parentId: id, expiresAt,
      letter: { ...recoveryLetter(`${origin}/reset-password#token=${token}&lang=${lang}`, lang), tokenId: id } });
  });
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))));
  return privateJson({ accepted: true, retryAfter: 60 }, 202);
}

export async function resetPassword(request: Request, checkOnly = false) {
  const retry = await chargeAttempt(await rateKey("password-reset-verify", request), 20, 15 * 60_000);
  if (retry) return fail("Too many attempts. Try again later", 429, retry);
  const input = await jsonInput(request);
  const token = typeof input?.token === "string" ? input.token : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return fail("Reset link is invalid or expired");
  const db = getDb();
  const id = digest(token);
  const validReset = () => db.select({ reset: passwordResets, user: users }).from(passwordResets)
    .innerJoin(users, and(eq(users.id, passwordResets.userId), eq(users.sessionVersion, passwordResets.version)))
    .where(and(eq(passwordResets.id, id), gt(passwordResets.expiresAt, Date.now()))).get();
  const valid = validReset();
  if (!valid) return fail("Reset link is invalid or expired");
  const factor = db.select().from(twoFactors).where(eq(twoFactors.userId, valid.user.id)).get();
  if (checkOnly) return privateJson({ twoFactorRequired: Boolean(factor?.enabledAt) });
  const password = typeof input?.password === "string" ? input.password : "";
  if (password.length < 12 || password.length > 128) return fail("New password must be 12–128 characters");
  if (await verifyPassword(password, valid.user.passwordHash)) return fail("Choose a different password");
  if (factor?.enabledAt) {
    const retry = await factorLimit(valid.user.id, request);
    if (retry) return fail("Too many attempts. Try again later", 429, retry);
  }
  const passwordHash = await hashPassword(password);
  const origin = publicOrigin(request);
  const updated = db.transaction(tx => {
    const current = validReset();
    if (!current || current.user.passwordHash !== valid.user.passwordHash) return "Reset link is invalid or expired";
    const activeFactor = tx.select().from(twoFactors).where(eq(twoFactors.userId, current.user.id)).get();
    if (activeFactor?.enabledAt && !consumeFactor(tx, current.user.id, input?.code)) return "Invalid or already used verification code";
    tx.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, current.user.id)).run();
    tx.delete(sessions).where(eq(sessions.userId, current.user.id)).run();
    tx.delete(authChallenges).where(eq(authChallenges.userId, current.user.id)).run();
    tx.delete(passwordResets).where(eq(passwordResets.userId, current.user.id)).run();
    db.$client.prepare("UPDATE mail_outbox SET status = 'skipped', payload = NULL WHERE user_id = ? AND kind = 'password-reset' AND status = 'pending'").run(current.user.id);
    enqueuePasswordChanged(db.$client, { userId: current.user.id, eventId: id, origin });
    return null;
  });
  if (updated) return fail(updated, updated === "Invalid or already used verification code" ? 401 : 400);
  await clearAttempts(await rateKey("login-account", null, valid.user.email));
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(request));
  headers.append("Set-Cookie", await clearChallenge(request));
  return privateJson({ ok: true }, 200, headers);
}
