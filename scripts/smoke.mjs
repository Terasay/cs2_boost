import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const base = process.env.SITE_TEST_URL ?? "http://localhost:5173";
const origin = new URL(base).origin;
const nonce = crypto.randomUUID().slice(0, 8);
const password = "LocalSmokeTestPassword_2026";
const newPassword = "LocalSmokeTestNewPassword_2026";
const adminEmail = `admin-${nonce}@example.test`;
const clientEmail = `client-${nonce}@example.test`;
const strangerEmail = `stranger-${nonce}@example.test`;
const local = new URL(base).hostname === "localhost" || new URL(base).hostname === "127.0.0.1";
if (!local) throw new Error("This smoke test changes the local D1 database and only runs on localhost");
const registerKey = createHash("sha256").update("register:local:").digest("hex");
execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", `DELETE FROM auth_attempts WHERE key = '${registerKey}'`, "--yes"], { stdio: "ignore" });

async function call(path, { method = "GET", body, cookie = "", headers = {}, expected = 200 } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); } catch { result = { error: raw }; }
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status} ${JSON.stringify(result)}`);
  return { result, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

const admin = await call("/api/auth/register", { method: "POST", body: { email: adminEmail, password } });
if (admin.result.user.role !== "client") throw new Error("Public registration granted admin role");
let adminCookie = admin.cookie;
const client = await call("/api/auth/register", { method: "POST", body: { email: clientEmail, password } });
let clientCookie = client.cookie;
const stranger = await call("/api/auth/register", { method: "POST", body: { email: strangerEmail, password } });
const strangerCookie = stranger.cookie;
await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true }, headers: { Origin: "https://evil.example" }, expected: 403 });

execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--command", `UPDATE users SET role = 'admin' WHERE email = '${adminEmail}'`, "--yes"], { stdio: "ignore" });
const promoted = await call("/api/auth/me", { cookie: adminCookie });
if (promoted.result.user.role !== "admin") throw new Error("Admin role was not applied");

const created = await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true }, expected: 201 });
const id = created.result.id;
await call(`/api/orders/${id}`, { cookie: strangerCookie, expected: 404 });
const listing = await call("/api/orders", { cookie: adminCookie });
if (!listing.result.orders.some(order => order.id === id)) throw new Error("Admin cannot see order");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "quoted", quotedPrice: 5000, deadline: "2026-10-10" } });
const detail = await call(`/api/orders/${id}`, { cookie: clientCookie });
if (detail.result.order.quotedPrice !== 5000) throw new Error("Client cannot see quote");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: clientCookie, body: { action: "accept" } });
await call(`/api/orders/${id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "When can we start?" }, expected: 201 });
const final = await call(`/api/orders/${id}`, { cookie: adminCookie });
if (final.result.order.status !== "awaiting_payment" || final.result.messages.length !== 1) throw new Error("Order flow did not persist");

const changed = await call("/api/auth/password", { method: "POST", cookie: clientCookie, body: { currentPassword: password, newPassword } });
if (!changed.cookie) throw new Error("Password change did not issue a new session");
const expired = await call("/api/auth/me", { cookie: clientCookie });
if (expired.result.user !== null) throw new Error("Old session survived password change");
clientCookie = changed.cookie;
await call("/api/auth/login", { method: "POST", body: { email: clientEmail, password }, expected: 401 });
const relogin = await call("/api/auth/login", { method: "POST", body: { email: clientEmail, password: newPassword } });
if (!relogin.cookie) throw new Error("New password login failed");
await call("/api/auth/logout-all", { method: "POST", cookie: clientCookie });
const gone = await call("/api/auth/me", { cookie: relogin.cookie });
if (gone.result.user !== null) throw new Error("Logout-all did not revoke sessions");
for (let attempt = 0; attempt < 10; attempt++) await call("/api/auth/login", { method: "POST", body: { email: `missing-${nonce}@example.test`, password }, expected: 401 });
await call("/api/auth/login", { method: "POST", body: { email: `missing-${nonce}@example.test`, password }, expected: 429 });

console.log(JSON.stringify({ ok: true, orderId: id, clientRole: client.result.user.role, adminRole: promoted.result.user.role, status: final.result.order.status, messages: final.result.messages.length, passwordChange: true, logoutAll: true, loginThrottle: true }));
