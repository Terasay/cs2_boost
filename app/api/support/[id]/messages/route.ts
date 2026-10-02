import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportThreads } from "@/db/schema";
import { saveChatMessage } from "../../../chat-history";
import { getCurrentUser } from "../../../auth/auth-lib";
import { chargeAttempt, rateKey } from "../../../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../../request-security";

const fail = (error: string, status = 400) => privateJson({ error }, status);

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = new URL(request.url).pathname.split("/").at(-2)!;
  const db = getDb();
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.id, id)).limit(1);
  if (!thread || (user.role !== "admin" && thread.userId !== user.id)) return fail("Conversation not found", 404);
  const input = await jsonInput(request, 16384);
  if (!input) return fail("Invalid request");
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || body.length > 2000) return fail("Message must be 1–2000 characters");
  const retry = await chargeAttempt(await rateKey("support-message", null, user.id), 30, 5 * 60_000);
  if (retry) return privateJson({ error: "Too many messages. Try again later" }, 429, { "Retry-After": String(retry) });
  const message = saveChatMessage("support", id, user.id, body);
  return privateJson({ ok: true, message }, 201);
}

export const POST = safeApi(POSTHandler);
