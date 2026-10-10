import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { getDb } from "@/db";
import { messages, supportMessages, supportThreads, users } from "@/db/schema";
import { openChat, sealChat } from "@/lib/chat-vault.mjs";

export async function readChatPage(kind: "order" | "support", parentId: string, request: Request) {
  const table = kind === "order" ? messages : supportMessages;
  const parent = kind === "order" ? messages.orderId : supportMessages.threadId;
  const query = new URL(request.url).searchParams;
  const after = query.get("after");
  const before = query.get("before");
  if (after !== null && before !== null) return null;
  const cursor = after ?? before;
  const match = cursor?.match(/^(\d{1,16}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
  if (cursor !== null && (!match || !Number.isSafeInteger(Number(match[1])))) return null;
  const compare = after !== null ? gt : lt;
  const cutoff = match ? or(compare(table.createdAt, Number(match[1])), and(eq(table.createdAt, Number(match[1])), compare(table.id, match[2]))) : undefined;
  const direction = after !== null ? asc : desc;
  const rows = await getDb().select({ id: table.id, senderId: table.senderId, senderRole: users.role, body: table.body, encrypted: table.encrypted, createdAt: table.createdAt })
    .from(table).innerJoin(users, eq(table.senderId, users.id)).where(and(eq(parent, parentId), cutoff)).orderBy(direction(table.createdAt), direction(table.id)).limit(51);
  const visible = after !== null ? rows.slice(0, 50) : rows.slice(0, 50).reverse();
  const page = visible.map(({ encrypted, ...row }) => ({ ...row, body: openChat(kind, parentId, row.id, row.body, encrypted) }));
  const latest = page.at(-1);
  return { messages: page, nextCursor: after === null && rows.length > 50 ? `${page[0].createdAt}:${page[0].id}` : null, latestCursor: latest ? `${latest.createdAt}:${latest.id}` : null, hasMore: after !== null && rows.length > 50 };
}

export function saveChatMessage(kind: "order" | "support", parentId: string, senderId: string, body: string) {
  const table = kind === "order" ? messages : supportMessages;
  const parent = kind === "order" ? messages.orderId : supportMessages.threadId;
  return getDb().transaction(tx => {
    const last = tx.select({ createdAt: table.createdAt }).from(table).where(eq(parent, parentId)).orderBy(desc(table.createdAt)).limit(1).get();
    const createdAt = Math.max(Date.now(), (last?.createdAt ?? 0) + 1);
    const message = { id: crypto.randomUUID(), senderId, body, createdAt };
    const sealed = { ...message, body: sealChat(kind, parentId, message.id, body), encrypted: true };
    if (kind === "order") tx.insert(messages).values({ ...sealed, orderId: parentId }).run();
    else {
      tx.insert(supportMessages).values({ ...sealed, threadId: parentId }).run();
      tx.update(supportThreads).set({ status: "open", updatedAt: createdAt }).where(eq(supportThreads.id, parentId)).run();
    }
    const sender = tx.select({ role: users.role }).from(users).where(eq(users.id, senderId)).get();
    return { ...message, senderRole: sender?.role };
  });
}
