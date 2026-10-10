import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { hashPassword } from "../lib/password.ts";

mkdirSync("work", { recursive: true });
const directory = mkdtempSync(resolve("work/order-payments-smoke-"));
const dbPath = join(directory, "database.sqlite"), feedPath = join(directory, "feed.json"), preloadPath = join(directory, "provider.mjs");
writeFileSync(feedPath, "[]");
writeFileSync(preloadPath, `import {readFileSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input));
  if(url.origin!=='https://www.donationalerts.com')return original(input,options);
  if(options.redirect!=='error')throw new Error('Unsafe provider redirects');
  if(url.pathname==='/oauth/token')return Response.json({token_type:'Bearer',access_token:'access-token',refresh_token:'refresh-token',expires_in:3600});
  if(url.pathname==='/api/v1/user/oauth')return Response.json({data:{id:99,code:'limonorigin',name:'Limon'}});
  if(url.pathname==='/api/v1/alerts/donations')return Response.json({data:JSON.parse(readFileSync(${JSON.stringify(feedPath)})),links:{next:null}});
  throw new Error('Unexpected provider endpoint');
};`);
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, APP_ORIGIN: base, NODE_ENV: "production", DATABASE_PATH: dbPath, TRUST_PROXY: "0", SEARCH_INDEXING: "0", ORDER_ACCESS_KEY: randomBytes(32).toString("hex"), PAYMENTS_SYNC_KEY: randomBytes(32).toString("hex"), DONATIONALERTS_MODE: "orders", DONATIONALERTS_ACCOUNT: "limonorigin", DONATIONALERTS_CLIENT_ID: "42", DONATIONALERTS_CLIENT_SECRET: "private-test-secret" };
const migration = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env, encoding: "utf8", windowsHide: true }); assert.equal(migration.status, 0, migration.stderr);
const db = new Database(dbPath); db.pragma("foreign_keys=ON");
const server = spawn(process.execPath, ["--import", pathToFileURL(preloadPath).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let logs = ""; server.stdout.on("data", value => logs += value); server.stderr.on("data", value => logs += value);
const endpoint = "/api/payments/donationalerts";
const password = "OrderPaymentPassword_2026";
async function call(path, cookie = "", body, status = 200, method = body ? "POST" : "GET", origin = base) {
  const response = await fetch(base + path, { method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const data = response.status === 303 ? null : await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  if (path.startsWith("/api/orders") && response.ok) assert.equal(response.headers.get("cache-control"), "no-store");
  return { data, location: response.headers.get("location"), cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}
async function fixture(name, role) {
  const id = crypto.randomUUID(), email = `${name}@example.test`;
  db.prepare("INSERT INTO users(id,email,password_hash,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?)").run(id, email, await hashPassword(password), role, Date.now(), Date.now());
  return { id, ...await call("/api/auth/login", "", { email, password }) };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { if (server.exitCode !== null) throw new Error(logs); try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await delay(100); }
  const admin = await fixture("admin", "admin"), client = await fixture("client", "client"), other = await fixture("other", "client");
  const get = async id => (await call(`/api/orders/${id}`, client.cookie)).data;
  const patch = async (id, action, values = {}, status = 200, cookie = admin.cookie) => call(`/api/orders/${id}`, cookie, { action, updatedAt: (await get(id)).order.updatedAt, ...values }, status, "PATCH");
  async function accepted() {
    const id = (await call("/api/orders", client.cookie, { platform: "premier", service: "rating", method: "duo", current: 4500, target: 5500, promoCode: "Cherep", riskAccepted: true }, 201)).data.id;
    await patch(id, "accept"); return id;
  }
  await call(endpoint, admin.cookie, { action: "create", amount: 1 }, 409);
  await call(endpoint, admin.cookie, { action: "simulate", id: "fake", scenario: "match" }, 409);
  const connect = (await call(endpoint, admin.cookie, { action: "connect" })).data;
  const state = new URL(connect.url).searchParams.get("state");
  assert((await call(`${endpoint}/callback?state=${state}&code=test-code`, admin.cookie, undefined, 303)).location.endsWith("connection=connected"));
  const id = await accepted();
  const initial = (await get(id)).order;
  const checkout = `/api/orders/${id}/payment`;
  await call(checkout, "", { updatedAt: initial.updatedAt }, 401);
  await call(checkout, admin.cookie, { updatedAt: initial.updatedAt }, 403);
  await call(checkout, other.cookie, { updatedAt: initial.updatedAt }, 404);
  await call(checkout, client.cookie, { updatedAt: initial.updatedAt }, 403, "POST", "https://evil.test");
  const concurrent = await Promise.all([0, 1].map(() => call(checkout, client.cookie, { updatedAt: initial.updatedAt, amount: 1, currency: "USD", status: "confirmed" }, 201)));
  const intent = concurrent[0].data.intent;
  assert.equal(concurrent[1].data.intent.id, intent.id); assert.equal(intent.amount, 40000); assert.equal(intent.currency, "RUB"); assert.match(intent.reference, /^CS2PAY-[a-f0-9]{32}$/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM payment_intents WHERE order_id=?").get(id).n, 1);
  await call(`/api/orders/${id}/access`, client.cookie, { action: "submit", friendCode: "12345678", confirmed: true, updatedAt: initial.updatedAt }, 409);
  async function sync(key = env.PAYMENTS_SYNC_KEY) {
    const response = await fetch(base + endpoint + "/sync", { method: "POST", headers: { Authorization: `Bearer ${key}` } });
    const data = await response.json(); assert.equal(response.status, key === env.PAYMENTS_SYNC_KEY ? 200 : 401); return data;
  }
  await sync("0".repeat(64));
  writeFileSync(feedPath, JSON.stringify([{ id: 100, name: "donation", message: intent.reference, amount: 399.99, currency: "RUB" }, { id: 101, name: "donation", message: intent.reference, amount: 400, currency: "USD" }, { id: 102, name: "custom", message: intent.reference, amount: 400, currency: "RUB" }]));
  const mismatched = await sync(); assert.equal(mismatched.results.wrong_amount, 1); assert.equal(mismatched.results.wrong_currency, 1);
  assert.equal((await get(id)).payment.intent.status, "pending");
  db.prepare("DELETE FROM auth_attempts").run();
  writeFileSync(feedPath, JSON.stringify([{ id: 103, name: "donation", message: intent.reference, amount: 400, currency: "RUB", is_shown: 1 }]));
  assert.equal((await sync()).results.matched, 1);
  const matched = await get(id); assert.equal(matched.payment.intent.status, "review"); assert.equal(matched.order.paidAt, null); assert.equal(matched.order.status, "awaiting_payment");
  assert.equal(db.prepare("SELECT count(*) AS n FROM promo_earnings").get().n, 0);
  db.prepare("DELETE FROM auth_attempts").run(); assert.equal((await sync()).results.duplicate, 1);
  assert.equal(db.prepare("SELECT count(*) AS n FROM payment_receipts WHERE result='matched'").get().n, 1);
  await patch(id, "cancel", { reason: "Cannot cancel a matched payment" }, 409, client.cookie);
  await patch(id, "propose", { amount: 12300, days: 2, reason: "Cannot change a matched payment" }, 409);
  await patch(id, "confirm_payment", { receivedAmount: 40000, confirmed: true }, 409);
  await patch(id, "confirm_payment", { receivedAmount: 40000, confirmed: true, paymentIntentId: "wrong" }, 409);
  const confirmations = await Promise.all([0, 1].map(() => fetch(base + `/api/orders/${id}`, { method: "PATCH", headers: { Origin: base, Cookie: admin.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm_payment", updatedAt: matched.order.updatedAt, receivedAmount: 40000, confirmed: true, paymentIntentId: intent.id }) }).then(response => response.status)));
  assert.deepEqual(confirmations.sort(), [200, 409]);
  const paid = await get(id); assert.equal(paid.order.status, "awaiting_access"); assert.equal(paid.payment.intent.status, "confirmed"); assert.equal(paid.order.startedAt, null);
  const earning = db.prepare("SELECT * FROM promo_earnings WHERE order_id=?").get(id); assert.equal(earning.amount, 8000); assert.equal(earning.paid_amount, 40000);
  const privateMessage = "<img src=x onerror=alert(1)> Private chat for this order";
  const sent = (await call(`/api/orders/${id}/messages`, client.cookie, { body: privateMessage }, 201)).data.message;
  const stored = db.prepare("SELECT body,encrypted FROM messages WHERE id=?").get(sent.id); assert.equal(stored.encrypted, 1); assert(!stored.body.includes(privateMessage));
  assert.equal((await get(id)).messages.at(-1).body, privateMessage);
  await call(`/api/orders/${id}`, other.cookie, undefined, 404);
  await call(`/api/orders/${id}/messages`, other.cookie, { body: "forged" }, 404);
  await call(`/api/orders/${id}/messages`, client.cookie, { body: "csrf" }, 403, "POST", "https://evil.test");
  const support = (await call("/api/support", client.cookie, { body: "Private support text" }, 201)).data;
  const supportId = support.id;
  await call(`/api/support/${supportId}`, other.cookie, undefined, 404);
  assert(db.prepare("SELECT encrypted FROM support_messages WHERE thread_id=?").get(supportId).encrypted);
  const inbox = (await call("/api/inbox", admin.cookie)).data;
  assert.equal(inbox.orderChats.find(row => row.id === id).lastMessage, privateMessage);
  assert.equal(inbox.supportChats.find(row => row.id === supportId).lastMessage, "Private support text");
  const changedId = await accepted();
  const changedOrder = (await get(changedId)).order;
  const stale = (await call(`/api/orders/${changedId}/payment`, client.cookie, { updatedAt: changedOrder.updatedAt }, 201)).data.intent;
  await patch(changedId, "propose", { amount: 60000, days: 2, reason: "Different terms agreed" });
  db.prepare("DELETE FROM auth_attempts").run();
  writeFileSync(feedPath, JSON.stringify([{ id: 104, name: "donation", message: stale.reference, amount: 400, currency: "RUB" }]));
  assert.equal((await sync()).results.order_changed, 1); assert.equal((await get(changedId)).order.paidAt, null);
  const rejectedId = await accepted();
  const rejectedOrder = (await get(rejectedId)).order;
  const rejectedIntent = (await call(`/api/orders/${rejectedId}/payment`, client.cookie, { updatedAt: rejectedOrder.updatedAt }, 201)).data.intent;
  db.prepare("DELETE FROM auth_attempts").run(); writeFileSync(feedPath, JSON.stringify([{ id: 105, name: "donation", message: rejectedIntent.reference, amount: 400, currency: "RUB" }])); await sync();
  await patch(rejectedId, "reject_payment", { reason: "No funds found in balance history" });
  assert.equal((await get(rejectedId)).payment.intent.status, "void"); assert.equal((await get(rejectedId)).order.paidAt, null);
  await call(endpoint, admin.cookie, { action: "disconnect" });
  assert.equal((await get(rejectedId)).payment.available, false);
  assert(!logs.includes(env.DONATIONALERTS_CLIENT_SECRET)); assert(!logs.includes(privateMessage));
  console.log(JSON.stringify({ ok: true, orderCheckout: true, exactAmounts: true, csrf: true, isolatedOrders: true, deduplicatedReceipts: true, adminVerification: true, singleEarning: true, changedTermsBlocked: true, encryptedChats: true, privateInbox: true }));
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally { db.close(); if (server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill(); await stopped; } }
