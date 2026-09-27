import { and, desc, eq, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, supportMessages } from "@/db/schema";

export async function readChatPage(kind: "order" | "support", parentId: string, request: Request) {
  const table = kind === "order" ? messages : supportMessages;
  const parent = kind === "order" ? messages.orderId : supportMessages.threadId;
  const cursor = new URL(request.url).searchParams.get("before");
  const match = cursor?.match(/^(\d{1,16}):([0-9a-f-]{36})$/);
  if (cursor && (!match || !Number.isSafeInteger(Number(match[1])))) return null;
  const cutoff = match ? or(lt(table.createdAt, Number(match[1])), and(eq(table.createdAt, Number(match[1])), lt(table.id, match[2]))) : undefined;
  const rows = await getDb().select({ id: table.id, senderId: table.senderId, body: table.body, createdAt: table.createdAt })
    .from(table).where(and(eq(parent, parentId), cutoff)).orderBy(desc(table.createdAt), desc(table.id)).limit(51);
  const page = rows.slice(0, 50).reverse();
  return { messages: page, nextCursor: rows.length > 50 ? `${page[0].createdAt}:${page[0].id}` : null };
}
