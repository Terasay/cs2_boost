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
const directory = mkdtempSync(resolve("work/wallet-smoke-"));
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
  const admin = await fixture("admin", "admin"), client = await fixture("client", "client"), friend = await fixture("friend", "client");
  const wallet = async (who = client) => (await call("/api/wallet", who.cookie)).data;
  const get = async (id, who = client) => (await call(`/api/orders/${id}`, who.cookie)).data;
  const patch = async (id, action, values = {}, who = client, status = 200, actor = admin) => call(`/api/orders/${id}`, actor.cookie, { action, updatedAt: (await get(id, who)).order.updatedAt, ...values }, status, "PATCH");
  const connect = (await call(endpoint, admin.cookie, { action: "connect" })).data;
  const state = new URL(connect.url).searchParams.get("state");
  await call(`${endpoint}/callback?state=${state}&code=test-code`, admin.cookie, undefined, 303);
  await call("/api/wallet", "", undefined, 401);
  await call("/api/wallet", client.cookie, { action: "prepare", amount: 10000 }, 403, "POST", "https://evil.test");
  await call("/api/wallet", admin.cookie, { action: "prepare", amount: 10000 }, 403);
  await call("/api/wallet", client.cookie, { action: "claim" }, 409);
  for (const amount of [-100, 0, 9999, 10000.1, "10000", 10000001]) await call("/api/wallet", client.cookie, { action: "prepare", amount }, 409);
  db.prepare("DELETE FROM auth_attempts").run();
  const pending = await Promise.all([0, 1].map(() => call("/api/wallet", client.cookie, { action: "prepare", amount: 100000, status: "confirmed", userId: friend.id }, 201)));
  assert.equal(pending[0].data.id, pending[1].data.id);
  let data = await wallet(); let invoice = data.topups[0];
  assert.match(invoice.reference, /^CS2WAL-[a-f0-9]{32}$/);
  assert.equal(data.balance, 0); assert.equal((await wallet(friend)).topups.length, 0);
  await call("/api/wallet", friend.cookie, { action: "cancel_topup", id: invoice.id, confirmed: true }, 404);
  await call("/api/wallet", client.cookie, { action: "prepare", amount: 50000 }, 409);
  let receiptId = 100;
  async function notify(invoice, amount = invoice.amount, currency = "RUB", providerId = ++receiptId) {
    db.prepare("DELETE FROM auth_attempts").run();
    writeFileSync(feedPath, JSON.stringify([{ id: providerId, name: "Donations", message_type: "text", payin_system: null, message: invoice.reference, amount: amount / 100, currency }]));
    const response = await fetch(base + endpoint + "/sync", { method: "POST", headers: { Authorization: `Bearer ${env.PAYMENTS_SYNC_KEY}` } });
    assert.equal(response.status, 200, await response.text());
  }
  await notify(invoice, 99999); assert.equal((await wallet()).balance, 0);
  await call("/api/wallet", client.cookie, { action: "cancel_topup", id: invoice.id, confirmed: true }, 409);
  await notify(invoice, 100000, "USD"); assert.equal((await wallet()).balance, 0);
  const matchedId = ++receiptId;
  await notify(invoice, 100000, "RUB", matchedId); await notify(invoice, 100000, "RUB", matchedId); await notify(invoice, 100000);
  assert.equal((await wallet()).balance, 100000); assert.equal((await wallet()).entries.length, 1);
  async function accepted(who = client, code = null) {
    const result = (await call("/api/orders", who.cookie, { platform: "premier", service: "rating", method: "duo", current: 4500, target: 5500, promoCode: code, promoDiscountPercent: 100, commissionAmount: 999999, riskAccepted: true }, 201)).data;
    await patch(result.id, "accept", {}, who);
    return result.id;
  }
  async function pay(id, who = client, status = 200, revision) {
    return call(`/api/orders/${id}/payment`, who.cookie, { action: "wallet", updatedAt: revision ?? (await get(id, who)).order.updatedAt, amount: 1 }, status);
  }
  async function finish(id, who = client) {
    const accessUrl = `/api/orders/${id}/access`;
    await call(accessUrl, who.cookie, { action: "submit", friendCode: "12345678", confirmed: true, updatedAt: (await get(id, who)).order.updatedAt });
    const access = (await get(id, who)).access;
    await call(accessUrl, admin.cookie, { action: "receive", confirmed: true, accessCreatedAt: access.submittedAt, updatedAt: (await get(id, who)).order.updatedAt });
    await patch(id, "complete", { confirmed: true }, who);
  }
  const first = await accepted();
  await call(`/api/orders/${first}/payment`, friend.cookie, { action: "wallet", updatedAt: (await get(first)).order.updatedAt }, 404);
  const firstRevision = (await get(first)).order.updatedAt;
  const payments = await Promise.all([0, 1].map(() => fetch(base + `/api/orders/${first}/payment`, { method: "POST", headers: { Origin: base, Cookie: client.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "wallet", updatedAt: firstRevision }) })));
  assert.deepEqual(payments.map(response => response.status).sort(), [200, 409]);
  assert.equal((await wallet()).balance, 50000); assert.equal((await get(first)).order.paymentMethod, "wallet");
  await finish(first);
  const review = (await call(`/api/orders/${first}/review`, client.cookie, { rating: 1, authorName: "First player", body: "Honest feedback about this service.", updatedAt: null }, 201)).data;
  assert.match(review.promoCode, /^PLAYER-[A-F0-9]{12}$/);
  const code = review.promoCode;
  assert.equal((await wallet()).personalCode, code);
  assert.equal((await call("/api/wallet", client.cookie, { action: "claim" })).data.code, code);
  const resolved = (await call(`/api/promos/resolve?code=${code.toLowerCase()}`)).data.promo;
  assert.equal(resolved.discountPercent, 5); assert(!JSON.stringify(resolved).includes(client.id));
  await call(`/api/promos/resolve?code=PLAYER-NOT-REAL`, "", undefined, 400);
  db.prepare("DELETE FROM auth_attempts").run();
  const self = await accepted(client, code);
  assert.equal((await get(self)).order.totalAmount, 47500); assert.equal((await get(self)).order.commissionAmount, 0);
  await pay(self); await finish(self);
  assert.equal((await wallet()).balance, 2500); assert.equal((await wallet()).referral.earned, 0);
  await call("/api/wallet", friend.cookie, { action: "prepare", amount: 100000 }, 201);
  const friendTopup = (await wallet(friend)).topups[0];
  await notify(friendTopup, 100000, "RUB", matchedId); assert.equal((await wallet(friend)).balance, 0);
  await notify(friendTopup); assert.equal((await wallet(friend)).balance, 100000);
  const referred = await accepted(friend, code);
  const referredOrder = (await get(referred, friend)).order;
  assert.equal(referredOrder.totalAmount, 47500); assert.equal(referredOrder.commissionAmount, 2375); assert.equal(referredOrder.promoDiscountPercent, 5);
  await pay(referred, friend); assert.equal((await wallet()).balance, 2500); assert.equal((await wallet()).referral.pending, 2375);
  await finish(referred, friend);
  assert.equal((await wallet()).balance, 4875); assert.equal((await wallet()).referral.earned, 2375); assert.equal((await wallet()).referral.pending, 0);
  await patch(referred, "complete", { confirmed: true }, friend, 409);
  assert.equal((await wallet()).balance, 4875);
  await patch(referred, "refund", { confirmed: true, reason: "Customer requested a full refund" }, friend);
  assert.equal((await wallet(friend)).balance, 100000); assert.equal((await wallet()).balance, 2500); assert.equal((await wallet()).referral.earned, 0);
  await patch(referred, "refund", { confirmed: true, reason: "Try a repeated refund" }, friend, 409);
  const short = await accepted(); await pay(short, client, 409); assert.equal((await wallet()).balance, 2500);
  await call("/api/wallet", client.cookie, { action: "prepare", amount: 10000 }, 201);
  const cancelled = (await wallet()).topups[0];
  await call("/api/wallet", client.cookie, { action: "cancel_topup", id: cancelled.id, confirmed: true });
  await notify(cancelled); assert.equal((await wallet()).balance, 2500);
  const freshId = (await call("/api/wallet", client.cookie, { action: "prepare", amount: 10000 }, 201)).data.id;
  assert.notEqual(freshId, cancelled.id);
  const expired = (await wallet()).topups[0]; db.prepare("UPDATE wallet_topups SET expires_at=? WHERE id=?").run(Date.now() - 1, expired.id);
  await notify(expired); assert.equal((await wallet()).balance, 2500);
  const external = await accepted(friend);
  const externalInvoice = (await call(`/api/orders/${external}/payment`, friend.cookie, { updatedAt: (await get(external, friend)).order.updatedAt }, 201)).data.intent;
  await pay(external, friend, 409);
  await call(`/api/orders/${external}/payment`, friend.cookie, { action: "wallet", updatedAt: (await get(external, friend)).order.updatedAt, noExternalPayment: true });
  await notify(externalInvoice); assert.equal((await wallet(friend)).balance, 50000);
  assert.equal(db.prepare("SELECT count(*) AS n FROM wallet_entries WHERE reference=?").get(`order:${external}`).n, 1);
  const competing = await Promise.all([accepted(friend), accepted(friend)]);
  const revisions = await Promise.all(competing.map(id => get(id, friend)));
  const competingPayments = await Promise.all(competing.map((id, index) => fetch(base + `/api/orders/${id}/payment`, { method: "POST", headers: { Origin: base, Cookie: friend.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "wallet", updatedAt: revisions[index].order.updatedAt }) })));
  assert.deepEqual(competingPayments.map(response => response.status).sort(), [200, 409]);
  assert.equal((await wallet(friend)).balance, 0);
  const calibration = (await call("/api/orders", friend.cookie, { platform: "premier", service: "calibration", method: "duo", current: null, target: null, promoCode: code, riskAccepted: true }, 201)).data.id;
  await patch(calibration, "propose", { amount: 100000, days: 2, reason: "Calibration package price" }, friend);
  await patch(calibration, "accept", {}, friend, 200, friend);
  assert.equal((await get(calibration, friend)).order.totalAmount, 95000);
  assert.equal((await get(calibration, friend)).order.commissionAmount, 4750);
  const report = (await call("/api/promos", admin.cookie)).data;
  assert.equal(report.personal.codes, 1); assert.equal(report.personal.earned, 0);
  assert((await call(endpoint, admin.cookie)).data.topups.length > 0);
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  for (const account of db.prepare("SELECT * FROM wallet_accounts").all()) {
    const sum = db.prepare("SELECT coalesce(sum(amount), 0) AS balance FROM wallet_entries WHERE user_id=?").get(account.user_id).balance;
    assert.equal(account.balance, sum);
  }
  assert(!JSON.stringify((await wallet()).entries).includes(friend.id));
  console.log(JSON.stringify({ ok: true, topupMatching: true, duplicateReceipts: true, ownerIsolation: true, walletPayment: true, concurrentPayment: true, automaticAccessUnlock: true, referralAfterAnyReview: true, referralOnCompletion: true, selfDiscountOnly: true, walletRefund: true, referralReversal: true, expiredAndCancelledTopups: true, ledgerConsistent: true }));
  if (process.env.SITE_KEEP_FIXTURES === "1") {
    writeFileSync("work/wallet-ui-fixture.json", JSON.stringify({ base, dbPath, password, clientEmail: "client@example.test", adminEmail: "admin@example.test", first, self, code }));
    process.stdin.resume(); await new Promise(resolve => process.once("SIGINT", resolve));
  }
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally { db.close(); if (server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill(); await stopped; } }
