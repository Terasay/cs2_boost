import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { calculatePrice, normalizePromo } from "../lib/pricing.mjs";
import { sealAccess, openAccess } from "../lib/order-access.mjs";

const quote = (platform, current, target, extra = {}) => calculatePrice({ platform, service: "rating", current, target, ...extra });

test("starting rating selects the entire order tier including exact thresholds", () => {
  assert.equal(quote("premier",9000,11000).totalAmount,100000);
  assert.equal(quote("premier",10000,12000).totalAmount,100000);
  assert.equal(quote("premier",10001,12001).totalAmount,140000);
  assert.equal(quote("faceit",1100,1300).totalAmount,100000);
  assert.equal(quote("faceit",1200,1400).totalAmount,100000);
  assert.equal(quote("faceit",1201,1401).totalAmount,140000);
});

test("red trust before discount, owner share after discount, and fractional units", () => {
  const price=quote("premier",4000,6000,{redTrust:true,promoCode:" cherep "});
  assert.deepEqual([price.baseAmount,price.surchargeAmount,price.discountAmount,price.totalAmount,price.commissionAmount,price.durationDays],[100000,10000,22000,88000,17600,2]);
  const standard=quote("faceit",1000,1200,{promoCode:"Terasay"});
  assert.equal(standard.totalAmount,80000);assert.equal(standard.commissionAmount,16000);
  assert.equal(quote("premier",4500,10000).totalAmount,275000);
  assert.equal(quote("premier",4500,10000).durationDays,6);
  assert.equal(quote("premier",0,300).totalAmount,15000);
  assert.equal(quote("faceit",1500,1551).totalAmount,35700);
  assert.equal(quote("faceit",1500,1551).durationDays,1);
});

test("minimum increases and maximum targets are enforced on both platforms", () => {
  for (const [platform, minimum, maximum] of [["premier", 300, 23000], ["faceit", 30, 2000]]) {
    assert.equal(quote(platform, 0, minimum).totalAmount, 15000);
    assert.equal(quote(platform, maximum - minimum, maximum).totalAmount, 21000);
    assert.throws(() => quote(platform, 0, minimum - 1), /must add at least/);
    assert.throws(() => quote(platform, maximum - minimum + 1, maximum), /must add at least/);
    assert.throws(() => quote(platform, maximum - minimum, maximum + 1), /cannot exceed/);
    assert.throws(() => quote(platform, maximum, maximum + minimum), /cannot exceed/);
  }
});

test("unknown promo codes, invalid ratings, and Faceit trust flags are rejected", () => {
  for(const promoCode of [true,{},"unknown","x".repeat(33)])assert.throws(()=>quote("premier",1000,2000,{promoCode}));
  for(const current of [null,true,"1000",{},-1,1.1])assert.throws(()=>quote("premier",current,2000));
  assert.throws(()=>quote("faceit",1000,1100,{redTrust:true}));
  assert.equal(normalizePromo("  "),null);
  const calibration=calculatePrice({platform:"premier",service:"calibration",current:null,target:null,promoCode:"Terasay"});
  assert.equal(calibration.totalAmount,null);assert.equal(calibration.durationDays,null);assert.equal(calibration.promoCode,"Terasay");
});

test("credentials cannot be read from the database, moved between orders, or modified", () => {
  const original=process.env.ORDER_ACCESS_KEY;
  try {
    process.env.ORDER_ACCESS_KEY="ab".repeat(32);
    const details={login:"private-login",password:"PrivateGamePassword_2026"};
    const sealed=sealAccess("order-a",details);
    assert(!sealed.includes(details.password));assert(!sealed.includes(details.login));
    assert.deepEqual(openAccess("order-a",sealed),details);
    assert.throws(()=>openAccess("order-b",sealed));
    const parts=sealed.split(".");const payload=Buffer.from(parts[3],"base64");payload[0]^=1;parts[3]=payload.toString("base64");
    assert.throws(()=>openAccess("order-a",parts.join(".")));
    process.env.ORDER_ACCESS_KEY="cd".repeat(32);assert.throws(()=>openAccess("order-a",sealed));
    delete process.env.ORDER_ACCESS_KEY;assert.throws(()=>sealAccess("order-a",details));
  }finally{if(original === undefined)delete process.env.ORDER_ACCESS_KEY;else process.env.ORDER_ACCESS_KEY=original;}
});

test("deployment creates the encryption key once and preserves email configuration", () => {
  mkdirSync("work", { recursive: true });
  const dir=mkdtempSync(resolve("work/access-key-test-"));const file=join(dir,"server.env");
  const source="APP_ORIGIN=https://cs2-boosts.ru\nRESEND_API_KEY=re_placeholder_test_only\nORDER_ACCESS_KEY=\n";
  writeFileSync(file,source);
  const run=()=>spawnSync(process.execPath,["scripts/ensure-access-key.mjs",file],{encoding:"utf8"});
  const first=run();assert.equal(first.status,0,first.stderr);
  const saved=readFileSync(file,"utf8");const key=saved.match(/^ORDER_ACCESS_KEY=([a-f0-9]{64})$/m)[1];
  assert(saved.includes("RESEND_API_KEY=re_placeholder_test_only"));assert(!first.stdout.includes(key));
  assert.equal(run().status,0);assert.equal(readFileSync(file,"utf8"),saved);
  writeFileSync(file,saved+"ORDER_ACCESS_KEY=\n");assert.notEqual(run().status,0);
});
