import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { orders, paymentIntents, orderEvents, promoEarnings } from "@/db/schema";
import { enqueueOrderEvent } from "./notifications.mjs";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Order = typeof orders.$inferSelect;
type Invoice = typeof paymentIntents.$inferSelect;

export function confirmOrderPayment(tx: Transaction, order: Order, options: {
  actorId: string; origin: string; now: number; invoice?: Invoice; receiptId?: string; automatic?: boolean; wallet?: boolean;
}) {
  const { now, invoice } = options;
  if (order.status !== "awaiting_payment" || order.paidAt || !order.totalAmount || !order.durationDays) return false;
  if (invoice && (invoice.orderId !== order.id || !["pending", "review"].includes(invoice.status) || invoice.orderRevision !== order.updatedAt || invoice.amount !== order.totalAmount || invoice.currency !== (order.quotedCurrency || "RUB"))) return false;
  const updated = tx.update(orders).set({ status: "awaiting_access", paymentMethod: options.wallet ? "wallet" : invoice ? "donationalerts" : "manual", paidAt: now, updatedAt: Math.max(now, order.updatedAt + 1) }).where(and(eq(orders.id, order.id), eq(orders.updatedAt, order.updatedAt), eq(orders.status, "awaiting_payment"), isNull(orders.paidAt))).run();
  if (!updated.changes) return false;
  if (invoice) tx.update(paymentIntents).set({ status: "confirmed", matchedAt: invoice.matchedAt ?? now, confirmedAt: now }).where(eq(paymentIntents.id, invoice.id)).run();
  tx.update(paymentIntents).set({ status: "void" }).where(and(eq(paymentIntents.orderId, order.id), eq(paymentIntents.status, "pending"))).run();
  if (order.promoCode) tx.insert(promoEarnings).values({ orderId: order.id, promoCode: order.promoCode, paidAmount: order.totalAmount, amount: order.commissionAmount, ownerId: order.promoOwnerId, createdAt: now }).run();
  const eventId = crypto.randomUUID();
  const details = { amount: order.totalAmount, currency: order.quotedCurrency || "RUB", promoCode: order.promoCode, provider: options.wallet ? "wallet" : invoice ? "donationalerts" : "manual", paymentIntentId: invoice?.id ?? null, receiptId: options.receiptId ?? null, automatic: Boolean(options.automatic) };
  tx.insert(orderEvents).values({ id: eventId, orderId: order.id, actorId: options.actorId, type: "confirm_payment", details: JSON.stringify(details), createdAt: now }).run();
  enqueueOrderEvent(getDb().$client, { orderId: order.id, actorId: options.actorId, type: "confirm_payment", eventId, origin: options.origin, automatic: Boolean(options.automatic) });
  return true;
}
