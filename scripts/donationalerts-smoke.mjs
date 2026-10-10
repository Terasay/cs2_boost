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
const directory = mkdtempSync(resolve("work/donation-smoke-"));
const dbPath = join(directory, "database.sqlite"), feedPath = join(directory, "feed.json"), preloadPath = join(directory, "provider.mjs");
writeFileSync(feedPath, "[]");
writeFileSync(preloadPath, `import {readFileSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input));
  if(url.origin!=='https://www.donationalerts.com')return original(input,options);
  if(options.redirect!=='error')throw new Error('Unsafe provider redirect policy');
  if(url.pathname==='/oauth/token')return Response.json({token_type:'Bearer',access_token:options.body.get('grant_type')==='refresh_token'?'refreshed-token':'access-token',refresh_token:'refresh-token',expires_in:options.body.get('grant_type')==='refresh_token'?3600:1});
  if(url.pathname==='/api/v1/user/oauth')return Response.json({data:{id:99,code:'limonorigin',name:'Limon'}});
  if(url.pathname==='/api/v1/alerts/donations'){
    if(options.headers.Authorization!=='Bearer refreshed-token')throw new Error('Expired token was not refreshed');
    return Response.json({data:JSON.parse(readFileSync(${JSON.stringify(feedPath)})),links:{next:null}});
  }
  throw new Error('Unexpected provider endpoint');
};`);
const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, APP_ORIGIN: base, NODE_ENV: "production", DATABASE_PATH: dbPath, TRUST_PROXY: "0", SEARCH_INDEXING: "0", ORDER_ACCESS_KEY: randomBytes(32).toString("hex"), DONATIONALERTS_MODE: "test", DONATIONALERTS_ACCOUNT: "limonorigin", DONATIONALERTS_CLIENT_ID: "42", DONATIONALERTS_CLIENT_SECRET: "private-test-secret" };
const migration = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env, encoding: "utf8", windowsHide: true }); assert.equal(migration.status, 0, migration.stderr);
const db = new Database(dbPath); db.pragma("foreign_keys=ON");
const server = spawn(process.execPath, ["--import", pathToFileURL(preloadPath).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let logs = ""; server.stdout.on("data", value => logs += value); server.stderr.on("data", value => logs += value);
const endpoint = "/api/payments/donationalerts";
const password = "DonationTestPassword_2026";
async function call(path, cookie = "", body, status = 200, origin = base) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const data = response.status === 303 ? null : await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
  return { data, location: response.headers.get("location"), cookie: response.headers.get("set-cookie")?.split(";")[0] || "" };
}
async function fixture(name, role) {
  const id = crypto.randomUUID(), email = `${name}@example.test`;
  db.prepare("INSERT INTO users(id,email,password_hash,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?)").run(id, email, await hashPassword(password), role, Date.now(), Date.now());
  return { id, ...await call("/api/auth/login", "", { email, password }) };
}
try {
  for (let attempt = 0; attempt < 100; attempt++) { if (server.exitCode !== null) throw new Error(logs); try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await delay(100); }
  const admin = await fixture("admin", "admin"), otherAdmin = await fixture("other-admin", "admin"), client = await fixture("client", "client");
  await call(endpoint, "", undefined, 401); await call(endpoint, client.cookie, undefined, 403);
  await call(endpoint, client.cookie, { action: "create", amount: 50000 }, 403);
  await call(endpoint, admin.cookie, { action: "create", amount: 50000 }, 403, "https://untrusted.test");
  const order = (await call("/api/orders", client.cookie, { platform: "premier", service: "rating", method: "duo", current: 4500, target: 5500, promoCode: "Cherep", riskAccepted: true }, 201)).data;
  const detail = (await call(`/api/orders/${order.id}`, admin.cookie)).data.order;
  const accepted = await fetch(base + `/api/orders/${order.id}`, { method: "PATCH", headers: { Origin: base, Cookie: admin.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", updatedAt: detail.updatedAt }) }); assert.equal(accepted.status, 200);
  const originalOrder = db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  const copied = (await call(endpoint, admin.cookie, { action: "create", orderId: order.id, amount: 1 }, 201)).data.test;
  assert.equal(copied.amount, 40000);
  assert.equal((await call(endpoint, admin.cookie, { action: "simulate", id: copied.id, scenario: "wrong_amount" })).data.result, "wrong_amount");
  assert.equal((await call(endpoint, admin.cookie, { action: "simulate", id: copied.id, scenario: "wrong_currency" })).data.result, "wrong_currency");
  const paidAttempts = await Promise.all([0, 1].map(() => call(endpoint, admin.cookie, { action: "simulate", id: copied.id, scenario: "match" })));
  assert.deepEqual(paidAttempts.map(item => item.data.result).sort(), ["already_matched", "matched"]);
  const eventsBeforeReplay = db.prepare("SELECT count(*) AS n FROM donation_test_events").get().n;
  assert.equal((await call(endpoint, admin.cookie, { action: "simulate", id: copied.id, scenario: "duplicate" })).data.result, "duplicate");
  assert.equal(db.prepare("SELECT count(*) AS n FROM donation_test_events").get().n, eventsBeforeReplay);
  assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id=?").get(order.id), originalOrder);
  assert.equal(db.prepare("SELECT count(*) AS n FROM promo_earnings").get().n, 0);
  const staleTest = (await call(endpoint, admin.cookie, { action: "create", orderId: order.id }, 201)).data.test;
  db.prepare("UPDATE orders SET updated_at=updated_at+1 WHERE id=?").run(order.id);
  const revisedOrder = db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  assert.equal((await call(endpoint, admin.cookie, { action: "simulate", id: staleTest.id, scenario: "match" })).data.result, "order_changed");
  assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id=?").get(order.id), revisedOrder);
  db.prepare("UPDATE orders SET updated_at=? WHERE id=?").run(originalOrder.updated_at, order.id);
  const expired = (await call(endpoint, admin.cookie, { action: "create", amount: 50001 }, 201)).data.test;
  assert.equal((await call(endpoint, admin.cookie, { action: "simulate", id: expired.id, scenario: "expired" })).data.result, "expired");
  await call(endpoint, admin.cookie, { action: "confirm_payment", id: copied.id }, 400);
  const connect = (await call(endpoint, admin.cookie, { action: "connect" })).data;
  const url = new URL(connect.url), state = url.searchParams.get("state");
  assert.equal(url.searchParams.get("scope"), "oauth-user-show oauth-donation-index");
  assert(!connect.url.includes(env.DONATIONALERTS_CLIENT_SECRET));
  const callback = `${endpoint}/callback?state=${state}&code=test-code`;
  assert((await call(callback, otherAdmin.cookie, undefined, 303)).location.endsWith("connection=expired"));
  assert((await call(callback, admin.cookie, undefined, 303)).location.endsWith("connection=connected"));
  assert((await call(callback, admin.cookie, undefined, 303)).location.endsWith("connection=expired"));
  const stored = db.prepare("SELECT secret FROM donation_connections").get().secret;
  assert(!stored.includes("access-token")); assert(!stored.includes("refresh-token"));
  const test = (await call(endpoint, admin.cookie, { action: "create", amount: 50001 }, 201)).data.test;
  writeFileSync(feedPath, JSON.stringify([{ id: 111, name: "donation", message: test.reference, amount: 500.01, currency: "RUB" }, { id: 112, name: "custom", message: test.reference, amount: 500.01, currency: "RUB" }]));
  assert.equal((await call(endpoint, admin.cookie, { action: "sync" })).data.results.matched, 1);
  await call(endpoint, admin.cookie, { action: "sync" }, 429);
  const status = (await call(endpoint, admin.cookie)).data;
  assert.equal(status.connected, true); assert.equal(status.account.code, "limonorigin");
  assert.equal(status.tests.find(item => item.id === test.id).status, "matched");
  assert(!JSON.stringify(status).includes("access-token")); assert(!JSON.stringify(status).includes("private-test-secret"));
  assert.deepEqual(db.prepare("SELECT * FROM orders WHERE id=?").get(order.id), originalOrder);
  assert.equal(db.prepare("SELECT count(*) AS n FROM promo_earnings").get().n, 0);
  await call(endpoint, admin.cookie, { action: "disconnect" });
  assert.equal(db.prepare("SELECT secret FROM donation_connections").get().secret, null);
  assert.equal((await call(endpoint, admin.cookie)).data.connected, false);
  console.log(JSON.stringify({ ok: true, isolatedTests: true, adminOnly: true, csrf: true, oauthState: true, encryptedTokens: true, refresh: true, replaySafe: true, concurrentMatch: true, noRealOrderChanges: true, noPromoEarnings: true }));
} catch (error) { console.error(logs.slice(-2000)); throw error; }
finally { db.close(); if (server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill(); await stopped; } }
