import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/db";
import { orders, promoEarnings, users } from "@/db/schema";
import { promoCodes } from "@/lib/pricing.mjs";
import { getCurrentUser } from "../auth/auth-lib";
import { privateJson, safeApi } from "../request-security";

export const GET = safeApi(async request => {
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "admin") return privateJson({ error: "Admin account required" }, 403);
  const db = getDb();
  const codes = promoCodes.map(code => {
    const usage = db.select({ requests: sql<number>`count(*)`, discounts: sql<number>`coalesce(sum(${orders.discountAmount}),0)` }).from(orders).where(eq(orders.promoCode, code)).get()!;
    const earnings = db.select({ paidOrders: sql<number>`coalesce(sum(${promoEarnings.reversedAt} is null),0)`, revenue: sql<number>`coalesce(sum(case when ${promoEarnings.reversedAt} is null then ${promoEarnings.paidAmount} else 0 end),0)`, earned: sql<number>`coalesce(sum(case when ${promoEarnings.reversedAt} is null then ${promoEarnings.amount} else 0 end),0)`, reversed: sql<number>`coalesce(sum(case when ${promoEarnings.reversedAt} is not null then ${promoEarnings.amount} else 0 end),0)` }).from(promoEarnings).where(eq(promoEarnings.promoCode, code)).get()!;
    return { code, ...usage, ...earnings };
  });
  const url = new URL(request.url);
  const raw = url.searchParams.get("page") || "1";
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < 1) return privateJson({ error: "Invalid filters" }, 400);
  const total = db.select({ count: sql<number>`count(*)` }).from(promoEarnings).get()!.count;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(Number(raw), pages);
  const owners = alias(users, "promo_owners");
  const earnings = db.select({ orderId: promoEarnings.orderId, promoCode: promoEarnings.promoCode, paidAmount: promoEarnings.paidAmount, amount: promoEarnings.amount, createdAt: promoEarnings.createdAt, reversedAt: promoEarnings.reversedAt, creditedAt: promoEarnings.creditedAt, email: users.email, ownerEmail: owners.email }).from(promoEarnings).innerJoin(orders, eq(orders.id, promoEarnings.orderId)).innerJoin(users, eq(users.id, orders.userId)).leftJoin(owners, eq(owners.id, promoEarnings.ownerId)).orderBy(sql`${promoEarnings.createdAt} desc`, sql`${promoEarnings.orderId} desc`).limit(25).offset((page - 1) * 25).all();
  const personal = db.$client.prepare("SELECT (SELECT count(*) FROM personal_promos) AS codes, coalesce(sum(CASE WHEN credited_at IS NOT NULL AND reversed_at IS NULL THEN amount ELSE 0 END), 0) AS earned, coalesce(sum(CASE WHEN credited_at IS NULL AND reversed_at IS NULL THEN amount ELSE 0 END), 0) AS pending FROM promo_earnings WHERE owner_id IS NOT NULL").get();
  return privateJson({ codes, earnings, personal, page, pages, total });
});
