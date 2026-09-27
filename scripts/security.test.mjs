import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { ratingValue, validDate } from "../lib/order-validation.ts";
import { jsonInput, sameOriginMutation, safeApi } from "../app/api/request-security.ts";

test("password hashes support existing accounts and Workers fallback", async () => {
  const password = "Test password only 12345";
  const stored = await hashPassword(password);
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
  assert.equal(await verifyPassword(password, "bad:hash"), false);
  assert.equal(await verifyPassword(password, `999999999:${"0".repeat(32)}:${"0".repeat(64)}`), false);
  const salt = "01".repeat(16);
  const legacy = `${salt}:${pbkdf2Sync(password, Buffer.from(salt, "hex"), 210000, 32, "sha256").toString("hex")}`;
  assert.equal(await verifyPassword(password, legacy), true);
  const derive = crypto.subtle.deriveBits;
  crypto.subtle.deriveBits = async () => { throw new DOMException("Pbkdf2 failed: iteration counts above 100000 not supported", "NotSupportedError"); };
  try { assert.equal(await verifyPassword(password, stored), true); }
  finally { crypto.subtle.deriveBits = derive; }
});

test("strict ratings and real calendar dates", () => {
  for (const value of [null, true, "100", {}, 1.5, -1, 100001, Infinity]) assert.equal(ratingValue(value), null);
  assert.equal(ratingValue(0), 0);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-13-01"), false);
});

test("origin checks reject cross-site and missing provenance", () => {
  const request = headers => new Request("https://example.test/api/orders", { method: "POST", headers });
  assert.equal(sameOriginMutation(request({ origin: "https://example.test" })), true);
  assert.equal(sameOriginMutation(request({ origin: "https://evil.test" })), false);
  assert.equal(sameOriginMutation(request({ origin: "null" })), false);
  assert.equal(sameOriginMutation(request({ origin: "https://example.test", "sec-fetch-site": "cross-site" })), false);
  assert.equal(sameOriginMutation(request({})), false);
});

test("JSON reader bounds real streamed bytes and malformed input", async () => {
  const request = body => new Request("https://example.test", { method: "POST", headers: { "Content-Type": "application/json" }, body });
  assert.deepEqual(await jsonInput(request('{"body":"Привет"}')), { body: "Привет" });
  for (const body of ["null", "[]", "{bad", '"text"']) assert.equal(await jsonInput(request(body)), null);
  assert.equal(await jsonInput(request(JSON.stringify({ body: "a".repeat(100) })), 32), null);
  const stream = new ReadableStream({ start(controller) { controller.error(new Error("broken body")); } });
  assert.equal(await jsonInput(new Request("https://example.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" })), null);
});

test("unexpected API errors do not expose database details", async () => {
  const response = await safeApi(async () => { throw new Error("SQL secret database detail"); })(new Request("https://example.test/api/orders"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /SQL|secret|database detail/);
});
