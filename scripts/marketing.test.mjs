import { test } from "node:test";
import assert from "node:assert/strict";
import { searchEnabled, siteOrigin } from "../lib/seo-config.mjs";
import { cleanAttribution, attributionFromQuery } from "../lib/attribution.mjs";

test("only a configured HTTPS domain can be indexed, with an explicit switch", () => {
  const saved = { ...process.env };
  try {
    process.env.SEARCH_INDEXING = "1";
    for (const origin of ["", "http://194.238.42.45", "https://194.238.42.45", "https://[::1]", "http://example.com", "https://localhost", "https://preview.test", "https://example.com/path", "https://user:password@example.com"]) {
      process.env.APP_ORIGIN = origin;
      assert.equal(searchEnabled(), false, origin);
    }
    process.env.APP_ORIGIN = "https://boost.example.com";
    assert.equal(siteOrigin(), "https://boost.example.com");
    assert.equal(searchEnabled(), true);
    process.env.SEARCH_INDEXING = "0";
    assert.equal(searchEnabled(), false);
  } finally {
    for (const key of ["APP_ORIGIN", "SEARCH_INDEXING"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});

test("campaign attribution keeps bounded labels and never arbitrary URLs or extra fields", () => {
  assert.deepEqual(attributionFromQuery(new URLSearchParams("utm_source=telegram&utm_medium=paid_social&utm_campaign=launch&utm_content=channel_a")), { source: "telegram", medium: "paid_social", campaign: "launch", content: "channel_a" });
  assert.deepEqual(cleanAttribution({ source: " telegram ", campaign: "Осень 2026", email: "private@example.test", role: "admin" }), { source: "telegram", campaign: "Осень 2026" });
  for (const value of [null, [], "text", {}, { source: "a".repeat(81) }, { source: "https://evil.test?token=secret" }, { source: "<script>" }, { source: "a\nb" }]) assert.equal(cleanAttribution(value), null);
  assert.deepEqual(cleanAttribution({ source: "direct_link", content: "<script>" }), { source: "direct_link" });
});
