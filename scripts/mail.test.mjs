import assert from "node:assert/strict";
import { test } from "node:test";
import { mailConfig, sendEmail, verificationLetter } from "../lib/mail.mjs";

test("Resend transport authenticates on the server and reports failures without secrets", async () => {
  const saved = { key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM, fetch: globalThis.fetch };
  try {
    delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM;
    assert.throws(mailConfig, /not configured/);
    process.env.RESEND_API_KEY = "re_local_test_only";
    process.env.MAIL_FROM = "noreply@cs2-boosts.ru";
    let captured;
    globalThis.fetch = async (url, options) => { captured = { url, ...options }; return Response.json({ id: "test-message" }); };
    const letter = verificationLetter("https://cs2-boosts.ru/verify-email#token=example", "ru");
    assert.equal(await sendEmail({ to: "recipient@example.test", ...letter, idempotencyKey: "registration-test" }), "test-message");
    assert.equal(captured.url, "https://api.resend.com/emails");
    assert.equal(captured.headers.Authorization, "Bearer re_local_test_only");
    assert.equal(captured.headers["Idempotency-Key"], "registration-test");
    assert.equal(captured.redirect, "error");
    const payload = JSON.parse(captured.body);
    assert.equal(payload.from, "CS2 Boost <noreply@cs2-boosts.ru>");
    assert.match(payload.text, /30 минут/);
    assert.doesNotMatch(payload.text, /re_local_test_only/);
    globalThis.fetch = async () => Response.json({ message: "secret provider detail" }, { status: 403 });
    await assert.rejects(sendEmail({ to: "recipient@example.test", ...letter, idempotencyKey: "test-error" }), error => error.message === "Email provider rejected delivery (HTTP 403)");
    globalThis.fetch = async () => { throw new Error("secret transport detail"); };
    await assert.rejects(sendEmail({ to: "recipient@example.test", ...letter, idempotencyKey: "test-timeout" }), /Email provider connection failed/);
    process.env.MAIL_FROM = "sender@example.test\nInjected: value";
    assert.throws(mailConfig, /Invalid/);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.from === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = saved.from;
  }
});
