import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { writeFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const base = process.env.SITE_TEST_URL ?? "http://127.0.0.1:8787";
const origin = new URL(base).origin;
const nonce = crypto.randomUUID().slice(0, 8);
const password = "LocalSmokeTestPassword_2026";
const newPassword = "LocalSmokeTestNewPassword_2026";
const adminEmail = `admin-${nonce}@example.test`;
const clientEmail = `client-${nonce}@example.test`;
const strangerEmail = `stranger-${nonce}@example.test`;
const local = new URL(base).hostname === "localhost" || new URL(base).hostname === "127.0.0.1";
if (!local) throw new Error("This smoke test changes the local D1 database and only runs on localhost");
const dbDirectory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const dbFiles = readdirSync(dbDirectory).filter(name => /^[0-9a-f]{64}\.sqlite$/.test(name));
if(dbFiles.length !== 1)throw new Error("Expected one local D1 database for this test");
function sql(command) {
  const database = new DatabaseSync(`${dbDirectory}/${dbFiles[0]}`);
  try { database.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;"); database.exec(command); }
  finally { database.close(); }
}

const keys = ["local", "127.0.0.1", "::1"].flatMap(ip => ["register", "login-ip"].map(scope => createHash("sha256").update(`${scope}:${ip}:`).digest("hex")));
sql(`DELETE FROM auth_attempts WHERE key IN (${keys.map(key=>"'"+key+"'").join(",")})`);
const fixtureIds=[];
try {

async function call(path, { method = "GET", body, cookie = "", headers = {}, expected = 200 } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { Connection: "close", ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); } catch { result = { error: raw }; }
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status} ${JSON.stringify(result)}`);
  return { result, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

const admin = await call("/api/auth/register", { method: "POST", body: { email: adminEmail, password, role: "admin" } });
if (admin.result.user.role !== "client") throw new Error("Public registration granted admin role");
const adminCookie = admin.cookie;
fixtureIds.push(admin.result.user.id);
const client = await call("/api/auth/register", { method: "POST", body: { email: clientEmail, password } });
let clientCookie = client.cookie;
fixtureIds.push(client.result.user.id);
const stranger = await call("/api/auth/register", { method: "POST", body: { email: strangerEmail, password } });
const strangerCookie = stranger.cookie;
fixtureIds.push(stranger.result.user.id);
await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true }, headers: { Origin: "https://evil.example" }, expected: 403 });

sql(`UPDATE users SET role = 'admin' WHERE id = '${admin.result.user.id}'`);
const promoted = await call("/api/auth/me", { cookie: adminCookie });
if (promoted.result.user.role !== "admin") throw new Error("Admin role was not applied");

const created = await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true }, expected: 201 });
const id = created.result.id;
const initial = await call(`/api/orders/${id}`, { cookie: adminCookie });
await call(`/api/orders/${id}`, { cookie: strangerCookie, expected: 404 });
const listing = await call("/api/orders", { cookie: adminCookie });
if (!listing.result.orders.some(order => order.id === id)) throw new Error("Admin cannot see order");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "quoted", quotedPrice: 5000, deadline: "2026-10-10", updatedAt: initial.result.order.updatedAt } });
const detail = await call(`/api/orders/${id}`, { cookie: clientCookie });
if (detail.result.order.quotedPrice !== 5000) throw new Error("Client cannot see quote");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: clientCookie, body: { action: "accept", updatedAt: detail.result.order.updatedAt } });
await call(`/api/orders/${id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "When can we start?" }, expected: 201 });
const final = await call(`/api/orders/${id}`, { cookie: adminCookie });
if (final.result.order.status !== "awaiting_payment" || final.result.messages.length !== 1) throw new Error("Order flow did not persist");

const support = await call("/api/support", { method: "POST", cookie: clientCookie, body: { body: "I need help with my account" }, expected: 201 });
const supportId = support.result.id;
const clientSupport = await call("/api/support", { cookie: clientCookie });
if (clientSupport.result.messages.length !== 1 || clientSupport.result.thread.id !== supportId) throw new Error("Client support conversation was not saved");
await call(`/api/support/${supportId}`, { cookie: strangerCookie, expected: 404 });
await call(`/api/support/${supportId}/messages`, { method: "POST", cookie: strangerCookie, body: { body: "Not my thread" }, expected: 404 });
await call("/api/inbox", { cookie: clientCookie, expected: 403 });
const inbox = await call("/api/inbox", { cookie: adminCookie });
if (!inbox.result.supportChats.some(item => item.id === supportId) || !inbox.result.orderChats.some(item => item.id === id)) throw new Error("Admin inbox is missing a conversation");
await call(`/api/support/${supportId}/messages`, { method: "POST", cookie: adminCookie, body: { body: "We are here to help" }, expected: 201 });
await call(`/api/support/${supportId}`, { method: "PATCH", cookie: adminCookie, body: { status: "closed" } });
await call(`/api/support/${supportId}`, { method: "PATCH", cookie: clientCookie, body: { status: "open" }, expected: 403 });
await call("/api/support", { method: "POST", cookie: clientCookie, body: { body: "One more question" }, expected: 201 });
const reopened = await call(`/api/support/${supportId}`, { cookie: adminCookie });
if (reopened.result.thread.status !== "open" || reopened.result.messages.length !== 3) throw new Error("Support conversation did not reopen");

await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "awaiting_payment", quotedPrice: 6000, deadline: "2026-10-10", updatedAt: final.result.order.updatedAt }, expected: 409 });
for (const current of [null, true, {}, "4000", 1.5]) await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current, target: 5000, riskAccepted: true }, expected: 400 });
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "quoted", quotedPrice: true, deadline: "2026-10-10", updatedAt: final.result.order.updatedAt }, expected: 400 });
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "quoted", quotedPrice: 6000, deadline: "2026-02-30", updatedAt: final.result.order.updatedAt }, expected: 400 });
await call(`/api/orders/${id}`, { method: "PATCH", cookie: clientCookie, body: { action: "accept", updatedAt: detail.result.order.updatedAt }, expected: 409 });
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "quoted", quotedPrice: 9000, deadline: "2026-10-10", updatedAt: initial.result.order.updatedAt }, expected: 409 });
await call(`/api/orders/${id}/messages`, { method: "POST", cookie: strangerCookie, body: { body: "not yours" }, expected: 404 });
await call(`/api/orders/${id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "字".repeat(2000) }, expected: 201 });
await call(`/api/orders/${id}/messages`, { method: "POST", cookie: clientCookie, body: { body: "a".repeat(2001) }, expected: 400 });
await call(`/api/orders/${id}?before=invalid`, { cookie: clientCookie, expected: 400 });
const rows = Array.from({length:205},(_,i)=>({id:crypto.randomUUID(),time:Date.now()+i+1000,body:`History ${i}`}));
sql(rows.map(row=>`INSERT INTO messages (id,order_id,sender_id,body,created_at) VALUES ('${row.id}','${id}','${client.result.user.id}','${row.body}',${row.time}); INSERT INTO support_messages (id,thread_id,sender_id,body,created_at) VALUES ('${row.id}','${supportId}','${client.result.user.id}','${row.body}',${row.time});`).join("\n"));
for(const [path,count] of [[`/api/orders/${id}`,207],["/api/support",208]]){
  let cursor=null;const seen=new Set();let first=true;
  do {
    const {result}=await call(path+(cursor?`?before=${encodeURIComponent(cursor)}`:""),{cookie:clientCookie});
    if(first){assert.equal(result.messages.at(-1).body,"History 204");first=false;}
    for(const message of result.messages){assert(!seen.has(message.id),"Duplicate message on history boundary");seen.add(message.id);}
    cursor=result.nextCursor;
  }while(cursor);
  assert.equal(seen.size,count,"Missing messages in paginated chat");
}
const changed = await call("/api/auth/password", { method: "POST", cookie: clientCookie, body: { currentPassword: password, newPassword } });
if (!changed.cookie) throw new Error("Password change did not issue a new session");
const expired = await call("/api/auth/me", { cookie: clientCookie });
if (expired.result.user !== null) throw new Error("Old session survived password change");
const staleToken="ab".repeat(32);
const staleHash=createHash("sha256").update(staleToken).digest("hex");
sql(`INSERT INTO sessions (id,user_id,expires_at,version) VALUES ('${staleHash}','${client.result.user.id}',${Date.now()+60000},0)`);
const raced=await call("/api/auth/me",{cookie:`cs2_session=${staleToken}`});
assert.equal(raced.result.user,null,"Session issued concurrently with password change survived revocation");
clientCookie = changed.cookie;
await call("/api/auth/login", { method: "POST", body: { email: clientEmail, password }, expected: 401 });
const relogin = await call("/api/auth/login", { method: "POST", body: { email: clientEmail, password: newPassword } });
if (!relogin.cookie) throw new Error("New password login failed");
await call("/api/auth/logout-all", { method: "POST", cookie: clientCookie });
const gone = await call("/api/auth/me", { cookie: relogin.cookie });
if (gone.result.user !== null) throw new Error("Logout-all did not revoke sessions");
for (let attempt = 0; attempt < 10; attempt++) await call("/api/auth/login", { method: "POST", body: { email: `missing-${nonce}@example.test`, password }, expected: 401 });
await call("/api/auth/login", { method: "POST", body: { email: `missing-${nonce}@example.test`, password }, expected: 429 });

const burst=await Promise.all(Array.from({length:12},()=>fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,Connection:"close"},body:JSON.stringify({email:`parallel-${nonce}@example.test`,password})}).then(async response=>{await response.text();return response.status})));
assert.equal(burst.filter(status=>status===401).length,10);
assert.equal(burst.filter(status=>status===429).length,2);
const noOrigin=await fetch(base+"/api/orders",{method:"POST",headers:{"Content-Type":"application/json",Cookie:adminCookie,Connection:"close"},body:"{}"});
assert.equal(noOrigin.status,403);await noOrigin.text();
const checks = await fetch(base+"/");
assert.equal(checks.headers.get("x-frame-options"),"DENY");
assert.match(checks.headers.get("content-security-policy")??"",/frame-ancestors 'none'/);
assert.equal(checks.headers.get("x-content-type-options"),"nosniff");
if(process.env.SITE_KEEP_FIXTURES === "1")writeFileSync(".wrangler/ui-audit-fixture.json",JSON.stringify({adminEmail,clientEmail,password,newPassword,id,supportId}));
console.log(JSON.stringify({ ok: true, securityHeaders:true, concurrentThrottle:true, historyPagination:true, strictValidation:true, staleSessions:true, staleQuotes:true, orderId: id, supportId, clientRole: client.result.user.role, adminRole: promoted.result.user.role, status: final.result.order.status, messages: final.result.messages.length, supportMessages: reopened.result.messages.length, passwordChange: true, logoutAll: true, loginThrottle: true }));

} finally {
  if(fixtureIds.length){
    for(const id of fixtureIds)assert.match(id,/^[0-9a-f-]{36}$/);
    const ids=fixtureIds.map(id=>"'"+id+"'").join(",");
    const cleanup=`DELETE FROM messages WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (${ids})); DELETE FROM support_messages WHERE thread_id IN (SELECT id FROM support_threads WHERE user_id IN (${ids})); DELETE FROM support_threads WHERE user_id IN (${ids}); DELETE FROM orders WHERE user_id IN (${ids}); DELETE FROM sessions WHERE user_id IN (${ids}); DELETE FROM users WHERE id IN (${ids});`;
    if(process.env.SITE_KEEP_FIXTURES === "1")writeFileSync(".wrangler/ui-audit-cleanup.sql",cleanup);
    else sql(cleanup);
  }
}
