import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { supportThreads, users } from "@/db/schema";
import { getCurrentUser } from "../../auth/auth-lib";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../request-security";

import { readChatPage } from "../../chat-history";

const fail = (error: string, status = 400) => privateJson({ error }, status);

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = new URL(request.url).pathname.split("/").pop()!;
  const db = getDb();
  const [thread] = await db.select().from(supportThreads).where(eq(supportThreads.id, id)).limit(1);
  if (!thread || (user.role !== "admin" && thread.userId !== user.id)) return fail("Conversation not found", 404);
  const [client] = await db.select({ email: users.email }).from(users).where(eq(users.id, thread.userId)).limit(1);
  const chat = await readChatPage("support", id, request);
  if (!chat) return fail("Invalid cursor");
  return privateJson({ thread: { ...thread, clientEmail: client?.email }, ...chat, currentUserId: user.id, role: user.role });
}

async function PATCHHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "admin") return fail("Admin account required", 403);
  const id = new URL(request.url).pathname.split("/").pop()!;
  const input = await jsonInput(request);
  if (!input || (input.status !== "open" && input.status !== "closed")) return fail("Invalid status");
  const updated = await getDb().update(supportThreads).set({ status: input.status, updatedAt: Date.now() }).where(eq(supportThreads.id, id)).returning({ id: supportThreads.id });
  if (!updated.length) return fail("Conversation not found", 404);
  return privateJson({ ok: true });
}

export const GET = safeApi(GETHandler);
export const PATCH = safeApi(PATCHHandler);
