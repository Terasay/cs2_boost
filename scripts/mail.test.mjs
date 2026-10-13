import assert from "node:assert/strict";
import { test } from "node:test";
import { mailConfig, recoveryLetter, sendEmail, verificationLetter } from "../lib/mail.mjs";
import { brandedLetter, emailHtml } from "../lib/mail-template.mjs";

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
    assert.equal(payload.html, letter.html);
    assert.match(payload.html, /Подтвердить почту/);
    assert.match(payload.html, /href="https:\/\/cs2-boosts\.ru\/verify-email#token=example"/);
    assert.doesNotMatch(payload.text, /re_local_test_only/);
    assert.doesNotMatch(payload.html, /re_local_test_only/);
    await sendEmail({ to: "recipient@example.test", subject: "Old queued message", text: "Open your account:\nhttps://cs2-boosts.ru/account", idempotencyKey: "legacy-letter" });
    assert.match(JSON.parse(captured.body).html, /href="https:\/\/cs2-boosts\.ru\/account"/);
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

test("registration and recovery keep the complete one-time link in both formats and languages", () => {
  const url = "https://cs2-boosts.ru/reset-password#token=sample_token&lang=en";
  for (const language of ["ru", "en"]) for (const letter of [verificationLetter(url, language), recoveryLetter(url, language)]) {
    assert(letter.text.includes(url));
    assert(letter.html.includes('href="https://cs2-boosts.ru/reset-password#token=sample_token&amp;lang=en"'));
    assert.match(letter.html, new RegExp(`<html lang="${language}">`));
    assert.match(letter.html, language === "ru" ? /30 минут/ : /30 minutes/);
    assert.match(letter.html, /src="https:\/\/cs2-boosts\.ru\/favicon\.png"/);
    assert(Buffer.byteLength(letter.html) < 20000);
  }
});

test("email content escapes markup and refuses executable or credential-bearing action links", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  for (const url of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@example.test/", "https://example.test/\nInjected"]) {
    const letter = brandedLetter({ subject: hostile, text: hostile, paragraphs: [hostile], notice: hostile, footnote: hostile, action: { text: hostile, url }, settingsUrl: url });
    assert.doesNotMatch(letter.html, /<img[^>]+onerror|href="(?:javascript:|data:|https:\/\/user:)/);
    assert.match(letter.html, /&lt;img/);
  }
  const legacy = emailHtml({ subject: "Update", text: '<script>alert(1)</script>\n\nhttps://cs2-boosts.ru/account?next=" onclick="bad' });
  assert.doesNotMatch(legacy, /<script| onclick="/);
});
