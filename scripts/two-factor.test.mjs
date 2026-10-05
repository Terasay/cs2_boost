import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { authenticatorUri, base32, generateRecoveryCodes, generateSecret, openSecret, recoveryHash, sealSecret, totp, verifyTotp } from "../lib/two-factor.mjs";

test("TOTP matches RFC 6238 SHA-1 vectors including times beyond 2038", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [seconds, expected] of [[59,"94287082"],[1111111109,"07081804"],[1111111111,"14050471"],[1234567890,"89005924"],[2000000000,"69279037"],[20000000000,"65353130"]]) assert.equal(totp(secret, Math.floor(seconds / 30), 8), expected);
});

test("verification preserves leading zeroes, allows limited clock drift, and rejects replay", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  const now = 1111111109000, step = Math.floor(now / 30000), code = totp(secret, step);
  assert.equal(code, "081804");
  assert.equal(verifyTotp(secret, code, -1, now), step);
  assert.equal(verifyTotp(secret, code, step, now), null);
  assert.equal(verifyTotp(secret, totp(secret, step-1), -1, now), step-1);
  assert.equal(verifyTotp(secret, totp(secret, step+1), -1, now), step+1);
  assert.equal(verifyTotp(secret, totp(secret, step-2), -1, now), null);
  for (const invalid of [code.slice(1), " " + code, Number(code), null, "abcdef", code + "0"]) assert.equal(verifyTotp(secret, invalid, -1, now), null);
});

test("authenticator secrets are encrypted and bound to an account and server key", () => {
  const saved = process.env.TWO_FACTOR_KEY;
  try {
    process.env.TWO_FACTOR_KEY = "ab".repeat(32);
    const secret = generateSecret(), sealed = sealSecret("admin-one", secret);
    assert.equal(secret.length, 32); assert(!sealed.includes(secret));
    assert.equal(openSecret("admin-one", sealed), secret);
    assert.throws(() => openSecret("admin-two", sealed));
    const parts = sealed.split("."); const bytes = Buffer.from(parts[3],"base64"); bytes[0] ^= 1; parts[3] = bytes.toString("base64");
    assert.throws(() => openSecret("admin-one", parts.join(".")));
    process.env.TWO_FACTOR_KEY = "cd".repeat(32); assert.throws(() => openSecret("admin-one", sealed));
    delete process.env.TWO_FACTOR_KEY; assert.throws(() => sealSecret("admin-one", secret));
  } finally { if(saved === undefined) delete process.env.TWO_FACTOR_KEY; else process.env.TWO_FACTOR_KEY = saved; }
});

test("recovery codes have 80 random bits and account-bound hashes; QR metadata is interoperable", () => {
  const codes = generateRecoveryCodes(); assert.equal(codes.length, 10); assert.equal(new Set(codes).size,10);
  for (const code of codes) {
    assert.match(code,/^(?:[0-9A-F]{4}-){4}[0-9A-F]{4}$/);
    assert.equal(recoveryHash("a",code.toLowerCase().replaceAll("-","")),recoveryHash("a",code));
    assert.notEqual(recoveryHash("a",code),recoveryHash("b",code));
  }
  for(const invalid of [null,[],"000000","x".repeat(200)])assert.equal(recoveryHash("a",invalid),null);
  const uri = new URL(authenticatorUri("admin+test@example.test",generateSecret()));
  assert.equal(uri.protocol,"otpauth:"); assert.equal(uri.searchParams.get("issuer"),"CS2 BOOST"); assert.equal(uri.searchParams.get("period"),"30"); assert.equal(uri.searchParams.get("digits"),"6");
});

test("server update creates a separate MFA key, preserves existing keys, and prints no secrets", () => {
  mkdirSync("work",{recursive:true});
  const path=join(mkdtempSync(resolve("work/key-test-")),"server.env");
  const orderKey="ef".repeat(32);writeFileSync(path,`APP_ORIGIN=https://boost.example\nORDER_ACCESS_KEY=${orderKey}\n`);
  const run=()=>spawnSync(process.execPath,["scripts/ensure-access-key.mjs",path],{encoding:"utf8"});
  const first=run(); assert.equal(first.status,0,first.stderr);
  const source=readFileSync(path,"utf8"),key=source.match(/^TWO_FACTOR_KEY=([0-9a-f]{64})$/m)?.[1];
  assert(key);assert.notEqual(key,orderKey);assert(source.includes(`ORDER_ACCESS_KEY=${orderKey}`));assert(!first.stdout.includes(key));assert(!first.stdout.includes(orderKey));
  assert.equal(run().status,0);assert.equal(readFileSync(path,"utf8"),source);
  writeFileSync(path,source+"TWO_FACTOR_KEY=\n");assert.notEqual(run().status,0);
});
