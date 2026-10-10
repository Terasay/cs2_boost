import { ratingValue } from "@/lib/order-validation";
import { calculatePrice } from "@/lib/pricing.mjs";
import { cleanAttribution } from "@/lib/attribution.mjs";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { orders, users } from "@/db/schema";
import { getCurrentUser } from "../auth/auth-lib";
import { chargeAttempt, rateKey } from "../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../request-security";
import { listQuery, orderReply, searchCondition } from "../list-query";

const fail = (error: string, status = 400) => privateJson({ error }, status);

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const db = getDb();
  const query = listQuery(request);
  if (!query) return fail("Invalid filters");
  const scope = user.role === "admin" ? undefined : eq(orders.userId, user.id);
  const filter = and(scope, searchCondition(query.q, "order"), query.status ? eq(orders.status, query.status) : undefined, query.platform ? eq(orders.platform, query.platform) : undefined, query.reply ? sql`${orderReply} = 1` : undefined);
  const [{ total }] = db.select({ total: sql<number>`count(*)` }).from(orders).innerJoin(users, eq(orders.userId, users.id)).where(filter).all();
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pages);
  const [summary] = db.select({ total: sql<number>`count(*)`, fresh: sql<number>`coalesce(sum(${orders.status} = 'new'), 0)`, active: sql<number>`coalesce(sum(${orders.status} = 'in_progress'), 0)`, waiting: sql<number>`coalesce(sum(${orderReply}), 0)` }).from(orders).where(scope).all();
  const all = await db.select({
    id: orders.id, platform: orders.platform, service: orders.service, method: orders.method,
    currentRating: orders.currentRating, targetRating: orders.targetRating, status: orders.status,
    quotedPrice: orders.quotedPrice, quotedCurrency: orders.quotedCurrency, deadline: orders.deadline,
    totalAmount: orders.totalAmount, promoCode: orders.promoCode, durationDays: orders.durationDays, dueAt: orders.dueAt,
    createdAt: orders.createdAt, email: users.email, needsReply: orderReply,
  }).from(orders).innerJoin(users, eq(orders.userId, users.id))
    .where(filter).orderBy(desc(orders.createdAt), desc(orders.id)).limit(query.pageSize).offset((page - 1) * query.pageSize);
  return privateJson({ orders: all, total, page, pages, pageSize: query.pageSize, summary });
}

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "client") return fail("Client account required", 403);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const { platform, service, method } = input;
  if (platform !== "premier" && platform !== "faceit") return fail("Choose a platform");
  if (service !== "rating" && service !== "calibration") return fail("Choose a service");
  if (method !== "duo" && method !== "piloted") return fail("Choose a method");
  if (input.riskAccepted !== true) return fail("Risk acknowledgement is required");
  let price;
  try { price = calculatePrice({ platform, service, current: input.current as number | null, target: input.target as number | null, promoCode: input.promoCode as string | null, redTrust: input.redTrust as boolean | undefined }); }
  catch (error) { return fail(error instanceof Error ? error.message : "Invalid price"); }
  if (input.expectedTotalAmount !== undefined && input.expectedTotalAmount !== price.totalAmount) return fail("Price changed. Review the calculator", 409);
  let currentRating: number | null = null, targetRating: number | null = null;
  if (service === "rating") {
    currentRating = ratingValue(input.current);
    targetRating = ratingValue(input.target);
    if (currentRating === null || targetRating === null) return fail("Enter valid ratings");
  }
  const retry = await chargeAttempt(await rateKey("order", null, user.id), 10, 60 * 60_000);
  if (retry) return fail("Too many requests. Try again later", 429);
  const now = Date.now();
  const id = crypto.randomUUID();
  const attribution = cleanAttribution(input.attribution);
  await getDb().insert(orders).values({ id, userId: user.id, platform, service, method, currentRating, targetRating, status: "new", pricingVersion: price.pricingVersion, redTrust: price.redTrust, promoCode: price.promoCode, baseAmount: price.baseAmount, surchargeAmount: price.surchargeAmount, discountAmount: price.discountAmount, totalAmount: price.totalAmount, initialTotalAmount: price.totalAmount, commissionAmount: price.commissionAmount, durationDays: price.durationDays, standardDays: price.durationDays, quotedCurrency: "RUB", source: attribution?.source ?? null, medium: attribution?.medium ?? null, campaign: attribution?.campaign ?? null, campaignContent: attribution?.content ?? null, riskAcceptedAt: now, createdAt: now, updatedAt: now });
  return privateJson({ id }, 201);
}

export const GET = safeApi(GETHandler);
export const POST = safeApi(POSTHandler);
