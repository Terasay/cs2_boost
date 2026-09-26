const base = process.env.SITE_TEST_URL ?? "http://localhost:5173";
const nonce = crypto.randomUUID().slice(0, 8);
let adminCookie = "";
let clientCookie = "";

async function call(path, { method = "GET", body, cookie = "", headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return { response, result };
}

const password = "LocalSmokeTestPassword_2026";
const signIn = await fetch(base + "/signin-with-chatgpt?return_to=/", { redirect: "manual" });
const ownerCookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
if (!ownerCookie) throw new Error("Local owner sign-in is unavailable");
const admin = await call("/api/auth/register", {
  method: "POST",
  body: { email: `admin-${nonce}@example.test`, password },
  cookie: ownerCookie,
});
adminCookie = admin.response.headers.get("set-cookie")?.split(";")[0] ?? "";
if (admin.result.user.role !== "admin") throw new Error("First authenticated user was not admin");

const client = await call("/api/auth/register", {
  method: "POST",
  body: { email: `client-${nonce}@example.test`, password },
});
clientCookie = client.response.headers.get("set-cookie")?.split(";")[0] ?? "";
if (client.result.user.role !== "client") throw new Error("Second user was not client");

const created = await call("/api/orders", {
  method: "POST", cookie: clientCookie,
  body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true },
});
const id = created.result.id;
const listing = await call("/api/orders", { cookie: adminCookie });
if (!listing.result.orders.some((order) => order.id === id)) throw new Error("Admin cannot see order");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "quoted", quotedPrice: 5000, deadline: "2026-10-10" } });
const detail = await call(`/api/orders/${id}`, { cookie: clientCookie });
if (detail.result.order.quotedPrice !== 5000) throw new Error("Client cannot see quote");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: clientCookie, body: { action: "accept" } });
await call(`/api/orders/${id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "When can we start?" } });
const final = await call(`/api/orders/${id}`, { cookie: adminCookie });
if (final.result.order.status !== "awaiting_payment" || final.result.messages.length !== 1) throw new Error("Order flow did not persist");
console.log(JSON.stringify({ ok: true, orderId: id, status: final.result.order.status, messages: final.result.messages.length }));
