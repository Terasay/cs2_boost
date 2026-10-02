import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportThreads } from "@/db/schema";
import { getCurrentUser } from "../auth/auth-lib";
import { chargeAttempt, rateKey } from "../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../request-security";

import { readChatPage, saveChatMessage } from "../chat-history";

const fail = (error: string, status = 400) => privateJson({ error }, status);

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "client") return fail("Client account required", 403);
  const db = getDb();
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.userId, user.id)).limit(1);
  const chat = thread ? await readChatPage("support", thread.id, request) : { messages: [], nextCursor: null };
  if (!chat) return fail("Invalid cursor");
  return privateJson({ thread: thread ?? null, ...chat, currentUserId: user.id, role: user.role });
}

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "client") return fail("Client account required", 403);
  const input = await jsonInput(request, 16384);
  if (!input) return fail("Invalid request");
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body || body.length > 2000) return fail("Message must be 1–2000 characters");
  const retry = await chargeAttempt(await rateKey("support-message", null, user.id), 30, 5 * 60_000);
  if (retry) return privateJson({ error: "Too many messages. Try again later" }, 429, { "Retry-After": String(retry) });
  const db = getDb();
  const now = Date.now();
  await db.insert(supportThreads).values({ id: crypto.randomUUID(), userId: user.id, status: "open", createdAt: now, updatedAt: now }).onConflictDoNothing();
  const [thread] = await db.select({ id: supportThreads.id }).from(supportThreads).where(eq(supportThreads.userId, user.id)).limit(1);
  if (!thread) return fail("Support unavailable", 503);
  const message = saveChatMessage("support", thread.id, user.id, body);
  return privateJson({ id: thread.id, message }, 201);
}

export const GET = safeApi(GETHandler);
export const POST = safeApi(POSTHandler);
