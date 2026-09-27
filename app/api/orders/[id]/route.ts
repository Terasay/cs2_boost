import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders, users } from "@/db/schema";
import { getCurrentUser } from "../../auth/auth-lib";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../request-security";

import { readChatPage } from "../../chat-history";
import { validDate } from "@/lib/order-validation";

const fail = (error: string, status = 400) => privateJson({ error }, status);
const statuses = ["new", "quoted", "awaiting_payment", "in_progress", "completed", "cancelled"] as const;

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = new URL(request.url).pathname.split("/").pop()!;
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found", 404);
  if (user.role !== "admin" && order.userId !== user.id) return fail("Order not found", 404);
  const [client] = await db.select({ email: users.email }).from(users).where(eq(users.id, order.userId)).limit(1);
  const chat = await readChatPage("order", id, request);
  if (!chat) return fail("Invalid cursor");
  return privateJson({ order: { ...order, clientEmail: client?.email }, ...chat, currentUserId: user.id, role: user.role });
}

async function PATCHHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = new URL(request.url).pathname.split("/").pop()!;
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found", 404);
  if (user.role !== "admin" && order.userId !== user.id) return fail("Order not found", 404);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  if (typeof input.updatedAt !== "number" || input.updatedAt !== order.updatedAt) return fail("Order changed. Refresh and review the latest terms", 409);
  const updatedAt = Math.max(Date.now(), order.updatedAt + 1);
  if (user.role !== "admin") {
    if (input.action !== "accept" || order.status !== "quoted") return fail("Order cannot be accepted", 409);
    const updated = await db.update(orders).set({ status: "awaiting_payment", updatedAt }).where(and(eq(orders.id, id), eq(orders.userId, user.id), eq(orders.status, "quoted"), eq(orders.updatedAt, input.updatedAt))).returning({ id: orders.id });
    if (!updated.length) return fail("Order cannot be accepted", 409);
    return privateJson({ ok: true });
  }
  const status = input.status;
  if (typeof status !== "string" || !statuses.includes(status as typeof statuses[number])) return fail("Invalid status");
  if (input.quotedPrice !== null && typeof input.quotedPrice !== "number" && typeof input.quotedPrice !== "string") return fail("Invalid price");
  if (typeof input.quotedPrice === "string" && input.quotedPrice !== "" && !/^\d+$/.test(input.quotedPrice)) return fail("Invalid price");
  const price = input.quotedPrice === null || input.quotedPrice === "" ? null : Number(input.quotedPrice);
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 100000000)) return fail("Invalid price");
  if (input.deadline && !validDate(input.deadline)) return fail("Invalid deadline");
  const deadline = validDate(input.deadline) ? input.deadline : null;
  if (status === "quoted" && (price === null || !deadline)) return fail("Price and deadline are required for a quote");
  const updated = await db.update(orders).set({ status: status as typeof statuses[number], quotedPrice: price, quotedCurrency: price === null ? null : "KZT", deadline, updatedAt }).where(and(eq(orders.id, id), eq(orders.updatedAt, input.updatedAt))).returning({ id: orders.id });
  if (!updated.length) return fail("Order changed. Refresh and review the latest terms", 409);
  return privateJson({ ok: true });
}

export const GET = safeApi(GETHandler);
export const PATCH = safeApi(PATCHHandler);
