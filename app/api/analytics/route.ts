import { desc, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { getCurrentUser } from "../auth/auth-lib";
import { privateJson, safeApi } from "../request-security";

export const GET = safeApi(async request => {
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "admin") return privateJson({ error: "Admin required" }, 403);
  const since = Date.now() - 30 * 86400000;
  const count = sql<number>`count(*)`;
  const completed = sql<number>`sum(case when ${orders.status} = 'completed' then 1 else 0 end)`;
  const active = sql<number>`sum(case when ${orders.status} = 'in_progress' then 1 else 0 end)`;
  const db = getDb();
  const rows = db.select({ source: orders.source, medium: orders.medium, campaign: orders.campaign, content: orders.campaignContent, requests: count, completed, active }).from(orders).where(gte(orders.createdAt, since)).groupBy(orders.source, orders.medium, orders.campaign, orders.campaignContent).orderBy(desc(count)).limit(50).all();
  const [total] = db.select({ requests: count, completed, active }).from(orders).where(gte(orders.createdAt, since)).all();
  return privateJson({ since, total: { requests: total.requests, completed: total.completed ?? 0, active: total.active ?? 0 }, rows });
});
