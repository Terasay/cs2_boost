import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authAttempts } from "@/db/schema";

async function digest(value: string) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function rateKey(scope: string, request: Request, value = "") {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  return digest(`${scope}:${ip}:${value.toLowerCase()}`);
}

export async function chargeAttempt(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const db = getDb();
  await db.insert(authAttempts).values({ key, count: 1, windowStart: now, blockedUntil: 0 }).onConflictDoUpdate({
    target: authAttempts.key,
    set: {
      count: sql`case when ${authAttempts.windowStart} < ${now - windowMs} then 1 else ${authAttempts.count} + 1 end`,
      windowStart: sql`case when ${authAttempts.windowStart} < ${now - windowMs} then ${now} else ${authAttempts.windowStart} end`,
      blockedUntil: sql`case when ${authAttempts.windowStart} < ${now - windowMs} then 0 when ${authAttempts.count} >= ${limit} then ${now + windowMs} else ${authAttempts.blockedUntil} end`,
    },
  });
  const [record] = await db.select({ blockedUntil: authAttempts.blockedUntil }).from(authAttempts).where(eq(authAttempts.key, key)).limit(1);
  return record && record.blockedUntil > now ? Math.ceil((record.blockedUntil - now) / 1000) : 0;
}

export async function clearAttempts(key: string) {
  await getDb().delete(authAttempts).where(eq(authAttempts.key, key));
}
