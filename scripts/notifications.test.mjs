import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, createHash } from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "node:path";
import { openAccess } from "../lib/order-access.mjs";
import { enqueueEmail, enqueueOrderEvent, enqueueChatReminder, markChatRead, processMailQueue, reserveMailSlot } from "../lib/notifications.mjs";

process.env.ORDER_ACCESS_KEY = randomBytes(32).toString("hex");
process.env.RESEND_API_KEY = "re_local_test_only";
process.env.MAIL_FROM = "noreply@cs2-boosts.ru";
process.env.EMAIL_NOTIFICATIONS = "1";
process.env.MAIL_DAILY_LIMIT = "90";
const origin = "https://boost.example";
const hash = value => createHash("sha256").update(value).digest("hex");

function fixture(t) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys=ON");
  migrate(drizzle(db), { migrationsFolder: resolve("drizzle") });
  t.after(() => db.close());
  const now = Date.now();
  for (const [id, role, verified] of [["client", "client", now], ["admin", "admin", now], ["other", "client", now], ["legacy", "admin", null]]) {
    db.prepare("INSERT INTO users(id,email,password_hash,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?)").run(id, `${id}@example.test`, "test-only", role, now, verified);
  }
  db.prepare("INSERT INTO orders(id,user_id,platform,service,method,risk_accepted_at,created_at,updated_at) VALUES('order','client','premier','rating','duo',?,?,?)").run(now, now, now);
  db.prepare("INSERT INTO support_threads(id,user_id,created_at,updated_at) VALUES('support','client',?,?)").run(now, now);
  const letters = [];
  const send = async letter => { letters.push(letter); return "synthetic-delivery"; };
  const job = (key, options = {}) => enqueueEmail(db, { key, userId: "client", kind: "order", parentId: "order", now, availableAt: now, letter: { subject: "Order update", text: "Safe account link" }, ...options });
  const message = (sender, at, kind = "order") => {
    const table = kind === "order" ? "messages" : "support_messages";
    const parent = kind === "order" ? "order_id" : "thread_id";
    db.prepare(`INSERT INTO ${table}(id,${parent},sender_id,body,created_at) VALUES(?,?,?,?,?)`).run(crypto.randomUUID(), kind, sender, "Private chat body", at);
    enqueueChatReminder(db, { kind, parentId: kind, senderId: sender, origin, now: at });
  };
  return { db, now, letters, send, job, message };
}

test("queued content is encrypted, bound to its ID, and cleared after delivery", async t => {
  const f = fixture(t);
  f.job("first", { letter: { subject: "Secret subject", text: "Private reset link" } });
  const row = f.db.prepare("SELECT * FROM mail_outbox").get();
  assert(!row.payload.includes("Private reset link"));
  assert.throws(() => openAccess("mail:wrong-id", row.payload));
  assert.equal(openAccess(`mail:${row.id}`, row.payload).text, "Private reset link");
  assert.equal((await processMailQueue(f.db, { now: f.now, send: f.send })).sent, 1);
  assert.equal(f.db.prepare("SELECT payload FROM mail_outbox").get().payload, null);
  assert.match(f.letters[0].idempotencyKey, /^mail-[0-9a-f]{64}$/);
});

test("order updates reach the opposite party once and respect verified addresses and preferences", async t => {
  const f = fixture(t);
  const event = { orderId: "order", actorId: "client", type: "new", eventId: "created", origin };
  enqueueOrderEvent(f.db, event); enqueueOrderEvent(f.db, event);
  assert.deepEqual(f.db.prepare("SELECT recipient FROM mail_outbox").all(), [{ recipient: "admin@example.test" }]);
  f.db.prepare("INSERT INTO notification_preferences(user_id,language,order_updates) VALUES('client','en',0)").run();
  enqueueOrderEvent(f.db, { ...event, actorId: "admin", type: "accept", eventId: "accepted" });
  assert.equal(f.db.prepare("SELECT count(*) n FROM mail_outbox").get().n, 1);
  f.db.prepare("UPDATE notification_preferences SET order_updates=1 WHERE user_id='client'").run();
  enqueueOrderEvent(f.db, { ...event, actorId: "admin", type: "accept", eventId: "accepted" });
  await processMailQueue(f.db, { now: Date.now() + 1, send: f.send });
  assert.equal(f.letters.length, 2);
  assert.match(f.letters.find(l => l.to === "client@example.test").subject, /Order terms accepted/);
});

test("automatic payment confirmation notifies the client and verified admins once", async t => {
  const f = fixture(t);
  const event = { orderId: "order", actorId: "client", type: "confirm_payment", eventId: "automatic-paid", origin, automatic: true };
  enqueueOrderEvent(f.db, event); enqueueOrderEvent(f.db, event);
  assert.deepEqual(f.db.prepare("SELECT recipient FROM mail_outbox ORDER BY recipient").all(), [{ recipient: "admin@example.test" }, { recipient: "client@example.test" }]);
  await processMailQueue(f.db, { now: Date.now() + 1, send: f.send });
  assert.equal(f.letters.length, 2);
});

test("chat bursts wait five minutes and send one generic reminder", async t => {
  const f = fixture(t);
  f.message("admin", f.now); f.message("admin", f.now + 1);
  assert.equal(f.db.prepare("SELECT count(*) n FROM mail_outbox").get().n, 1);
  assert.equal((await processMailQueue(f.db, { now: f.now + 299999, send: f.send })).sent, 0);
  assert.equal((await processMailQueue(f.db, { now: f.now + 300000, send: f.send })).sent, 1);
  assert(!JSON.stringify(f.letters).includes("Private chat body"));
  f.message("admin", f.now + 400000);
  await processMailQueue(f.db, { now: f.now + 900000, send: f.send });
  assert.equal(f.letters.length, 1);
  markChatRead(f.db, "order", "order", "client", f.now + 400000);
  f.message("admin", f.now + 500000);
  await processMailQueue(f.db, { now: f.now + 900000, send: f.send });
  assert.equal(f.letters.length, 2);
});

test("reading chat cancels its reminder and read watermarks never move backwards", async t => {
  const f = fixture(t);
  f.message("admin", f.now, "support");
  markChatRead(f.db, "support", "support", "client", f.now);
  markChatRead(f.db, "support", "support", "client", f.now - 10);
  assert.equal(f.db.prepare("SELECT read_at FROM chat_reads").get().read_at, f.now);
  const result = await processMailQueue(f.db, { now: f.now + 300000, send: f.send });
  assert.equal(result.skipped, 1); assert.equal(f.letters.length, 0);
});

test("replying before the reminder prevents a stale reminder", async t => {
  const f = fixture(t);
  f.message("admin", f.now); f.message("client", f.now + 1);
  await processMailQueue(f.db, { now: f.now + 300001, send: f.send });
  assert(!f.letters.some(letter => letter.to === "client@example.test"));
});

test("permission changes, email changes and disabled preferences suppress pending deliveries", async t => {
  const f = fixture(t);
  f.message("client", f.now);
  f.db.prepare("UPDATE users SET role='client' WHERE id='admin'").run();
  f.job("changed-email", { userId: "other" });
  f.db.prepare("UPDATE users SET email='different@example.test' WHERE id='other'").run();
  f.job("disabled");
  f.db.prepare("INSERT INTO notification_preferences(user_id,order_updates) VALUES('client',0)").run();
  await processMailQueue(f.db, { now: f.now + 300000, send: f.send });
  assert.equal(f.letters.length, 0);
});

test("overlapping workers claim each email only once", async t => {
  const f = fixture(t);
  f.job("a"); f.job("b");
  let release;
  const blocker = new Promise(resolve => { release = resolve; });
  const sent = [];
  const first = processMailQueue(f.db, { now: f.now, limit: 1, send: async letter => { sent.push(letter.idempotencyKey); await blocker; return "a"; } });
  await processMailQueue(f.db, { now: f.now, send: async letter => { sent.push(letter.idempotencyKey); return "b"; } });
  release(); await first;
  assert.equal(sent.length, 2); assert.equal(new Set(sent).size, 2);
  assert.equal(f.db.prepare("SELECT count(*) n FROM mail_outbox WHERE status='sent'").get().n, 2);
});

test("transient errors retry the identical delivery with backoff and hide provider details", async t => {
  const f = fixture(t);
  f.job("retry");
  let attempted;
  await processMailQueue(f.db, { now: f.now, send: async letter => { attempted = letter; throw Object.assign(new Error("secret provider response"), { status: 429, retryAfter: 120 }); } });
  const row = f.db.prepare("SELECT * FROM mail_outbox").get();
  assert.equal(row.status, "pending"); assert.equal(row.next_attempt_at, f.now + 120000);
  assert.equal(row.last_error, "Email delivery HTTP 429");
  await processMailQueue(f.db, { now: f.now + 119999, send: f.send }); assert.equal(f.letters.length, 0);
  await processMailQueue(f.db, { now: f.now + 120000, send: f.send });
  assert.deepEqual(f.letters[0], attempted);
});

test("permanent delivery errors and expiry erase queued content", async t => {
  const f = fixture(t);
  f.job("invalid");
  await processMailQueue(f.db, { now: f.now, send: async () => { throw Object.assign(new Error("secret"), { status: 422 }); } });
  assert.equal(f.db.prepare("SELECT status FROM mail_outbox").get().status, "failed");
  assert.equal(f.db.prepare("SELECT payload FROM mail_outbox").get().payload, null);
  f.job("expired", { expiresAt: f.now });
  await processMailQueue(f.db, { now: f.now, send: f.send });
  assert.equal(f.letters.length, 0);
  assert.equal(f.db.prepare("SELECT payload FROM mail_outbox WHERE id=?").get(hash("expired")).payload, null);
});

test("recovery jobs require a live token and matching account version", async t => {
  const f = fixture(t);
  f.db.prepare("INSERT INTO password_resets(id,user_id,version,created_at,expires_at) VALUES('token','client',0,?,?)").run(f.now, f.now + 600000);
  f.job("reset", { kind: "password-reset", parentId: "token", letter: { subject: "Reset", text: "Link", tokenId: "token" } });
  f.db.prepare("UPDATE users SET session_version=1 WHERE id='client'").run();
  await processMailQueue(f.db, { now: f.now, send: f.send });
  assert.equal(f.letters.length, 0);
});

test("daily quota is shared and reserves ten attempts for recovery and security", async t => {
  const f = fixture(t);
  for (let index = 0; index < 80; index++) assert(reserveMailSlot(f.db, false, f.now));
  assert.equal(reserveMailSlot(f.db, false, f.now), false);
  for (let index = 0; index < 10; index++) assert(reserveMailSlot(f.db, true, f.now));
  assert.equal(reserveMailSlot(f.db, true, f.now), false);
  assert(reserveMailSlot(f.db, false, f.now + 86400000));
  process.env.MAIL_DAILY_LIMIT = "10";
  try { assert.equal(reserveMailSlot(f.db, false, f.now + 2 * 86400000), false); assert(reserveMailSlot(f.db, true, f.now + 2 * 86400000)); }
  finally { process.env.MAIL_DAILY_LIMIT = "90"; }
});

test("security notices ignore ordinary preferences and recovery has queue priority", async t => {
  const f = fixture(t);
  f.db.prepare("INSERT INTO notification_preferences(user_id,order_updates,chat_reminders) VALUES('client',0,0)").run();
  f.job("security", { kind: "password-changed" });
  f.db.prepare("INSERT INTO password_resets(id,user_id,version,created_at,expires_at) VALUES('token','client',0,?,?)").run(f.now, f.now + 600000);
  f.job("reset", { kind: "password-reset", letter: { subject: "Reset first", text: "Link", tokenId: "token" } });
  await processMailQueue(f.db, { now: f.now, send: f.send });
  assert.equal(f.letters.length, 2); assert.equal(f.letters[0].subject, "Reset first");
});
