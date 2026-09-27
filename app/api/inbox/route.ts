import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, orders, supportMessages, supportThreads, users } from "@/db/schema";
import { getCurrentUser } from "../auth/auth-lib";
import { privateJson, safeApi } from "../request-security";

async function GETHandler(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "admin") return privateJson({ error: "Admin account required" }, 403);
  const db = getDb();
  const orderChats = await db.select({
    id: orders.id, email: users.email, platform: orders.platform, service: orders.service,
    status: orders.status, createdAt: orders.createdAt,
    lastMessage: sql<string | null>`(select body from ${messages} where ${messages.orderId} = ${orders.id} order by ${messages.createdAt} desc limit 1)`,
    lastActivity: sql<number>`max(${orders.createdAt}, coalesce((select max(${messages.createdAt}) from ${messages} where ${messages.orderId} = ${orders.id}), 0))`.as("last_activity"),
  }).from(orders).innerJoin(users, eq(orders.userId, users.id)).orderBy(desc(sql`last_activity`)).limit(100);
  const supportChats = await db.select({
    id: supportThreads.id, email: users.email, status: supportThreads.status,
    lastActivity: supportThreads.updatedAt,
    lastMessage: sql<string | null>`(select body from ${supportMessages} where ${supportMessages.threadId} = ${supportThreads.id} order by ${supportMessages.createdAt} desc limit 1)`,
  }).from(supportThreads).innerJoin(users, eq(supportThreads.userId, users.id)).orderBy(desc(supportThreads.updatedAt)).limit(100);
  return privateJson({ orderChats, supportChats });
}

export const GET = safeApi(GETHandler);
