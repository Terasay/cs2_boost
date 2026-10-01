import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, orders, supportMessages, supportThreads, users } from "@/db/schema";
import { getCurrentUser } from "../auth/auth-lib";
import { privateJson, safeApi } from "../request-security";
import { listQuery, orderReply, supportReply, searchCondition } from "../list-query";

export const GET = safeApi(async request => {
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "admin") return privateJson({ error: "Admin account required" }, 403);
  const query = listQuery(request);
  const kind = new URL(request.url).searchParams.get("kind") || "all";
  if (!query || !["all", "orders", "support"].includes(kind)) return privateJson({ error: "Invalid filters" }, 400);
  const db = getDb();
  const orderFilter = and(searchCondition(query.q, "order"), query.reply ? sql`${orderReply} = 1` : undefined);
  const supportFilter = and(searchCondition(query.q, "support"), query.reply ? sql`${supportReply} = 1` : undefined);
  const [{ total: orderTotal }] = db.select({ total: sql<number>`count(*)` }).from(orders).innerJoin(users, eq(orders.userId, users.id)).where(orderFilter).all();
  const [{ total: supportTotal }] = db.select({ total: sql<number>`count(*)` }).from(supportThreads).innerJoin(users, eq(supportThreads.userId, users.id)).where(supportFilter).all();
  const total = kind === "support" ? supportTotal : orderTotal;
  const pages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pages);
  const offset = (page - 1) * query.pageSize;
  const orderChats = kind === "support" ? [] : db.select({
    id: orders.id, email: users.email, platform: orders.platform, service: orders.service, status: orders.status,
    createdAt: orders.createdAt, needsReply: orderReply,
    lastMessage: sql<string | null>`(select body from ${messages} where ${messages.orderId} = ${orders.id} order by ${messages.createdAt} desc, ${messages.id} desc limit 1)`,
    lastActivity: sql<number>`max(${orders.updatedAt}, coalesce((select max(${messages.createdAt}) from ${messages} where ${messages.orderId} = ${orders.id}), 0))`.as("last_activity"),
  }).from(orders).innerJoin(users, eq(orders.userId, users.id)).where(orderFilter).orderBy(desc(sql`last_activity`), desc(orders.id)).limit(query.pageSize).offset(offset).all();
  const supportChats = kind === "orders" ? [] : db.select({
    id: supportThreads.id, email: users.email, status: supportThreads.status, needsReply: supportReply,
    lastActivity: supportThreads.updatedAt,
    lastMessage: sql<string | null>`(select body from ${supportMessages} where ${supportMessages.threadId} = ${supportThreads.id} order by ${supportMessages.createdAt} desc, ${supportMessages.id} desc limit 1)`,
  }).from(supportThreads).innerJoin(users, eq(supportThreads.userId, users.id)).where(supportFilter).orderBy(desc(supportThreads.updatedAt), desc(supportThreads.id)).limit(query.pageSize).offset(offset).all();
  return privateJson({ orderChats, supportChats, total, page, pages, pageSize: query.pageSize, totals: { orders: orderTotal, support: supportTotal } });
});

