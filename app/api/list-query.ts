import { sql } from "drizzle-orm";
import { messages, orders, supportMessages, supportThreads, users } from "@/db/schema";

export const orderStatuses = ["new", "quoted", "awaiting_payment", "awaiting_access", "in_progress", "completed", "cancelled"] as const;
export const orderReply = sql<number>`coalesce((select ${messages.senderId} from ${messages} where ${messages.orderId} = ${orders.id} order by ${messages.createdAt} desc, ${messages.id} desc limit 1) = ${orders.userId}, 0)`;
export const supportReply = sql<number>`coalesce((select ${supportMessages.senderId} from ${supportMessages} where ${supportMessages.threadId} = ${supportThreads.id} order by ${supportMessages.createdAt} desc, ${supportMessages.id} desc limit 1) = ${supportThreads.userId}, 0)`;

export function listQuery(request: Request) {
  const query = new URL(request.url).searchParams;
  const rawPage = query.get("page") || "1";
  const q = (query.get("q") || "").trim().toLowerCase();
  const status = query.get("status") || "";
  const platform = query.get("platform") || "";
  const reply = query.get("reply") || "";
  if (!/^\d{1,6}$/.test(rawPage) || Number(rawPage) < 1 || q.length > 120 || (status && !orderStatuses.some(value => value === status)) || (platform && !["premier", "faceit"].includes(platform)) || (reply && reply !== "1")) return null;
  return { page: Number(rawPage), pageSize: 25, q, status: status as typeof orderStatuses[number] | "", platform: platform as "premier" | "faceit" | "", reply: reply === "1" };
}

export function searchCondition(q: string, kind: "order" | "support") {
  const id = kind === "order" ? orders.id : supportThreads.id;
  return q ? sql`(instr(lower(${users.email}), ${q}) > 0 or instr(lower(${id}), ${q.replace(/^#/, "")}) > 0)` : undefined;
}
