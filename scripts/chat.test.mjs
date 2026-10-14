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

const supportPage = (userId, threadId, messages) => ({ currentUserId: userId, thread: { id: threadId }, messages, nextCursor: null, latestCursor: messages.length ? cursor(messages.at(-1)) : null, hasMore: false });

test("switching support accounts discards the previous user's messages and cursor", async () => {
  const previous = supportPage("client-a", "thread-a", [message(100)]);
  const fresh = { ...supportPage("client-b", "thread-b", [message(1)]), nextCursor: "new-history" };
  const requested = [];
  let cleared = false;
  const result = await refreshChat("/api/support", previous.latestCursor, async url => {
    requested.push(url);
    if (url.includes("after=")) return supportPage("client-b", "thread-b", []);
    assert.equal(cleared, true, "Old private data must be cleared before loading the new conversation");
    return fresh;
  }, { previousPage: previous, onConversationChange: () => { cleared = true; } });
  assert.equal(requested.length, 2);
  assert.equal(requested[1], "/api/support");
  assert.equal(result.cursor, fresh.latestCursor);
  assert.deepEqual(mergeChatPages(previous, result.page), fresh);
});

test("chat merging isolates both account and conversation identity", () => {
  const previous = supportPage("client-a", "thread-a", [message(1)]);
  for (const next of [supportPage("client-b", "thread-a", [message(2)]), supportPage("client-a", "thread-b", [message(2)])]) {
    assert.deepEqual(mergeChatPages(previous, next), next);
  }
  const order = { currentUserId: "admin", order: { id: "order-a" }, messages: [message(1)], nextCursor: null };
  const otherOrder = { ...order, order: { id: "order-b" }, messages: [message(2)] };
  assert.deepEqual(mergeChatPages(order, otherOrder), otherOrder);
});

test("a session change between chat pages restarts without retaining either partial backlog", async () => {
  const previous = supportPage("client-a", "thread-a", [message(0)]);
  const fresh = supportPage("client-b", "thread-b", [message(3)]);
  let calls = 0, resets = 0;
  const result = await refreshChat("/api/support", previous.latestCursor, async url => {
    calls++;
    if (calls === 1) return { ...supportPage("client-a", "thread-a", [message(1)]), hasMore: true };
    if (calls === 2) return { ...supportPage("client-b", "thread-b", [message(2)]), hasMore: true };
    assert.equal(url, "/api/support");
    return fresh;
  }, { previousPage: previous, onConversationChange: () => { resets++; } });
  assert.equal(resets, 1);
  assert.equal(calls, 3);
  assert.deepEqual(result.page, fresh);
});

test("old private data stays cleared when loading the changed conversation fails", async () => {
  for (const status of [401, 403, 404, 503]) {
    const previous = supportPage("client-a", "thread-a", [message(1)]);
    let displayed = previous;
    let calls = 0;
    const failure = Object.assign(new Error("Request failed"), { status });
    await assert.rejects(refreshChat("/api/support", previous.latestCursor, async () => {
      if (++calls === 1) return supportPage("client-b", "thread-b", []);
      assert.equal(displayed, null);
      throw failure;
    }, { previousPage: previous, onConversationChange: () => { displayed = null; } }), error => error === failure);
    assert.equal(displayed, null);
  }
});
