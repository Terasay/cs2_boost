import assert from "node:assert/strict";
import { test } from "node:test";
import { donationAuthorization, donationConfig, donationMatch, donationMinorAmount, donationPage, donationProfile, donationToken, normalizeDonation } from "../lib/donationalerts.mjs";

const reference = "CS2TEST-" + "ab".repeat(16);
const config = { enabled: true, clientId: "42", clientSecret: "private-test-secret", account: "limonorigin" };
const invoice = { reference, status: "pending", amount: 50001, currency: "RUB", expiresAt: 2000 };
const fixture = { id: 123, name: "donation", message_type: "text", message: reference, amount: 500.01, currency: "RUB" };

test("explicit modes distinguish simulations from order matching", () => {
  const previous = process.env.DONATIONALERTS_MODE;
  try {
    delete process.env.DONATIONALERTS_MODE; assert.equal(donationConfig().enabled, false);
    process.env.DONATIONALERTS_MODE = "test"; assert.equal(donationConfig().enabled, true);
    process.env.DONATIONALERTS_MODE = "orders"; assert.equal(donationConfig().mode, "orders");
    process.env.DONATIONALERTS_MODE = "live"; assert.throws(donationConfig);
  } finally { if (previous === undefined) delete process.env.DONATIONALERTS_MODE; else process.env.DONATIONALERTS_MODE = previous; }
});

test("money is represented exactly, and non-money values never round into a valid payment", () => {
  assert.equal(donationMinorAmount(500.01), 50001);
  assert.equal(donationMinorAmount(0.01), 1);
  assert.equal(donationMinorAmount(100000000), 10000000000);
  for (const value of ["500", true, null, 0, -1, Infinity, NaN, 1.005, 0.0001, 100000001]) assert.equal(donationMinorAmount(value), null);
});

test("only typed donation alerts with exact unpredictable references are considered", () => {
  assert.deepEqual(normalizeDonation(fixture), { id: "123", reference, amount: 50001, currency: "RUB" });
  for (const extra of [{ name: "custom" }, { message_type: "audio" }, { id: "123" }, { id: 0 }, { id: 1.5 }, { message: `${reference} other` }, { message: "CS2TEST-ab" }, { currency: "rub" }, { amount: "500.01" }, { amount: 500.001 }]) assert.equal(normalizeDonation({ ...fixture, ...extra }), null);
});

test("exact amounts, currencies, deadlines and already matched tests are checked", () => {
  const donation = normalizeDonation(fixture);
  assert.equal(donationMatch(invoice, donation, 1000), "matched");
  assert.equal(donationMatch(invoice, { ...donation, amount: 50000 }, 1000), "wrong_amount");
  assert.equal(donationMatch(invoice, { ...donation, amount: 50002 }, 1000), "wrong_amount");
  assert.equal(donationMatch(invoice, { ...donation, currency: "USD" }, 1000), "wrong_currency");
  assert.equal(donationMatch(invoice, donation, 2000), "expired");
  assert.equal(donationMatch({ ...invoice, status: "matched" }, donation, 1000), "already_matched");
  assert.equal(donationMatch(invoice, { ...donation, reference: "another" }, 1000), "unrelated");
});

test("OAuth requests only read scopes and never expose secrets in the authorization URL", async () => {
  const url = new URL(donationAuthorization(config, "https://cs2-boosts.ru/api/payments/donationalerts/callback", "state-fixture"));
  assert.equal(url.origin, "https://www.donationalerts.com");
  assert.equal(url.searchParams.get("scope"), "oauth-user-show oauth-donation-index");
  assert.equal(url.searchParams.get("state"), "state-fixture");
  assert(!url.href.includes(config.clientSecret));
  const tokens = await donationToken(config, { grant_type: "authorization_code", code: "test-code" }, async (request, options) => {
    assert.equal(request.href, "https://www.donationalerts.com/oauth/token");
    assert.equal(options.redirect, "error");
    assert.equal(options.body.get("client_secret"), config.clientSecret);
    return Response.json({ token_type: "Bearer", access_token: "access-test", refresh_token: "refresh-test", expires_in: 3600 });
  });
  assert.equal(tokens.accessToken, "access-test"); assert.equal(tokens.refreshToken, "refresh-test");
  const refreshed = await donationToken(config, { grant_type: "refresh_token", refresh_token: tokens.refreshToken }, async () => Response.json({ token_type: "Bearer", access_token: "new-access", expires_in: 3600 }));
  assert.equal(refreshed.refreshToken, tokens.refreshToken);
});

test("provider data and pagination cannot redirect credentials to an arbitrary host", async () => {
  const profile = await donationProfile("access-test", "limonorigin", async () => Response.json({ data: { id: 9, code: "limonorigin", name: "Limon" } }));
  assert.equal(profile.code, "limonorigin");
  await assert.rejects(() => donationProfile("access-test", "limonorigin", async () => Response.json({ data: { id: 9, code: "other", name: "Other" } })), /configured/);
  const page = await donationPage("access-test", 2, async (url, options) => {
    assert.equal(url.href, "https://www.donationalerts.com/api/v1/alerts/donations?page=2");
    assert.equal(options.headers.Authorization, "Bearer access-test");
    assert.equal(options.redirect, "error");
    return Response.json({ data: [fixture], links: { next: "https://untrusted.test/steal" } });
  });
  assert.equal(page.hasMore, true); assert.equal(page.donations.length, 1);
  await assert.rejects(() => donationPage("access-test", 4));
  await assert.rejects(() => donationPage("access-test", 1, async () => new Response("token-must-not-leak", { status: 401 })), error => !error.message.includes("token-must-not-leak"));
  await assert.rejects(() => donationPage("access-test", 1, async () => new Response("x".repeat(262145))), /Invalid/);
});
