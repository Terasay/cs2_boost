import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { authAttempts } from "@/db/schema";
import { clientIp } from "@/lib/server-config.mjs";

let lastCleanup = 0;

export async function rateKey(scope: string, request: Request | null, value = "") {
  const ip = request ? clientIp(request) : "account";
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${scope}:${ip}:${value.toLowerCase()}`));
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function chargeAttempt(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const db = getDb();
  if (now - lastCleanup > 60_000) {
    await db.run(sql`delete from ${authAttempts} where ${authAttempts.key} in (select ${authAttempts.key} from ${authAttempts} where ${authAttempts.windowStart} < ${now - 86_400_000} limit 200)`);
    lastCleanup = now;
  }
  const [record] = await db.insert(authAttempts).values({ key, count: 1, windowStart: now, blockedUntil: 0 }).onConflictDoUpdate({
    target: authAttempts.key,
    set: {
      count: sql`case when ${authAttempts.windowStart} <= ${now - windowMs} then 1 else min(${authAttempts.count} + 1, ${limit + 1}) end`,
      windowStart: sql`case when ${authAttempts.windowStart} <= ${now - windowMs} then ${now} else ${authAttempts.windowStart} end`,
    },
  }).returning({ count: authAttempts.count, windowStart: authAttempts.windowStart });
  return record.count > limit ? Math.max(1, Math.ceil((record.windowStart + windowMs - now) / 1000)) : 0;
}

export async function clearAttempts(key: string) {
  await getDb().delete(authAttempts).where(eq(authAttempts.key, key));
}
