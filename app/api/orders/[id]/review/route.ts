import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orderReviews, orders } from "@/db/schema";
import { claimPersonalPromo } from "@/lib/wallet.mjs";
import { getCurrentUser } from "../../../auth/auth-lib";
import { chargeAttempt, rateKey } from "../../../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../../request-security";

const orderId = (request: Request) => new URL(request.url).pathname.split("/").at(-2)!;

export const POST = safeApi(async request => {
  if (!sameOriginMutation(request)) return privateJson({ error: "Invalid origin" }, 403);
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "client") return privateJson({ error: "Only the order owner can review" }, 403);
  const input = await jsonInput(request);
  if (!input) return privateJson({ error: "Invalid request" }, 400);
  const authorName = typeof input.authorName === "string" ? input.authorName.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!Number.isInteger(input.rating) || Number(input.rating) < 1 || Number(input.rating) > 5 || authorName.length < 2 || authorName.length > 40 || /[\p{Cc}\p{Cf}<>@]/u.test(authorName) || body.length < 10 || body.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body)) return privateJson({ error: "Enter a rating, public nickname and 10–1500 character review" }, 400);
  if (await chargeAttempt(await rateKey("review", null, user.id), 20, 3600000)) return privateJson({ error: "Too many requests. Try again later" }, 429);
  return getDb().transaction(tx => {
    const id = orderId(request);
    const order = tx.select().from(orders).where(eq(orders.id, id)).get();
    if (!order || order.userId !== user.id) return privateJson({ error: "Order not found" }, 404);
    if (order.status !== "completed") return privateJson({ error: "Review available after order completion" }, 409);
    const existing = tx.select().from(orderReviews).where(eq(orderReviews.orderId, id)).get();
    if (input.updatedAt !== (existing?.updatedAt ?? null)) return privateJson({ error: "Review changed. Refresh and try again" }, 409);
    const now = Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1);
    const review = { id: existing?.id ?? crypto.randomUUID(), orderId: id, authorName, body, rating: Number(input.rating), published: existing?.published ?? true, createdAt: existing?.createdAt ?? now, updatedAt: now };
    tx.insert(orderReviews).values(review).onConflictDoUpdate({ target: orderReviews.orderId, set: { authorName, body, rating: review.rating, updatedAt: now } }).run();
    const promoCode = order.paidAt ? claimPersonalPromo(getDb().$client, user.id) : null;
    return privateJson({ review, promoCode }, existing ? 200 : 201);
  });
});

export const PATCH = safeApi(async request => {
  if (!sameOriginMutation(request)) return privateJson({ error: "Invalid origin" }, 403);
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "admin") return privateJson({ error: "Admin account required" }, 403);
  const input = await jsonInput(request);
  if (!input || typeof input.published !== "boolean" || !Number.isSafeInteger(input.updatedAt)) return privateJson({ error: "Invalid request" }, 400);
  return getDb().transaction(tx => {
    const review = tx.select().from(orderReviews).where(eq(orderReviews.orderId, orderId(request))).get();
    if (!review) return privateJson({ error: "Review not found" }, 404);
    if (review.updatedAt !== input.updatedAt) return privateJson({ error: "Review changed. Refresh and try again" }, 409);
    const updated = { ...review, published: Boolean(input.published), updatedAt: Math.max(Date.now(), review.updatedAt + 1) };
    tx.update(orderReviews).set({ published: updated.published, updatedAt: updated.updatedAt }).where(eq(orderReviews.id, review.id)).run();
    return privateJson({ review: updated });
  });
});
