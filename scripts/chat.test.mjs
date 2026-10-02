import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeChatPages, refreshChat } from "../lib/chat-sync.ts";

const message = index => ({ id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`, createdAt: 1000 + index, senderId: "client", body: `Message ${index}` });
const cursor = item => `${item.createdAt}:${item.id}`;

test("reconnecting retrieves every missed message in bounded pages", async () => {
  const missed = Array.from({ length: 205 }, (_, index) => message(index + 1));
  let calls = 0;
  const result = await refreshChat("/api/orders/test", cursor(message(0)), async url => {
    calls++;
    const after = new URL(url, "https://example.test").searchParams.get("after");
    const index = after === cursor(message(0)) ? 0 : missed.findIndex(item => cursor(item) === after) + 1;
    const messages = missed.slice(index, index + 50);
    return { messages, nextCursor: null, latestCursor: cursor(messages.at(-1)), hasMore: index + 50 < missed.length };
  });
  assert.equal(calls, 5);
  assert.deepEqual(result.page.messages, missed);
  assert.equal(result.cursor, cursor(missed.at(-1)));
  const merged = mergeChatPages({ messages: [message(0)], nextCursor: "older-history" }, result.page);
  assert.equal(merged.messages.length, 206);
  assert.equal(merged.nextCursor, "older-history");
});

test("an initially empty conversation still catches up after more than fifty replies", async () => {
  const first = await refreshChat("/api/support", null, async () => ({ messages: [], nextCursor: null }));
  assert(first.cursor.startsWith("0:"));
  const rows = Array.from({ length: 60 }, (_, index) => message(index + 1));
  let offset = 0;
  const next = await refreshChat("/api/support", first.cursor, async () => {
    const messages = rows.slice(offset, offset + 50);
    offset += messages.length;
    return { messages, nextCursor: null, latestCursor: cursor(messages.at(-1)), hasMore: offset < rows.length };
  });
  assert.deepEqual(next.page.messages, rows);
  const unchanged = await refreshChat("/api/support", next.cursor, async () => ({ messages: [], nextCursor: null, latestCursor: null, hasMore: false }));
  assert.equal(unchanged.cursor, next.cursor);
});

test("large backlogs advance across refreshes without repeated or missing messages", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => message(index + 1));
  const read = async url => {
    const after = new URL(url, "https://example.test").searchParams.get("after");
    const index = after === cursor(message(0)) ? 0 : rows.findIndex(item => cursor(item) === after) + 1;
    const messages = rows.slice(index, index + 50);
    return { messages, nextCursor: null, latestCursor: messages.length ? cursor(messages.at(-1)) : null, hasMore: index + 50 < rows.length };
  };
  const first = await refreshChat("/api/orders/test", cursor(message(0)), read);
  assert.equal(first.page.messages.length, 250);
  const second = await refreshChat("/api/orders/test", first.cursor, read);
  const third = await refreshChat("/api/orders/test", second.cursor, read);
  const merged = mergeChatPages(mergeChatPages(first.page, second.page), third.page);
  assert.deepEqual(merged.messages, rows);
});
