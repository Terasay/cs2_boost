import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../request-security";
import { clearSessionCookie, createSession, deleteAllSessions, deleteSession, getCurrentUser, hashPassword, needsPasswordUpgrade, verifyPassword } from "../auth-lib";
import { chargeAttempt, clearAttempts, rateKey } from "../rate-limit";
import { requestRegistration, verifyRegistration } from "../email-registration";

const DUMMY_HASH = `600000:${"0".repeat(32)}:${"0".repeat(64)}`;
const fail = (error: string, status = 400, headers?: HeadersInit) => privateJson({ error }, status, headers);

async function GETHandler(request: Request) {
  if (new URL(request.url).pathname.endsWith("/me")) return privateJson({ user: await getCurrentUser(request) });
  return fail("Not found", 404);
}

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const action = new URL(request.url).pathname.split("/").pop();
  if (action === "register" || action === "resend-verification") return requestRegistration(request);
  if (action === "verify-email") return verifyRegistration(request);
  if (action === "logout") {
    await deleteSession(request);
    return privateJson({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(request) });
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
    const updated = await db.update(users).set({ passwordHash: await hashPassword(newPassword), sessionVersion: sql`${users.sessionVersion} + 1` }).where(and(eq(users.id, user.id), eq(users.passwordHash, account.passwordHash), eq(users.sessionVersion, user.sessionVersion))).returning({ version: users.sessionVersion });
    if (!updated.length) return fail("Password changed in another session. Sign in again", 409);
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), lt(sessions.version, updated[0].version)));
    await clearAttempts(key);
    const cookie = await createSession(user.id, updated[0].version, request);
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
  await clearAttempts(key);
  const user = { id: found.id, email: found.email, role: found.role };
  await deleteSession(request);
  const cookie = await createSession(user.id, version, request);
  return privateJson({ user }, 200, { "Set-Cookie": cookie });
}

export const GET = safeApi(GETHandler);
export const POST = safeApi(POSTHandler);
