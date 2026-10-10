import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { databasePath } from "../db/connection.mjs";
import { hashPassword } from "../lib/password.ts";

const base = process.env.SITE_TEST_URL ?? "http://127.0.0.1:3000";
const origin = process.env.SITE_TEST_ORIGIN || new URL(base).origin;
const nonce = crypto.randomUUID().slice(0, 8);
const password = "LocalSmokeTestPassword_2026";
const newPassword = "LocalSmokeTestNewPassword_2026";
const adminEmail = `admin-${nonce}@example.test`;
const clientEmail = `client-${nonce}@example.test`;
const strangerEmail = `stranger-${nonce}@example.test`;
const local = new URL(base).hostname === "localhost" || new URL(base).hostname === "127.0.0.1";
if (!local) throw new Error("This smoke test changes the database and only runs on localhost");
const dbFile = databasePath();
mkdirSync("work", { recursive: true });
function sql(command) {
  const database = new DatabaseSync(dbFile);
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
    headers: { "X-Real-IP": "127.0.0.1", Connection: "close", ...(body ? { "Content-Type": "application/json" } : {}), ...(method !== "GET" ? { Origin: origin } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (path === "/api/auth/login" && response.status === 200 && origin.startsWith("https:")) {
    assert.match(response.headers.get("set-cookie") ?? "", /^__Host-cs2_session=.+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure$/);
  }
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); } catch { result = { error: raw }; }
  if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status} ${JSON.stringify(result)}`);
  return { result, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

async function fixture(email) {
  const id = crypto.randomUUID();
  const database = new DatabaseSync(dbFile);
  try { database.prepare("INSERT INTO users (id,email,password_hash,email_verified_at,created_at) VALUES (?,?,?,?,?)").run(id,email,await hashPassword(password),Date.now(),Date.now()); }
  finally { database.close(); }
  fixtureIds.push(id);
  return call("/api/auth/login", { method: "POST", body: { email, password } });
}
const admin = await fixture(adminEmail);
if (admin.result.user.role !== "client") throw new Error("Client fixture unexpectedly has admin role");
const adminCookie = admin.cookie;
const client = await fixture(clientEmail);
let clientCookie = client.cookie;
const stranger = await fixture(strangerEmail);
const strangerCookie = stranger.cookie;
await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true }, headers: { Origin: "https://evil.example" }, expected: 403 });

sql(`UPDATE users SET role = 'admin' WHERE id = '${admin.result.user.id}'`);
const promoted = await call("/api/auth/me", { cookie: adminCookie });
if (promoted.result.user.role !== "admin") throw new Error("Admin role was not applied");

const created = await call("/api/orders", { method: "POST", cookie: clientCookie, body: { platform: "premier", service: "rating", method: "duo", current: 4000, target: 5000, riskAccepted: true, attribution: { source: "telegram", medium: "paid_social", campaign: nonce, content: "test_channel", role: "admin" } }, expected: 201 });
const id = created.result.id;
await call("/api/analytics", { expected: 401 });
await call("/api/analytics", { cookie: clientCookie, expected: 403 });
const analytics = await call("/api/analytics", { cookie: adminCookie });
const campaign = analytics.result.rows.find(row => row.campaign === nonce);
assert.equal(campaign?.source, "telegram");
assert.equal(campaign?.requests, 1);
assert.equal(campaign?.content, "test_channel");
assert.equal(campaign?.completed, 0);
const initial = await call(`/api/orders/${id}`, { cookie: adminCookie });
await call(`/api/orders/${id}`, { cookie: strangerCookie, expected: 404 });
const listing = await call("/api/orders", { cookie: adminCookie });
if (!listing.result.orders.some(order => order.id === id)) throw new Error("Admin cannot see order");
await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { action: "propose", amount: 500000, days: 5, reason: "Additional scheduling requirements", updatedAt: initial.result.order.updatedAt } });
const detail = await call(`/api/orders/${id}`, { cookie: clientCookie });
if (detail.result.order.proposalAmount !== 500000 || detail.result.order.totalAmount !== 50000) throw new Error("Client cannot see the proposal alongside the original price");
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

await call(`/api/orders/${id}`, { method: "PATCH", cookie: adminCookie, body: { status: "awaiting_payment", quotedPrice: 6000, deadline: "2026-10-10", updatedAt: final.result.order.updatedAt }, expected: 400 });
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
for (const path of [`/api/orders/${id}`, "/api/support"]) {
  const seen = new Set();
  let cursor = `${rows[0].time}:${rows[0].id}`;
  let more;
  do {
    const { result } = await call(`${path}?after=${encodeURIComponent(cursor)}`, { cookie: clientCookie });
    assert(result.messages.length <= 50);
    for (const message of result.messages) { assert(!seen.has(message.id)); seen.add(message.id); }
    assert.notEqual(result.latestCursor, cursor);
    cursor = result.latestCursor;
    more = result.hasMore;
  } while (more);
  assert.equal(seen.size, 204, "Messages missing after reconnecting to chat");
  await call(`${path}?after=invalid`, { cookie: clientCookie, expected: 400 });
  await call(`${path}?after=${encodeURIComponent(cursor)}&before=${encodeURIComponent(cursor)}`, { cookie: clientCookie, expected: 400 });
}
const sampleOrders = Array.from({length:130}, (_, index) => ({ id: crypto.randomUUID(), owner: index % 2 ? stranger.result.user.id : client.result.user.id, status: ["new","quoted","awaiting_payment","in_progress","completed","cancelled"][index % 6], platform: index % 3 ? "premier" : "faceit", time: Date.now() - (index + 1) * 60000 }));
sql(sampleOrders.map((order,index) => `INSERT INTO orders (id,user_id,platform,service,method,current_rating,target_rating,status,quoted_price,quoted_currency,deadline,risk_accepted_at,created_at,updated_at) VALUES ('${order.id}','${order.owner}','${order.platform}','rating','${index % 2 ? "piloted" : "duo"}',${1000+index*50},${2000+index*50},'${order.status}',${order.status === "new" ? "NULL" : 5000+index*200},'KZT','2026-10-15',${order.time},${order.time},${order.time});`).join("\n"));
const seenOrders = new Set();
for (let page = 1; page <= 6; page++) {
  const { result } = await call(`/api/orders?q=${nonce}&page=${page}`, { cookie: adminCookie });
  assert.equal(result.total,131); assert.equal(result.page,page);
  assert(result.orders.length <= 25);
  for (const order of result.orders) { assert(!seenOrders.has(order.id)); seenOrders.add(order.id); }
}
assert.equal(seenOrders.size,131);
const oldest = sampleOrders.at(-1);
const olderSearch = await call(`/api/orders?q=${oldest.id}`, { cookie: adminCookie });
assert.equal(olderSearch.result.orders[0].id,oldest.id);
const privateSearch = await call(`/api/orders?q=${oldest.id}`, { cookie: clientCookie });
assert.equal(privateSearch.result.total,0);
const filtered = await call(`/api/orders?q=${nonce}&platform=faceit&status=in_progress`, { cookie: adminCookie });
assert(filtered.result.orders.length > 0); assert(filtered.result.orders.every(order => order.platform === "faceit" && order.status === "in_progress"));
const oldChat = await call(`/api/inbox?kind=orders&q=${oldest.id}`, { cookie: adminCookie });
assert.equal(oldChat.result.total,1); assert.equal(oldChat.result.orderChats[0].id,oldest.id);
const mixedChats = await call(`/api/inbox?kind=all&q=${encodeURIComponent(clientEmail)}`, { cookie: adminCookie });
assert.equal(mixedChats.result.totals.orders,66);
assert.equal(mixedChats.result.totals.support,1);
assert.equal(mixedChats.result.total,67);
assert.equal(mixedChats.result.pages,3);
await call('/api/orders?page=-1', { cookie: adminCookie, expected:400 });
await call('/api/inbox?kind=other', { cookie: adminCookie, expected:400 });
const sentMessage = await call(`/api/orders/${sampleOrders[0].id}/messages`, { method:"POST", cookie:clientCookie, body:{body:"Could we discuss the schedule?"}, expected:201 });
assert.equal(sentMessage.result.message.body,"Could we discuss the schedule?");
assert.equal(sentMessage.result.message.senderRole,"client");
const waiting = await call(`/api/orders?q=${sampleOrders[0].id}&reply=1`, { cookie:adminCookie });
assert.equal(waiting.result.total,1);
const adminReply = await call(`/api/orders/${sampleOrders[0].id}/messages`, { method:"POST", cookie:adminCookie, body:{body:"Yes, let us agree on a time."}, expected:201 });
assert.equal(adminReply.result.message.senderRole,"admin");
assert(adminReply.result.message.createdAt > sentMessage.result.message.createdAt);
const labelledChat = await call(`/api/orders/${sampleOrders[0].id}`, { cookie:clientCookie });
assert.equal(labelledChat.result.messages.at(-1).senderRole,"admin");
assert.equal(labelledChat.result.messages.at(-1).senderEmail,undefined);
const answered = await call(`/api/orders?q=${sampleOrders[0].id}&reply=1`, { cookie:adminCookie });
assert.equal(answered.result.total,0);
const retryId = crypto.randomUUID();
const retryPath = `/api/orders/${sampleOrders[2].id}/messages`;
const repeated = await Promise.all(Array.from({length:3}, () => call(retryPath, {method:"POST",cookie:clientCookie,body:{body:"A retry must stay one message",clientId:retryId},expected:201})));
assert(repeated.every(item => item.result.message.id === retryId && item.result.message.createdAt === repeated[0].result.message.createdAt));
const retryHistory = await call(`/api/orders/${sampleOrders[2].id}`, {cookie:clientCookie});
assert.equal(retryHistory.result.messages.filter(message => message.id === retryId).length,1);
await call(retryPath, {method:"POST",cookie:clientCookie,body:{body:"Different content",clientId:retryId},expected:409});
await call(retryPath, {method:"POST",cookie:adminCookie,body:{body:"A retry must stay one message",clientId:retryId},expected:409});
await call(`/api/orders/${sampleOrders[4].id}/messages`, {method:"POST",cookie:clientCookie,body:{body:"A retry must stay one message",clientId:retryId},expected:409});
await call(retryPath, {method:"POST",cookie:clientCookie,body:{body:"Invalid reference",clientId:"not-a-uuid"},expected:400});
const supportRetryId = crypto.randomUUID();
const supportRetry = await call("/api/support", {method:"POST",cookie:clientCookie,body:{body:"Support retry",clientId:supportRetryId},expected:201});
const supportAgain = await call(`/api/support/${supportId}/messages`, {method:"POST",cookie:clientCookie,body:{body:"Support retry",clientId:supportRetryId},expected:201});
assert.deepEqual(supportAgain.result.message,supportRetry.result.message);
const supportRetryHistory = await call("/api/support", {cookie:clientCookie});
assert.equal(supportRetryHistory.result.messages.filter(message => message.id === supportRetryId).length,1);
await call(`/api/support/${supportId}/messages`, {method:"POST",cookie:adminCookie,body:{body:"Support retry",clientId:supportRetryId},expected:409});
const changed = await call("/api/auth/password", { method: "POST", cookie: clientCookie, body: { currentPassword: password, newPassword } });
if (!changed.cookie) throw new Error("Password change did not issue a new session");
const expired = await call("/api/auth/me", { cookie: clientCookie });
if (expired.result.user !== null) throw new Error("Old session survived password change");
const staleToken="ab".repeat(32);
const staleHash=createHash("sha256").update(staleToken).digest("hex");
sql(`INSERT INTO sessions (id,user_id,expires_at,version) VALUES ('${staleHash}','${client.result.user.id}',${Date.now()+60000},0)`);
const raced=await call("/api/auth/me",{cookie:`${origin.startsWith("https:") ? "__Host-cs2_session" : "cs2_session"}=${staleToken}`});
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

const burst=await Promise.all(Array.from({length:12},()=>fetch(base+"/api/auth/login",{method:"POST",headers:{"X-Real-IP":"127.0.0.1","Content-Type":"application/json",Origin:origin,Connection:"close"},body:JSON.stringify({email:`parallel-${nonce}@example.test`,password})}).then(async response=>{await response.text();return response.status})));
assert.equal(burst.filter(status=>status===401).length,10);
assert.equal(burst.filter(status=>status===429).length,2);
const noOrigin=await fetch(base+"/api/orders",{method:"POST",headers:{"X-Real-IP":"127.0.0.1","Content-Type":"application/json",Cookie:adminCookie,Connection:"close"},body:"{}"});
assert.equal(noOrigin.status,403);await noOrigin.text();
const checks = await fetch(base+"/");
assert.equal(checks.headers.get("x-frame-options"),"DENY");
assert.match(checks.headers.get("content-security-policy")??"",/frame-ancestors 'none'/);
assert.equal(checks.headers.get("x-content-type-options"),"nosniff");
if(process.env.SITE_KEEP_FIXTURES === "1")writeFileSync("work/ui-audit-fixture.json",JSON.stringify({adminEmail,clientEmail,password,newPassword,id,supportId}));
console.log(JSON.stringify({ ok: true, securityHeaders:true, concurrentThrottle:true, historyPagination:true, strictValidation:true, staleSessions:true, staleQuotes:true, orderId: id, supportId, clientRole: client.result.user.role, adminRole: promoted.result.user.role, status: final.result.order.status, messages: final.result.messages.length, supportMessages: reopened.result.messages.length, passwordChange: true, logoutAll: true, loginThrottle: true }));

} finally {
  if(fixtureIds.length){
    for(const id of fixtureIds)assert.match(id,/^[0-9a-f-]{36}$/);
    const ids=fixtureIds.map(id=>"'"+id+"'").join(",");
    const cleanup=`DELETE FROM messages WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (${ids})); DELETE FROM support_messages WHERE thread_id IN (SELECT id FROM support_threads WHERE user_id IN (${ids})); DELETE FROM support_threads WHERE user_id IN (${ids}); DELETE FROM orders WHERE user_id IN (${ids}); DELETE FROM sessions WHERE user_id IN (${ids}); DELETE FROM users WHERE id IN (${ids});`;
    if(process.env.SITE_KEEP_FIXTURES === "1")writeFileSync("work/ui-audit-cleanup.sql",cleanup);
    else sql(cleanup);
  }
}
