import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, orders } from "@/db/schema";
import { getCurrentUser } from "../../../auth/auth-lib";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const id = new URL(request.url).pathname.split("/").at(-2)!;
  const [order] = await getDb().select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
  if (user.role !== "admin" && order.userId !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
  let input: { body?: unknown };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || body.length > 2000) return Response.json({ error: "Message must be 1–2000 characters" }, { status: 400 });
  await getDb().insert(messages).values({ id: crypto.randomUUID(), orderId: id, senderId: user.id, body, createdAt: Date.now() });
  return Response.json({ ok: true }, { status: 201 });
}
