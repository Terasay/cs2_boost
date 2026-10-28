import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { hashPassword } from "../lib/password.ts";

mkdirSync("work", { recursive: true });
const directory = mkdtempSync(resolve("work/mail-smoke-"));
const dbPath = join(directory, "database.sqlite");
const portProbe = createServer();
await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, APP_ORIGIN: base, NODE_ENV: "production", DATABASE_PATH: dbPath, TRUST_PROXY: "0", SEARCH_INDEXING: "0", ORDER_ACCESS_KEY: randomBytes(32).toString("hex"), RESEND_API_KEY: "re_local_test_only", MAIL_FROM: "noreply@cs2-boosts.ru", SITE_MAIL_OUTBOX: join(directory, "outbox") };
const migration = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env, encoding: "utf8" });
assert.equal(migration.status, 0, migration.stderr);
const db = new Database(dbPath);
const server = spawn(process.execPath, ["--import", pathToFileURL(resolve("scripts/helpers/resend-stub.mjs")).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let logs = "";
server.stdout.on("data", value => { logs += value; }); server.stderr.on("data", value => { logs += value; });
const password = "EmailSmokePassword_2026";
const nonce = crypto.randomUUID().slice(0, 8);
const email = `verified-${nonce}@example.test`;
const hash = value => createHash("sha256").update(value).digest("hex");
const letter = recipient => existsSync(join(env.SITE_MAIL_OUTBOX, "messages.jsonl")) ? readFileSync(join(env.SITE_MAIL_OUTBOX, "messages.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse).filter(message => message.to[0] === recipient).at(-1) : undefined;
const tokenFrom = message => new URLSearchParams(new URL(message.text.match(/http:\/\/\S+/)[0]).hash.slice(1)).get("token");
const resetLimits = () => db.exec("DELETE FROM auth_attempts");
async function waitFor(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = check();
    if (value) return value;
    await delay(25);
  }
  throw new Error("Timed out waiting for background delivery");
}
const waitLetter = (recipient, previousToken) => waitFor(() => {
  const message = letter(recipient);
  return message && tokenFrom(message) !== previousToken ? message : null;
});
async function post(action, body, expected = 200, origin = base) {
  const response = await fetch(`${base}/api/auth/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  return { response, data };
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await delay(250);
  }
  assert(ready, logs);
  const draft = { platform: "premier", service: "rating", method: "duo", current: 4500, target: 10000, redTrust: true, promoCode: "Cherep" };
  await post("register", { email }, 403, "https://evil.example");
  const pending = await post("register", { email, password: "ignored", role: "admin", lang: "en", draft, attribution: { source: "test", password: "drop" } }, 202);
  assert.equal(pending.response.headers.get("set-cookie"), null);
  assert.equal(db.prepare("SELECT count(*) AS n FROM users").get().n, 0);
  const first = tokenFrom(await waitLetter(email));
  assert.equal(db.prepare("SELECT id FROM email_verifications WHERE email=?").get(email).id, hash(first));
  assert.match(letter(email).subject, /Complete your/);
  assert.match(letter(email).html, /Confirm email/);
  assert(letter(email).html.includes(`token=${first}`));
  await post("resend-verification", { email }, 429);
  await post("verify-email", { token: first, password }, 403, "https://evil.example");
  await post("verify-email", { token: first, password: "short" }, 400);
  await fetch(`${base}/verify-email`);
  assert(db.prepare("SELECT id FROM email_verifications WHERE id=?").get(hash(first)));
  resetLimits();
  await post("resend-verification", { email, draft }, 202);
  const second = tokenFrom(await waitLetter(email, first)); assert.notEqual(first, second);
  const verified = await post("verify-email", { token: second, password, role: "admin" });
  assert.equal(verified.data.user.role, "client");
  assert.deepEqual(verified.data.draft, draft);
  assert.match(verified.response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
  const account = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  assert(account.email_verified_at); assert.notEqual(account.password_hash, password);
  assert.equal(db.prepare("SELECT count(*) AS n FROM email_verifications WHERE email=?").get(email).n, 0);
  await post("verify-email", { token: second, password }, 400);
  await post("verify-email", { token: first, password }, 400);
  await post("login", { email, password });
  resetLimits();
  const before = readFileSync(join(env.SITE_MAIL_OUTBOX, "messages.jsonl"), "utf8");
  const known = await post("register", { email }, 202);
  assert.deepEqual(known.data, pending.data);
  assert.equal(readFileSync(join(env.SITE_MAIL_OUTBOX, "messages.jsonl"), "utf8"), before);
  const expiredEmail = `expired-${nonce}@example.test`;
  await post("register", { email: expiredEmail }, 202);
  const expired = tokenFrom(await waitLetter(expiredEmail));
  db.prepare("UPDATE email_verifications SET expires_at=0 WHERE email=?").run(expiredEmail);
  await post("verify-email", { token: expired, password }, 400);
  const raceEmail = `race-${nonce}@example.test`;
  await post("register", { email: raceEmail }, 202);
  const race = tokenFrom(await waitLetter(raceEmail));
  const responses = await Promise.all([1, 2].map(() => fetch(`${base}/api/auth/verify-email`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ token: race, password }) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  for (const response of responses) await response.text();
  assert.equal(db.prepare("SELECT count(*) AS n FROM users WHERE email=?").get(raceEmail).n, 1);
  const failure = await post("register", { email: `failure-${nonce}@example.test` }, 202);
  assert.deepEqual(failure.data, known.data);
  assert.doesNotMatch(JSON.stringify(failure.data), /secret|re_local/);
  const failedJob = await waitFor(() => db.prepare("SELECT * FROM mail_outbox WHERE recipient = ? AND attempts = 1").get(`failure-${nonce}@example.test`));
  assert.equal(failedJob.status, "pending");
  assert.equal(failedJob.last_error, "Email delivery HTTP 503");
  assert(!failedJob.payload.includes("verify-email"));
  db.prepare("UPDATE mail_outbox SET next_attempt_at = 0 WHERE id = ?").run(failedJob.id);
  const worker = spawnSync(process.execPath, ["--import", pathToFileURL(resolve("scripts/helpers/resend-stub.mjs")).href, "scripts/mail-worker.mjs"], { env: { ...env, EMAIL_MONITOR: "0", SITE_MAIL_RETRY_SUCCESS: "1" }, encoding: "utf8", windowsHide: true });
  assert.equal(worker.status, 0, worker.stderr);
  assert.equal(db.prepare("SELECT status FROM mail_outbox WHERE id = ?").get(failedJob.id).status, "sent", "A fresh worker process must recover the queued registration");
  assert(letter(`failure-${nonce}@example.test`));
  resetLimits();
  const slowEmail = `slow-${nonce}@example.test`;
  const slow = await post("register", { email: slowEmail }, 202);
  assert.deepEqual(slow.data, known.data);
  await waitFor(() => existsSync(join(env.SITE_MAIL_OUTBOX, "delivery-started")));
  assert.equal(letter(slowEmail), undefined, "Response must finish before the mail provider replies");
  assert.equal(db.prepare("SELECT status FROM mail_outbox WHERE recipient = ?").get(slowEmail).status, "pending", "The job must be durable before responding");
  writeFileSync(join(env.SITE_MAIL_OUTBOX, "release-delivery"), "1");
  await waitLetter(slowEmail);
  resetLimits();
  db.prepare("INSERT INTO auth_attempts (key,count,window_start,blocked_until) VALUES (?,90,?,0)").run(hash(`registration-mail-day:account:${new Date().toISOString().slice(0,10)}`), Date.now());
  const quota = await post("register", { email: `quota-${nonce}@example.test` }, 202);
  assert.deepEqual(quota.data, (await post("register", { email }, 202)).data);
  assert.equal(db.prepare("SELECT id FROM email_verifications WHERE email = ?").get(`quota-${nonce}@example.test`), undefined);
  assert.equal(letter(`quota-${nonce}@example.test`), undefined);
  resetLimits();
  db.prepare("INSERT INTO mail_usage (day,count) VALUES (?,90) ON CONFLICT(day) DO UPDATE SET count=90").run(new Date().toISOString().slice(0,10));
  const mailQuota = await post("register", { email: `mail-quota-${nonce}@example.test` }, 202);
  assert.deepEqual(mailQuota.data, (await post("register", { email }, 202)).data);
  await waitFor(() => db.prepare("SELECT id FROM mail_outbox WHERE recipient = ? AND last_error = 'Daily email limit reached'").get(`mail-quota-${nonce}@example.test`));
  const legacyEmail = `legacy-${nonce}@example.test`;
  db.prepare("INSERT INTO users (id,email,password_hash,role,created_at) VALUES (?,?,?,'admin',?)").run(crypto.randomUUID(), legacyEmail, await hashPassword(password), Date.now());
  assert.equal((await post("login", { email: legacyEmail, password })).data.user.role, "admin");
  console.log(JSON.stringify({ ok: true, emailFirstRegistration: true, draftPreserved: true, singleUse: true, expiry: true, concurrentConsumption: true, resendCooldown: true, quota: true, providerFailure: true, enumerationProtection: true, nonBlockingDelivery: true, durableRetry: true, legacyAdminLogin: true, realEmailsSent: 0 }));
} finally {
  db.close();
  server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
}
