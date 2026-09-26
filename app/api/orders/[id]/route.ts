import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, orders, users } from "@/db/schema";
import { getCurrentUser } from "../../auth/auth-lib";

const fail = (error: string, status = 400) => Response.json({ error }, { status });
const statuses = ["new", "quoted", "awaiting_payment", "in_progress", "completed", "cancelled"] as const;

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = new URL(request.url).pathname.split("/").pop()!;
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found", 404);
  if (user.role !== "admin" && order.userId !== user.id) return fail("Forbidden", 403);
  const [client] = await db.select({ email: users.email }).from(users).where(eq(users.id, order.userId)).limit(1);
  const chat = await db.select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
    .from(messages).where(eq(messages.orderId, id)).orderBy(messages.createdAt).limit(200);
  return Response.json({ order: { ...order, clientEmail: client?.email }, messages: chat, currentUserId: user.id, role: user.role }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("Invalid origin", 403);
  const id = new URL(request.url).pathname.split("/").pop()!;
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return fail("Order not found", 404);
  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return fail("Invalid request"); }
  if (user.role !== "admin") {
    if (order.userId !== user.id || input.action !== "accept" || order.status !== "quoted") return fail("Forbidden", 403);
    await db.update(orders).set({ status: "awaiting_payment", updatedAt: Date.now() }).where(eq(orders.id, id));
    return Response.json({ ok: true });
  }
  const status = input.status;
  if (typeof status !== "string" || !statuses.includes(status as typeof statuses[number])) return fail("Invalid status");
  const price = input.quotedPrice === null || input.quotedPrice === "" ? null : Number(input.quotedPrice);
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 100000000)) return fail("Invalid price");
  const deadline = typeof input.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.deadline) ? input.deadline : null;
  if (status === "quoted" && (price === null || !deadline)) return fail("Price and deadline are required for a quote");
  await db.update(orders).set({ status: status as typeof statuses[number], quotedPrice: price, quotedCurrency: price === null ? null : "KZT", deadline, updatedAt: Date.now() }).where(eq(orders.id, id));
  return Response.json({ ok: true });
}
