import assert from "node:assert/strict";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { hashPassword } from "../lib/password.ts";
import { dayMs } from "../lib/pricing.mjs";

mkdirSync("work",{recursive:true});
const directory=mkdtempSync(resolve("work/order-smoke-"));const dbPath=join(directory,"database.sqlite");
const probe=createServer();await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const base=`http://127.0.0.1:${port}`;
const env={...process.env,APP_ORIGIN:base,NODE_ENV:"production",DATABASE_PATH:dbPath,TRUST_PROXY:"0",SEARCH_INDEXING:"0",ORDER_ACCESS_KEY:randomBytes(32).toString("hex")};
const migration=spawnSync(process.execPath,["scripts/migrate.mjs"],{env,encoding:"utf8"});assert.equal(migration.status,0,migration.stderr);
const db=new Database(dbPath);db.pragma("foreign_keys=ON");
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
let logs="";server.stdout.on("data",value=>logs+=value);server.stderr.on("data",value=>logs+=value);
let keepServer = false;
const password="OrderSmokePassword_2026";
async function call(path,cookie="",body,expected=200,method=body?"POST":"GET",origin=base){
  const response=await fetch(base+path,{method,headers:{Origin:origin,"Content-Type":"application/json",Cookie:cookie},body:body?JSON.stringify(body):undefined});
  const data=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);return{data,cookie:response.headers.get("set-cookie")?.split(";")[0]||""};
}
async function fixture(name,role="client") {
  const id=crypto.randomUUID(),email=`${name}@example.test`;
  db.prepare("INSERT INTO users(id,email,password_hash,role,created_at,email_verified_at) VALUES(?,?,?,?,?,?)").run(id,email,await hashPassword(password),role,Date.now(),Date.now());
  return{ id,email,...await call("/api/auth/login","",{email,password}) };
}
try {
  for(let attempt=0;attempt<100;attempt++){if(server.exitCode !== null)throw new Error(logs);try{const response=await fetch(base+"/api/health");if(response.ok)break;}catch{}await delay(100);if(attempt===99)throw new Error(logs);}
  const client=await fixture("client"),admin=await fixture("admin","admin"),other=await fixture("other");
  const create=async(extra={})=>(await call("/api/orders",client.cookie,{platform:"premier",service:"rating",method:"piloted",current:4000,target:6000,riskAccepted:true,redTrust:true,promoCode:"cherep",totalAmount:1,commissionAmount:999999,status:"completed",...extra},201)).data.id;
  const get=async(id,cookie=admin.cookie)=>(await call(`/api/orders/${id}`,cookie)).data;
  const patch=async(id,action,extra={},expected=200,cookie=admin.cookie)=>call(`/api/orders/${id}`,cookie,{action,updatedAt:(await get(id,cookie)).order.updatedAt,...extra},expected,"PATCH");
  await call("/api/promos","",undefined,401);await call("/api/promos",client.cookie,undefined,403);
  await call("/api/orders",client.cookie,{platform:"faceit",service:"rating",method:"duo",current:1000,target:1100,riskAccepted:true,redTrust:true},400);
  await call("/api/orders",client.cookie,{platform:"premier",service:"rating",method:"duo",current:1000,target:2000,riskAccepted:true,promoCode:"unknown"},400);
  await call("/api/orders",client.cookie,{platform:"premier",service:"rating",method:"duo",current:1000,target:2000,riskAccepted:true,expectedTotalAmount:1},409);
  const id=await create();let detail=await get(id);assert.equal(detail.order.totalAmount,88000);assert.equal(detail.order.commissionAmount,17600);assert.equal(detail.order.status,"new");assert.equal(detail.order.initialTotalAmount,88000);assert.equal(detail.order.durationDays,2);
  await call(`/api/orders/${id}/access`,client.cookie,{action:"submit",login:"secret",password:"GamePassword",confirmed:true,updatedAt:detail.order.updatedAt},409);
  await patch(id,"confirm_payment",{receivedAmount:88000,confirmed:true},409);
  await call(`/api/orders/${id}`,other.cookie,undefined,404);
  await patch(id,"accept",{},409,client.cookie);
  await patch(id,"accept");detail=await get(id);assert.equal(detail.order.status,"awaiting_payment");assert.equal(detail.order.totalAmount,88000);
  await patch(id,"confirm_payment",{receivedAmount:88001,confirmed:true},400);
  await patch(id,"confirm_payment",{receivedAmount:88000,confirmed:true},400,client.cookie);
  const paymentVersion=detail.order.updatedAt;
  const paid=await Promise.all([0,1].map(()=>fetch(base+`/api/orders/${id}`,{method:"PATCH",headers:{Origin:base,"Content-Type":"application/json",Cookie:admin.cookie},body:JSON.stringify({action:"confirm_payment",updatedAt:paymentVersion,receivedAmount:88000,confirmed:true})}).then(async response=>{await response.json();return response.status})));
  assert.deepEqual(paid.sort(),[200,409]);assert.equal(db.prepare("SELECT count(*) AS n FROM promo_earnings WHERE order_id=?").get(id).n,1);
  detail=await get(id);assert.equal(detail.order.status,"awaiting_access");assert.equal(detail.order.startedAt,null);assert.equal(detail.order.dueAt,null);
  await patch(id,"propose",{amount:100000,days:2,reason:"Changed after payment"},409);
  await patch(id,"complete",{confirmed:true},409);
  const access={action:"submit",login:"private-login",password:"PrivateGamePassword_2026",confirmed:true,updatedAt:detail.order.updatedAt};
  await call(`/api/orders/${id}/access`,other.cookie,access,404);
  await call(`/api/orders/${id}/access`,client.cookie,access,403,"POST","https://evil.example");
  await call(`/api/orders/${id}/access`,client.cookie,access);
  detail=await get(id);assert.equal(detail.order.status,"in_progress");const {startedAt,dueAt}=detail.order;assert.equal(dueAt-startedAt,2*dayMs);
  const sealed=db.prepare("SELECT payload FROM order_access WHERE order_id=?").get(id).payload;assert(!sealed.includes(access.password));assert(!sealed.includes(access.login));assert(!JSON.stringify(detail).includes(access.password));
  await call(`/api/orders/${id}/access`,client.cookie,{action:"reveal"},403);
  const revealed=await call(`/api/orders/${id}/access`,admin.cookie,{action:"reveal"});assert.equal(revealed.data.access.password,access.password);
  await call(`/api/orders/${id}/access`,client.cookie,{...access,updatedAt:detail.order.updatedAt,password:"ChangedGamePassword_2026"});
  detail=await get(id);assert.equal(detail.order.startedAt,startedAt);assert.equal(detail.order.dueAt,dueAt);
  await patch(id,"delay",{days:1,reason:"Additional scheduling time",bonus:"One extra duo session"});
  detail=await get(id);assert.equal(detail.order.dueAt,dueAt+dayMs);assert.equal(detail.order.startedAt,startedAt);assert(detail.events.some(event=>event.type === "delay" && event.details.bonus));
  await patch(id,"cancel",{reason:"Trying to cancel paid order"},409);
  await patch(id,"complete",{confirmed:true});assert.equal(db.prepare("SELECT count(*) AS n FROM order_access WHERE order_id=?").get(id).n,0);
  await call(`/api/orders/${id}/access`,admin.cookie,{action:"reveal"},409);
  let report=(await call("/api/promos",admin.cookie)).data;let cherep=report.codes.find(code=>code.code === "Cherep");assert.equal(cherep.earned,17600);assert.equal(cherep.paidOrders,1);
  await patch(id,"refund",{confirmed:true,reason:"Full amount returned to client"});report=(await call("/api/promos",admin.cookie)).data;cherep=report.codes.find(code=>code.code === "Cherep");assert.equal(cherep.earned,0);assert.equal(cherep.reversed,17600);assert.equal(cherep.paidOrders,0);
  await patch(id,"refund",{confirmed:true,reason:"Duplicate refund"},409);
  const proposedId=await create({method:"duo",redTrust:false,promoCode:"Terasay"});await patch(proposedId,"propose",{amount:150000,days:4,reason:"Special playing schedule"});
  detail=await get(proposedId);assert.equal(detail.order.totalAmount,80000);assert.equal(detail.order.proposalAmount,150000);
  await patch(proposedId,"confirm_payment",{receivedAmount:80000,confirmed:true},409);
  await patch(proposedId,"accept",{},200,client.cookie);detail=await get(proposedId);assert.equal(detail.order.totalAmount,120000);assert.equal(detail.order.durationDays,4);assert.equal(detail.order.initialTotalAmount,80000);assert.equal(detail.order.commissionAmount,24000);
  await patch(proposedId,"confirm_payment",{receivedAmount:120000,confirmed:true});detail=await get(proposedId);
  await call(`/api/orders/${proposedId}/access`,client.cookie,{action:"submit",profile:"https://steamcommunity.com/id/test",note:"EU, 18:00–21:00",confirmed:true,updatedAt:detail.order.updatedAt});
  detail=await get(proposedId);assert.equal(detail.order.dueAt-detail.order.startedAt,4*dayMs);
  db.prepare("UPDATE order_access SET expires_at=? WHERE order_id=?").run(Date.now()-1,proposedId);
  await call(`/api/orders/${proposedId}/access`,admin.cookie,{action:"reveal"},404);assert.equal(db.prepare("SELECT count(*) AS n FROM order_access WHERE order_id=?").get(proposedId).n,0);
  const calibrationId=await create({service:"calibration",current:null,target:null,redTrust:false});await patch(calibrationId,"accept",{},409);await patch(calibrationId,"propose",{amount:200000,days:3,reason:"Calibration scope agreed"});await patch(calibrationId,"accept",{},200,client.cookie);assert.equal((await get(calibrationId)).order.totalAmount,160000);
  const pendingId=await create({promoCode:null,redTrust:false});await patch(pendingId,"cancel",{reason:"No capacity available"});assert.equal((await get(pendingId)).order.status,"cancelled");assert.equal(db.prepare("SELECT count(*) AS n FROM promo_earnings WHERE order_id=?").get(pendingId).n,0);
  report=(await call("/api/promos",admin.cookie)).data;assert.equal(report.codes.find(code=>code.code === "Terasay").earned,24000);
  const full=spawnSync(process.execPath,["scripts/smoke.mjs"],{env:{...env,SITE_TEST_URL:base,SITE_TEST_ORIGIN:base},encoding:"utf8"});assert.equal(full.status,0,full.stderr || full.stdout);
  console.log(JSON.stringify({ok:true,frozenPricing:true,manualPayment:true,concurrentPayment:true,singleEarning:true,encryptedAccess:true,roleIsolation:true,stableTimer:true,transparentOffers:true,refundReversal:true,calibration:true,existingSmoke:true}));
  if(process.env.SITE_KEEP_FIXTURES === "1"){
    writeFileSync("work/order-ui-fixture.json",JSON.stringify({base,dbPath,clientEmail:client.email,adminEmail:admin.email,password,orderId:proposedId,encryptionKey:env.ORDER_ACCESS_KEY}));
    keepServer = true;
  }
}catch(error){console.error(logs.slice(-4000));throw error;}finally{if(!keepServer){db.close();if(server.exitCode === null){const exited=new Promise(resolve=>server.once("exit",resolve));server.kill();await exited;}}}
