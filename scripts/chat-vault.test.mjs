import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import Database from "better-sqlite3";
import { encryptExistingChats, openChat, sealChat } from "../lib/chat-vault.mjs";

test("message encryption binds ciphertext to the conversation and message", () => {
  const previous = process.env.ORDER_ACCESS_KEY;
  process.env.ORDER_ACCESS_KEY = randomBytes(32).toString("hex");
  try {
    const body = "Private message <script>alert(1)</script> Привет";
    const sealed = sealChat("order", "order-1", "message-1", body);
    assert(!sealed.includes(body));
    assert.notEqual(sealed, sealChat("order", "order-1", "message-1", body));
    assert.equal(openChat("order", "order-1", "message-1", sealed, true), body);
    assert.throws(() => openChat("order", "order-2", "message-1", sealed, true));
    assert.throws(() => openChat("order", "order-1", "message-2", sealed, true));
    assert.throws(() => openChat("support", "order-1", "message-1", sealed, true));
    const parts = sealed.split(".");
    const payload = Buffer.from(parts[3], "base64"); payload[0] ^= 1; parts[3] = payload.toString("base64");
    assert.throws(() => openChat("order", "order-1", "message-1", parts.join("."), true));
    process.env.ORDER_ACCESS_KEY = randomBytes(32).toString("hex");
    assert.throws(() => openChat("order", "order-1", "message-1", sealed, true));
  } finally { if (previous === undefined) delete process.env.ORDER_ACCESS_KEY; else process.env.ORDER_ACCESS_KEY = previous; }
});

test("existing messages migrate atomically and encryption is idempotent", () => {
  const previous = process.env.ORDER_ACCESS_KEY;
  const database = new Database(":memory:");
  database.exec("CREATE TABLE messages (id TEXT PRIMARY KEY, order_id TEXT, body TEXT, encrypted INTEGER DEFAULT 0); CREATE TABLE support_messages (id TEXT PRIMARY KEY, thread_id TEXT, body TEXT, encrypted INTEGER DEFAULT 0)");
  database.prepare("INSERT INTO messages(id,order_id,body) VALUES(?,?,?)").run("one", "order", "old order message");
  database.prepare("INSERT INTO support_messages(id,thread_id,body) VALUES(?,?,?)").run("two", "thread", "old support message");
  try {
    delete process.env.ORDER_ACCESS_KEY;
    assert.throws(() => encryptExistingChats(database));
    assert.equal(database.prepare("SELECT body FROM messages").get().body, "old order message");
    process.env.ORDER_ACCESS_KEY = randomBytes(32).toString("hex");
    assert.equal(encryptExistingChats(database), 2);
    const order = database.prepare("SELECT * FROM messages").get();
    const support = database.prepare("SELECT * FROM support_messages").get();
    assert.equal(order.encrypted, 1); assert.equal(support.encrypted, 1);
    assert.equal(openChat("order", "order", "one", order.body, order.encrypted), "old order message");
    assert.equal(openChat("support", "thread", "two", support.body, support.encrypted), "old support message");
    assert.equal(encryptExistingChats(database), 0);
    assert.equal(database.prepare("SELECT body FROM messages").get().body, order.body);
  } finally { database.close(); if (previous === undefined) delete process.env.ORDER_ACCESS_KEY; else process.env.ORDER_ACCESS_KEY = previous; }
});
