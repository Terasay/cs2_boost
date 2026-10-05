import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authChallenges, sessions, twoFactors, users } from "@/db/schema";
import { publicOrigin } from "@/lib/server-config.mjs";
export { hashPassword, needsPasswordUpgrade, verifyPassword } from "@/lib/password";

const SESSION_SECONDS = 60 * 60 * 24 * 7;
const hex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));

export async function createSession(userId: string, version: number, request: Request, twoFactorVerified = false) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const db = getDb();
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
  await db.insert(sessions).values({ id: await digest(token), userId, version, twoFactorVerified, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
  const secure = publicOrigin(request).startsWith("https:");
  return `${secure ? "__Host-cs2_session" : "cs2_session"}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request: Request) {
  const secure = publicOrigin(request).startsWith("https:");
  return `${secure ? "__Host-cs2_session" : "cs2_session"}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
}

function sessionToken(request: Request) {
  const name = publicOrigin(request).startsWith("https:") ? "__Host-cs2_session" : "cs2_session";
  return request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([0-9a-f]{64})(?:;|$)`))?.[1];
}

export async function getCurrentUser(request: Request) {
  const token = sessionToken(request);
  if (!token) return null;
  const [user] = await getDb().select({ id: users.id, email: users.email, role: users.role, sessionVersion: users.sessionVersion, twoFactorEnabled: sql<boolean>`case when ${twoFactors.enabledAt} is not null then 1 else 0 end`.mapWith(Boolean) })
    .from(sessions).innerJoin(users, and(eq(users.id, sessions.userId), eq(users.sessionVersion, sessions.version)))
    .leftJoin(twoFactors, eq(twoFactors.userId, users.id))
    .where(and(eq(sessions.id, await digest(token)), gt(sessions.expiresAt, Date.now()), or(isNull(twoFactors.enabledAt), eq(sessions.twoFactorVerified, true)))).limit(1);
  return user ?? null;
}

export async function deleteSession(request: Request) {
  const token = sessionToken(request);
  if (token) await getDb().delete(sessions).where(eq(sessions.id, await digest(token)));
}

export async function deleteAllSessions(userId: string) {
  const db = getDb();
  db.transaction(tx => {
    tx.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
    tx.delete(authChallenges).where(eq(authChallenges.userId, userId)).run();
  });
}
