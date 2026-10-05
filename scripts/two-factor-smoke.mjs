import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { hashPassword } from "../lib/password.ts";
import { totp, tokenHash } from "../lib/two-factor.mjs";

mkdirSync("work", { recursive: true });
const directory = mkdtempSync(resolve("work/two-factor-smoke-"));
const dbPath = join(directory,"database.sqlite");
const probe = createServer(); await new Promise(resolve => probe.listen(0,"127.0.0.1",resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
const env = { ...process.env, NODE_ENV:"production", APP_ORIGIN:base, TRUST_PROXY:"0", SEARCH_INDEXING:"0", DATABASE_PATH:dbPath, TWO_FACTOR_KEY:randomBytes(32).toString("hex"), ORDER_ACCESS_KEY:randomBytes(32).toString("hex"), RESEND_API_KEY:"", MAIL_FROM:"" };
const migration = spawnSync(process.execPath,["scripts/migrate.mjs"],{env,encoding:"utf8"}); assert.equal(migration.status,0,migration.stderr);
const db = new Database(dbPath); db.pragma("foreign_keys=ON");
const server = spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
let logs = "", keepServer = false; server.stdout.on("data",value => logs += value); server.stderr.on("data",value => logs += value);
const password = "TwoFactorTestPassword_2026";
function cookies(response) { return response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }
async function call(path,cookie="",body,expected=200,origin=base) {
  const response = await fetch(base+path,{ method:body ? "POST" : "GET", headers:{ Origin:origin, "Content-Type":"application/json", Cookie:cookie },body:body ? JSON.stringify(body) : undefined });
  const data = await response.json(); assert.equal(response.status,expected,`${path}: ${JSON.stringify(data)}`);
  return { data,cookie:cookies(response),headers:response.headers };
}
const login = email => call("/api/auth/login","",{email,password});
const clearLimits = () => db.prepare("DELETE FROM auth_attempts").run();
async function fixture(name,role="admin") {
  const id=crypto.randomUUID(),email=`${name}@example.test`;
  db.prepare("INSERT INTO users(id,email,password_hash,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?)").run(id,email,await hashPassword(password),role,Date.now(),Date.now());
  return { id,email,...await login(email) };
}
try {
  for(let n=0;n<150;n++){ if(server.exitCode !== null)throw new Error(logs);try {if((await fetch(base+"/api/health")).ok)break;}catch{} await delay(100);if(n===149)throw new Error(logs); }
  const a = await fixture("admin-a"), b = await fixture("admin-b"), client = await fixture("client","client");
  const otherSession = (await login(a.email)).cookie;
  await call("/api/auth/two-factor","",undefined,401);
  await call("/api/auth/two-factor",client.cookie,undefined,403);
  await call("/api/auth/two-factor-setup",client.cookie,{password},403);
  await call("/api/auth/two-factor-setup",a.cookie,{password},403,"https://evil.example");
  await call("/api/auth/two-factor-setup",a.cookie,{password:"wrong"},401);
  let setup = (await call("/api/auth/two-factor-setup",a.cookie,{password})).data;
  assert.match(setup.qr,/^data:image\/png;base64,/); assert.equal(setup.secret.length,32);
  assert(!db.prepare("SELECT secret FROM two_factors WHERE user_id=?").get(a.id).secret.includes(setup.secret));
  const status = await call("/api/auth/two-factor",a.cookie); assert.deepEqual(status.data,{enabled:false,recoveryRemaining:0});
  await call("/api/auth/two-factor-enable",b.cookie,{password,code:totp(setup.secret,Math.floor(Date.now()/30000))},409);
  db.prepare("UPDATE two_factors SET expires_at=? WHERE user_id=?").run(Date.now()-1,a.id);
  await call("/api/auth/two-factor-enable",a.cookie,{password,code:totp(setup.secret,Math.floor(Date.now()/30000))},409);
  setup = (await call("/api/auth/two-factor-setup",a.cookie,{password})).data;
  await call("/api/auth/two-factor-enable",a.cookie,{password,code:"bad-code"},401);
  const enabled = await call("/api/auth/two-factor-enable",a.cookie,{password,code:totp(setup.secret,Math.floor(Date.now()/30000))});
  let accountCookie = enabled.cookie; const codes = enabled.data.recoveryCodes;
  assert.equal(codes.length,10); assert(!JSON.stringify(db.prepare("SELECT * FROM recovery_codes").all()).includes(codes[0]));
  assert.equal((await call("/api/auth/me",otherSession)).data.user,null);
  assert.equal((await call("/api/auth/me",a.cookie)).data.user,null);
  assert.equal((await call("/api/auth/me",accountCookie)).data.user.twoFactorEnabled,true);
  await call("/api/auth/two-factor-setup",accountCookie,{password},409);

  const forgedSessionToken = randomBytes(32).toString("hex");
  const version = db.prepare("SELECT session_version FROM users WHERE id=?").get(a.id).session_version;
  db.prepare("INSERT INTO sessions(id,user_id,expires_at,version,two_factor_verified) VALUES(?,?,?,?,0)").run(tokenHash(forgedSessionToken),a.id,Date.now()+60000,version);
  assert.equal((await call("/api/auth/me",`cs2_session=${forgedSessionToken}`)).data.user,null);
  clearLimits();
  let challenge = await login(a.email);
  assert.equal(challenge.data.twoFactorRequired,true); assert.equal(challenge.data.user,undefined);
  assert(challenge.headers.getSetCookie().some(value => /cs2_mfa=.+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=300/.test(value)));
  assert.equal((await call("/api/auth/me",challenge.cookie)).data.user,null);
  await call("/api/orders",challenge.cookie,undefined,401);
  await call("/api/promos",challenge.cookie,undefined,401);
  await call("/api/auth/two-factor-login",challenge.cookie,{code:"invalid"},401);
  const lastStep = db.prepare("SELECT last_step FROM two_factors WHERE user_id=?").get(a.id).last_step;
  await call("/api/auth/two-factor-login",challenge.cookie,{code:totp(setup.secret,lastStep)},401);
  await call("/api/auth/two-factor-login","",{code:codes[0]},401);
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[0]},403,"https://evil.example");
  const recovered = await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[0]}); accountCookie = recovered.cookie;
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[1]},401);
  assert.equal((await call("/api/auth/two-factor",accountCookie)).data.recoveryRemaining,9);
  await call("/api/promos",accountCookie);
  challenge = await login(a.email);
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[0]},401);
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[1]});
  challenge = await login(a.email);
  db.prepare("UPDATE auth_challenges SET expires_at=0 WHERE user_id=?").run(a.id);
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[2]},401);
  challenge = await login(a.email);
  db.prepare("UPDATE users SET session_version=session_version+1 WHERE id=?").run(a.id);
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[2]},401);
  clearLimits();
  const c1 = await login(a.email), c2 = await login(a.email);
  const concurrent = await Promise.all([c1,c2].map(c => fetch(base+"/api/auth/two-factor-login",{method:"POST",headers:{Origin:base,"Content-Type":"application/json",Cookie:c.cookie},body:JSON.stringify({code:codes[2]})})));
  assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,401]);
  accountCookie = cookies(concurrent.find(response=>response.status===200));
  for(const response of concurrent)await response.json();

  const newPassword = "ChangedTwoFactorPassword_2026";
  await call("/api/auth/password",accountCookie,{currentPassword:password,newPassword},401);
  const changed = await call("/api/auth/password",accountCookie,{currentPassword:password,newPassword,code:codes[3]}); accountCookie=changed.cookie;
  assert.equal((await call("/api/auth/me",accountCookie)).data.user.twoFactorEnabled,true);
  await call("/api/auth/login","",{email:a.email,password},401);
  challenge = await call("/api/auth/login","",{email:a.email,password:newPassword});
  db.prepare("UPDATE two_factors SET last_step=-1 WHERE user_id=?").run(a.id);
  const fresh = await call("/api/auth/two-factor-login",challenge.cookie,{code:totp(setup.secret,Math.floor(Date.now()/30000))}); accountCookie=fresh.cookie;
  clearLimits();
  const regenerated = await call("/api/auth/two-factor-recovery",accountCookie,{password:newPassword,code:codes[4]}); accountCookie=regenerated.cookie;
  assert.equal(regenerated.data.recoveryCodes.length,10);
  challenge = await call("/api/auth/login","",{email:a.email,password:newPassword});
  await call("/api/auth/two-factor-login",challenge.cookie,{code:codes[5]},401);
  accountCookie=(await call("/api/auth/two-factor-login",challenge.cookie,{code:regenerated.data.recoveryCodes[0]})).cookie;
  await call("/api/auth/two-factor-disable",accountCookie,{password:"wrong",code:regenerated.data.recoveryCodes[1]},401);
  await call("/api/auth/two-factor-disable",accountCookie,{password:newPassword,code:"bad"},401);
  const disabled = await call("/api/auth/two-factor-disable",accountCookie,{password:newPassword,code:regenerated.data.recoveryCodes[1]});
  assert.equal(disabled.data.enabled,false); assert.equal(db.prepare("SELECT count(*) AS n FROM recovery_codes WHERE user_id=?").get(a.id).n,0);
  assert.equal((await call("/api/auth/me",accountCookie)).data.user,null);
  assert.equal((await call("/api/auth/login","",{email:a.email,password:newPassword})).data.twoFactorRequired,undefined);

  clearLimits();
  const bSetup = (await call("/api/auth/two-factor-setup",b.cookie,{password})).data;
  const bEnabled = await call("/api/auth/two-factor-enable",b.cookie,{password,code:totp(bSetup.secret,Math.floor(Date.now()/30000))});
  const limited = await login(b.email);
  for(let n=0;n<10;n++)await call("/api/auth/two-factor-login",limited.cookie,{code:"invalid"},401);
  const blocked = await call("/api/auth/two-factor-login",limited.cookie,{code:bEnabled.data.recoveryCodes[0]},429);assert(Number(blocked.headers.get("retry-after"))>0);
  const reset = spawnSync(process.execPath,["scripts/reset-two-factor.mjs",b.email,"--confirm"],{env,encoding:"utf8"});assert.equal(reset.status,0,reset.stderr);
  clearLimits(); assert.equal((await login(b.email)).data.twoFactorRequired,undefined);
  assert.equal((await call("/api/auth/me",bEnabled.cookie)).data.user,null);
  console.log(JSON.stringify({ok:true,encryptedSetup:true,noAccessBeforeSecondFactor:true,oldSessionsRevoked:true,totpReplayBlocked:true,recoverySingleUse:true,concurrentRecovery:true,challengeExpiry:true,passwordChangeProtected:true,codeRotation:true,disableProtected:true,rateLimits:true,serverRecovery:true}));
  if(process.env.SITE_KEEP_FIXTURES === "1"){
    const fixtureEnv = Object.fromEntries(["APP_ORIGIN","TRUST_PROXY","SEARCH_INDEXING","DATABASE_PATH","TWO_FACTOR_KEY","ORDER_ACCESS_KEY","RESEND_API_KEY","MAIL_FROM"].map(name=>[name,env[name]]));
    writeFileSync("work/two-factor-ui-fixture.json",JSON.stringify({base,dbPath,adminEmail:a.email,password:newPassword,env:fixtureEnv,serverPid:server.pid}));keepServer=true;
  }
} catch(error){console.error(logs.slice(-3000));throw error;}
finally{db.close();if(!keepServer && server.exitCode===null){const exited=new Promise(resolve=>server.once("exit",resolve));server.kill();await exited;}}
