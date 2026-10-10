import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { orderAccess, orderEvents, orders, paymentIntents, promoEarnings, users } from "@/db/schema";
import { getCurrentUser } from "../../auth/auth-lib";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../request-security";
import { readChatPage } from "../../chat-history";
import { dayMs, discountedAmount } from "@/lib/pricing.mjs";
import { orderPaymentStatus } from "../../payments/donationalerts/service";

const fail = (error: string, status = 400) => privateJson({ error }, status);
const orderId = (request: Request) => new URL(request.url).pathname.split("/").pop()!;

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = orderId(request);
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order || (user.role !== "admin" && order.userId !== user.id)) return fail("Order not found", 404);
  const client = db.select({ email: users.email }).from(users).where(eq(users.id, order.userId)).get();
  const chat = await readChatPage("order", id, request);
  if (!chat) return fail("Invalid cursor");
  const access = db.select({ submittedAt: orderAccess.createdAt, expiresAt: orderAccess.expiresAt, receivedAt: orderAccess.receivedAt }).from(orderAccess).where(and(eq(orderAccess.orderId, id), gt(orderAccess.expiresAt, Date.now()))).get();
  const events = db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(desc(orderEvents.createdAt), desc(orderEvents.id)).limit(50).all().map(event => ({ id: event.id, type: event.type, details: JSON.parse(event.details), createdAt: event.createdAt }));
  return privateJson({ order: { ...order, clientEmail: client?.email }, access: access ?? null, payment: orderPaymentStatus(id), events, ...chat, currentUserId: user.id, role: user.role });
}

async function PATCHHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const id = orderId(request);
  const db = getDb();
  return db.transaction(tx => {
    const order = tx.select().from(orders).where(eq(orders.id, id)).get();
    if (!order || (user.role !== "admin" && order.userId !== user.id)) return fail("Order not found", 404);
    if (!Number.isSafeInteger(input.updatedAt) || input.updatedAt !== order.updatedAt) return fail("Order changed. Refresh and review the latest terms", 409);
    const action = input.action;
    const reviewing = tx.select().from(paymentIntents).where(and(eq(paymentIntents.orderId, id), eq(paymentIntents.status, "review"))).get();
    if (reviewing && ["propose", "cancel"].includes(String(action))) return fail("Review the matched payment first", 409);
    const admin = user.role === "admin";
    const now = Date.now();
    const changes: Partial<typeof orders.$inferInsert> = { updatedAt: Math.max(now, order.updatedAt + 1) };
    const reason = typeof input.reason === "string" ? input.reason.trim() : "";
    let details: Record<string, unknown> = {};
    if (action === "accept" && !admin) {
      if (order.status !== "quoted" || order.proposalAmount === null || order.proposalDays === null) return fail("Order cannot be accepted", 409);
      const price = discountedAmount(order.proposalAmount, order.promoCode);
      Object.assign(changes, price, { durationDays: order.proposalDays, status: "awaiting_payment", acceptedAt: now, proposalAmount: null, proposalDays: null, proposalReason: null });
      details = { ...price, durationDays: order.proposalDays, reason: order.proposalReason };
    } else if (action === "accept" && admin) {
      if (order.status !== "new" || (order.totalAmount === null && order.quotedPrice === null) || order.paidAt) return fail("Invalid order transition", 409);
      const durationDays = order.durationDays ?? (order.service === "rating" ? Math.ceil(((order.targetRating ?? 0) - (order.currentRating ?? 0)) / (order.platform === "premier" ? 1000 : 100)) : null);
      if (!durationDays || durationDays < 1) return fail("Offer a price and duration first", 409);
      Object.assign(changes, { status: "awaiting_payment", acceptedAt: now, totalAmount: order.totalAmount ?? order.quotedPrice! * 100, durationDays });
      details = { totalAmount: changes.totalAmount, durationDays };
    } else if (action === "propose" && admin) {
      if (!["new", "quoted", "awaiting_payment"].includes(order.status) || order.paidAt) return fail("Paid terms cannot be changed", 409);
      if (!Number.isSafeInteger(input.amount) || Number(input.amount) < 100 || Number(input.amount) > 10000000000) return fail("Invalid price");
      if (!Number.isInteger(input.days) || Number(input.days) < 1 || Number(input.days) > 1000) return fail("Invalid duration");
      if (reason.length < 3 || reason.length > 1000) return fail("Explain the change");
      Object.assign(changes, { status: "quoted", proposalAmount: input.amount, proposalDays: input.days, proposalReason: reason });
      details = { amount: input.amount, days: input.days, reason, ...discountedAmount(Number(input.amount), order.promoCode) };
    } else if (action === "confirm_payment" && admin) {
      if (order.status !== "awaiting_payment" || order.paidAt || !order.totalAmount || !order.durationDays) return fail("Invalid order transition", 409);
      if (input.receivedAmount !== order.totalAmount || input.confirmed !== true) return fail("Confirm the exact payment amount");
      if (input.paymentIntentId !== undefined) {
        const intent = reviewing;
        if (!intent || input.paymentIntentId !== intent.id || intent.orderRevision !== order.updatedAt || intent.amount !== order.totalAmount || intent.currency !== (order.quotedCurrency || "RUB")) return fail("Invalid payment confirmation", 409);
        tx.update(paymentIntents).set({ status: "confirmed", confirmedAt: now }).where(eq(paymentIntents.id, intent.id)).run();
      } else if (reviewing) return fail("Confirm the matched payment reference", 409);
      tx.update(paymentIntents).set({ status: "void" }).where(and(eq(paymentIntents.orderId, id), eq(paymentIntents.status, "pending"))).run();
      Object.assign(changes, { status: "awaiting_access", paidAt: now });
      if (order.promoCode) tx.insert(promoEarnings).values({ orderId: id, promoCode: order.promoCode, paidAmount: order.totalAmount, amount: order.commissionAmount, createdAt: now }).run();
      details = { amount: order.totalAmount, currency: order.quotedCurrency || "RUB", promoCode: order.promoCode, provider: input.paymentIntentId ? "donationalerts" : "manual", paymentIntentId: input.paymentIntentId ?? null };
    } else if (action === "reject_payment" && admin) {
      if (!reviewing || order.paidAt || order.status !== "awaiting_payment" || reason.length < 3 || reason.length > 1000) return fail("Invalid payment confirmation", 409);
      tx.update(paymentIntents).set({ status: "void" }).where(eq(paymentIntents.id, reviewing.id)).run();
      details = { reason, paymentIntentId: reviewing.id };
    } else if (action === "complete" && admin) {
      if (order.status !== "in_progress" || input.confirmed !== true) return fail("Invalid order transition", 409);
      Object.assign(changes, { status: "completed", completedAt: now });
      tx.delete(orderAccess).where(eq(orderAccess.orderId, id)).run();
    } else if (action === "delay" && admin) {
      if (order.status !== "in_progress" || !order.dueAt) return fail("Invalid order transition", 409);
      if (!Number.isInteger(input.days) || Number(input.days) < 1 || Number(input.days) > 30) return fail("Invalid duration");
      if (reason.length < 3 || reason.length > 1000) return fail("Explain the change");
      const bonus = typeof input.bonus === "string" ? input.bonus.trim() : "";
      if (bonus.length > 500) return fail("Invalid bonus");
      changes.dueAt = order.dueAt + Number(input.days) * dayMs;
      details = { reason, bonus, days: input.days, previousDueAt: order.dueAt, dueAt: changes.dueAt };
    } else if (action === "cancel") {
      if (!["new", "quoted", "awaiting_payment"].includes(order.status) || order.paidAt) return fail("Invalid order transition", 409);
      if (reason.length < 3 || reason.length > 1000) return fail("Explain the change");
      Object.assign(changes, { status: "cancelled", proposalAmount: null, proposalDays: null, proposalReason: null });
      details = { reason };
    } else if (action === "refund" && admin) {
      if (!order.paidAt || order.status === "cancelled" || input.confirmed !== true) return fail("Invalid order transition", 409);
      if (reason.length < 3 || reason.length > 1000) return fail("Explain the change");
      changes.status = "cancelled";
      tx.update(promoEarnings).set({ reversedAt: now }).where(eq(promoEarnings.orderId, id)).run();
      tx.delete(orderAccess).where(eq(orderAccess.orderId, id)).run();
      details = { reason, amount: order.totalAmount };
    } else return fail("Invalid order action");
    if (["propose", "cancel"].includes(String(action))) tx.update(paymentIntents).set({ status: "void" }).where(and(eq(paymentIntents.orderId, id), inArray(paymentIntents.status, ["pending", "review"]))).run();
    tx.update(orders).set(changes).where(eq(orders.id, id)).run();
    tx.insert(orderEvents).values({ id: crypto.randomUUID(), orderId: id, actorId: user.id, type: String(action), details: JSON.stringify(details), createdAt: now }).run();
    return privateJson({ ok: true });
  });
}

export const GET = safeApi(GETHandler);
export const PATCH = safeApi(PATCHHandler);
