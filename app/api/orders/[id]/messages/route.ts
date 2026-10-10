import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { saveChatMessage, validMessageId } from "../../../chat-history";
import { getCurrentUser } from "../../../auth/auth-lib";
import { chargeAttempt, rateKey } from "../../../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../../request-security";

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return privateJson({ error: "Invalid origin" }, 403);
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  const id = new URL(request.url).pathname.split("/").at(-2)!;
  const [order] = await getDb().select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order || (user.role !== "admin" && order.userId !== user.id)) return privateJson({ error: "Order not found" }, 404);
  const input = await jsonInput(request, 16384);
  if (!input) return privateJson({ error: "Invalid request" }, 400);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || body.length > 2000) return privateJson({ error: "Message must be 1–2000 characters" }, 400);
  if (input.clientId !== undefined && !validMessageId(input.clientId)) return privateJson({ error: "Invalid request" }, 400);
  const retry = await chargeAttempt(await rateKey("message", null, user.id), 30, 5 * 60_000);
  if (retry) return privateJson({ error: "Too many messages. Try again later" }, 429, { "Retry-After": String(retry) });
  const message = saveChatMessage("order", id, user.id, body, input.clientId as string | undefined);
  if (!message) return privateJson({ error: "Message reference already used" }, 409);
  return privateJson({ ok: true, message }, 201);
}

export const POST = safeApi(POSTHandler);
