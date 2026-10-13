import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { hashPassword } from "../lib/password.ts";
import { openAccess } from "../lib/order-access.mjs";
import { generateSecret, sealSecret, recoveryHash, generateRecoveryCodes, totp } from "../lib/two-factor.mjs";

mkdirSync("work", { recursive: true });
const directory = mkdtempSync(resolve("work/recovery-smoke-"));
const dbPath = join(directory, "database.sqlite");
const probe = createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV: "production", APP_ORIGIN: base, DATABASE_PATH: dbPath, TRUST_PROXY: "0", SEARCH_INDEXING: "0", ORDER_ACCESS_KEY: randomBytes(32).toString("hex"), TWO_FACTOR_KEY: randomBytes(32).toString("hex"), RESEND_API_KEY: "re_local_test_only", MAIL_FROM: "noreply@cs2-boosts.ru", SITE_MAIL_OUTBOX: join(directory, "outbox"), EMAIL_MONITOR: "0", EMAIL_NOTIFICATIONS: "1", MAIL_DAILY_LIMIT: "90" };
process.env.ORDER_ACCESS_KEY = env.ORDER_ACCESS_KEY;
process.env.TWO_FACTOR_KEY = env.TWO_FACTOR_KEY;
const stub = pathToFileURL(resolve("scripts/helpers/resend-stub.mjs")).href;
const migrate = spawnSync(process.execPath, ["scripts/migrate.mjs"], { env, encoding: "utf8", windowsHide: true });
assert.equal(migrate.status, 0, migrate.stderr);
const db = new Database(dbPath); db.pragma("foreign_keys=ON");
const server = spawn(process.execPath, ["--import", stub, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let logs = "";
server.stdout.on("data", value => { logs += value; }); server.stderr.on("data", value => { logs += value; });
const password = "RecoverySmokePassword_2026";
const newPassword = "RecoveredSmokePassword_2026";
const hash = value => createHash("sha256").update(value).digest("hex");
const clearLimits = () => db.exec("DELETE FROM auth_attempts");
const letters = () => existsSync(join(env.SITE_MAIL_OUTBOX, "messages.jsonl")) ? readFileSync(join(env.SITE_MAIL_OUTBOX, "messages.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
const tokenFrom = letter => new URLSearchParams(new URL(letter.text.match(/http:\/\/\S+/)[0]).hash.slice(1)).get("token");
async function call(path, body, expected = 200, cookie = "", method = body ? "POST" : "GET", origin = base) {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
  return { data, headers: response.headers, cookie: response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
async function account(name, role = "client", verified = true) {
  const id = crypto.randomUUID(), email = `${name}@example.test`;
  db.prepare("INSERT INTO users(id,email,password_hash,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?)").run(id, email, await hashPassword(password), role, Date.now(), verified ? Date.now() : null);
  return { id, email, ...(await call("/api/auth/login", { email, password })) };
}
function work(extra = {}) {
  const result = spawnSync(process.execPath, ["--import", stub, "scripts/mail-worker.mjs"], { env: { ...env, ...extra }, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}
async function resetLink(user, lang = "ru") {
  clearLimits();
  await call("/api/auth/forgot-password", { email: user.email, lang }, 202);
  work();
  const letter = letters().filter(letter => letter.to[0] === user.email && /Reset your|Восстановление/.test(letter.subject)).at(-1);
  assert(letter);
  assert.match(letter.html, /Reset password|Восстановить пароль/);
  return tokenFrom(letter);
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error(logs);
    await delay(150);
  }
  assert(ready, logs);
  const client = await account("recover-client"), admin = await account("recover-admin", "admin"), race = await account("recover-race"), legacy = await account("recover-legacy", "admin", false);
  const oldCookie = (await call("/api/auth/login", { email: client.email, password })).cookie;
  await call("/api/auth/forgot-password", { email: client.email }, 403, "", "POST", "https://evil.example");
  const unknown = await call("/api/auth/forgot-password", { email: "unknown@example.test" }, 202);
  const missing = await call("/api/auth/forgot-password", { email: legacy.email }, 202);
  const known = await call("/api/auth/forgot-password", { email: client.email, lang: "en" }, 202);
  assert.deepEqual(known.data, unknown.data); assert.deepEqual(missing.data, unknown.data);
  assert.equal(db.prepare("SELECT count(*) n FROM password_resets").get().n, 1);
  const row = db.prepare("SELECT * FROM mail_outbox WHERE kind='password-reset'").get();
  const token = tokenFrom(openAccess(`mail:${row.id}`, row.payload));
  assert(!row.payload.includes(token));
  assert.equal(db.prepare("SELECT id FROM password_resets").get().id, hash(token));
  assert.equal(db.prepare("SELECT expires_at-created_at ttl FROM password_resets").get().ttl, 1800000);
  await call("/api/auth/forgot-password", { email: client.email }, 429);
  await call("/api/auth/forgot-password", { email: "unknown@example.test" }, 429);
  assert.equal(work().sent, 1); assert.match(letters()[0].subject, /Reset your/);
  assert.equal(db.prepare("SELECT payload FROM mail_outbox").get().payload, null);
  for (let index = 0; index < 2; index++) assert.equal((await call("/api/auth/reset-password-check", { token })).data.twoFactorRequired, false);
  const page = await fetch(base + "/reset-password");
  assert.match(page.headers.get("x-robots-tag"), /noindex/); assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert(db.prepare("SELECT id FROM password_resets WHERE id=?").get(hash(token)));
  await call("/api/auth/reset-password", { token, password: newPassword }, 403, "", "POST", "https://evil.example");
  await call("/api/auth/reset-password", { token, password: "short" }, 400);
  await call("/api/auth/reset-password", { token, password }, 400);
  const reset = await call("/api/auth/reset-password", { token, password: newPassword, role: "admin" });
  assert(!reset.headers.getSetCookie().some(value => /cs2_session=[^;]/.test(value)));
  assert.equal(db.prepare("SELECT count(*) n FROM sessions WHERE user_id=?").get(client.id).n, 0);
  assert.equal((await call("/api/auth/me", undefined, 200, oldCookie)).data.user, null);
  assert.equal(db.prepare("SELECT role FROM users WHERE id=?").get(client.id).role, "client");
  await call("/api/auth/reset-password", { token, password: newPassword }, 400);
  await call("/api/auth/login", { email: client.email, password }, 401);
  const recovered = await call("/api/auth/login", { email: client.email, password: newPassword });
  assert.equal(work().sent, 1); assert.match(letters().at(-1).subject, /Пароль.*изменён/);

  const raceToken = await resetLink(race);
  const responses = await Promise.all([1, 2].map(() => fetch(base + "/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ token: raceToken, password: newPassword }) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
  await Promise.all(responses.map(response => response.text()));
  const expired = await resetLink(race);
  db.prepare("UPDATE password_resets SET expires_at=0 WHERE id=?").run(hash(expired));
  await call("/api/auth/reset-password-check", { token: expired }, 400);

  const secret = generateSecret();
  db.prepare("INSERT INTO two_factors(user_id,secret,enabled_at,expires_at) VALUES(?,?,?,0)").run(admin.id, sealSecret(admin.id, secret), Date.now());
  const codes = generateRecoveryCodes();
  for (const code of codes) db.prepare("INSERT INTO recovery_codes(id,user_id) VALUES(?,?)").run(recoveryHash(admin.id, code), admin.id);
  const adminToken = await resetLink(admin);
  assert.equal((await call("/api/auth/reset-password-check", { token: adminToken })).data.twoFactorRequired, true);
  const challenge = await call("/api/auth/login", { email: admin.email, password });
  assert.equal(challenge.data.twoFactorRequired, true);
  await call("/api/auth/reset-password", { token: adminToken, password: newPassword }, 401);
  await call("/api/auth/reset-password", { token: adminToken, password: newPassword, code: "wrong" }, 401);
  await call("/api/auth/reset-password", { token: adminToken, password: newPassword, code: codes[0] });
  assert(db.prepare("SELECT enabled_at FROM two_factors WHERE user_id=?").get(admin.id).enabled_at);
  assert.equal(db.prepare("SELECT count(*) n FROM recovery_codes WHERE user_id=?").get(admin.id).n, 9);
  assert.equal(db.prepare("SELECT count(*) n FROM auth_challenges WHERE user_id=?").get(admin.id).n, 0);
  assert.equal((await call("/api/auth/login", { email: admin.email, password: newPassword })).data.twoFactorRequired, true);
  const next = await resetLink(admin);
  await call("/api/auth/reset-password", { token: next, password, code: codes[0] }, 401);
  await call("/api/auth/reset-password", { token: next, password, code: totp(secret, Math.floor(Date.now() / 30000)) });
  const pending = await call("/api/auth/login", { email: admin.email, password });
  const loggedAdmin = await call("/api/auth/two-factor-login", { code: codes[1] }, 200, pending.cookie);

  const initial = (await call("/api/notifications", undefined, 200, recovered.cookie)).data;
  assert.equal(initial.orderUpdates, true);
  await call("/api/notifications", undefined, 401);
  await call("/api/notifications", { language: "ru", orderUpdates: false, chatReminders: false }, 403, recovered.cookie, "PATCH", "https://evil.example");
  await call("/api/notifications", { language: "en", orderUpdates: false, chatReminders: false, userId: admin.id }, 200, recovered.cookie, "PATCH");
  assert.equal((await call("/api/notifications", undefined, 200, loggedAdmin.cookie)).data.orderUpdates, true);
  const order = (await call("/api/orders", { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true }, 201, recovered.cookie)).data.id;
  assert.equal(db.prepare("SELECT count(*) n FROM mail_outbox WHERE kind='order' AND user_id=?").get(admin.id).n, 1);
  const current = db.prepare("SELECT updated_at FROM orders WHERE id=?").get(order);
  await call(`/api/orders/${order}`, { action: "accept", updatedAt: current.updated_at }, 200, loggedAdmin.cookie, "PATCH");
  assert.equal(db.prepare("SELECT count(*) n FROM mail_outbox WHERE kind='order' AND user_id=?").get(client.id).n, 0);
  await call("/api/notifications", { language: "en", orderUpdates: true, chatReminders: true }, 200, recovered.cookie, "PATCH");
  await call(`/api/orders/${order}/messages`, { body: "Synthetic private message", clientId: crypto.randomUUID() }, 201, loggedAdmin.cookie);
  assert.equal(db.prepare("SELECT count(*) n FROM mail_outbox WHERE kind='chat-order' AND user_id=?").get(client.id).n, 1);
  await call(`/api/orders/${order}`, undefined, 200, recovered.cookie);
  db.prepare("UPDATE mail_outbox SET next_attempt_at=0 WHERE kind='chat-order'").run();
  work();
  assert.equal(db.prepare("SELECT status FROM mail_outbox WHERE kind='chat-order' AND user_id=?").get(client.id).status, "skipped");
  assert(!JSON.stringify(letters()).includes("Synthetic private message"));
  assert(!JSON.stringify(letters()).includes(password));

  const cancelledLink = await resetLink(client);
  await call("/api/notifications", { language: "en", orderUpdates: false, chatReminders: false }, 200, recovered.cookie, "PATCH");
  const changed = await call("/api/auth/password", { currentPassword: newPassword, newPassword: password }, 200, recovered.cookie);
  await call("/api/auth/reset-password-check", { token: cancelledLink }, 400);
  assert.equal((await call("/api/auth/me", undefined, 200, recovered.cookie)).data.user, null);
  assert.equal((await call("/api/auth/me", undefined, 200, changed.cookie)).data.user.id, client.id);
  work();
  assert.match(letters().filter(l => l.to[0] === client.email).at(-1).subject, /Your CS2 Boost password changed/);

  const before = letters().filter(l => /не отвечает|Unavailable|unavailable|снова доступен/.test(l.subject)).length;
  for (let attempt = 0; attempt < 4; attempt++) work({ EMAIL_MONITOR: "1", SITE_HEALTH_RESULT: "down", INTERNAL_PORT: String(port) });
  work({ EMAIL_MONITOR: "1", SITE_HEALTH_RESULT: "up", INTERNAL_PORT: String(port) });
  work({ EMAIL_MONITOR: "1", SITE_HEALTH_RESULT: "up", INTERNAL_PORT: String(port) });
  assert.equal(letters().filter(l => /не отвечает|Unavailable|unavailable|снова доступен/.test(l.subject)).length - before, 2);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  console.log(JSON.stringify({ ok: true, genericRecovery: true, encryptedQueue: true, singleUse: true, concurrentReset: true, sessionsRevoked: true, twoFactorPreserved: true, notificationPreferences: true, readReminderCancelled: true, monitorDeduplicated: true, realEmailsSent: 0 }));
} finally {
  db.close(); server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
  if (process.env.SITE_KEEP_FIXTURES !== "1") rmSync(directory, { recursive: true, force: true });
}
