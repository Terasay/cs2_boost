import assert from "node:assert/strict";

const base = process.env.SITE_TEST_URL || "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Run this check against a local server");
const indexable = process.env.SITE_EXPECT_INDEXING === "1";
const canonicalOrigin = process.env.SITE_CANONICAL_ORIGIN;
const slugs = ["", "premier-boost", "faceit-boost", "calibration"];
for (const lang of ["ru", "en"]) for (const slug of slugs) {
  const path = `/${lang}${slug ? `/${slug}` : ""}`;
  const response = await fetch(base + path, { headers: { "User-Agent": "Googlebot" } });
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.match(html, new RegExp(`<html[^>]+lang="${lang}"`));
  assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, path);
  assert.match(html, /<meta name="description" content="[^"]{50,}"/);
  assert.doesNotMatch(html, /nosnippet|max-snippet\s*:\s*0|data-nosnippet/i, path);
  assert.doesNotMatch(response.headers.get("x-robots-tag") || "", /noindex|nosnippet/i, path);
  assert.match(html, /rel="icon"[^>]+href="\/favicon\.png"/);
  assert.match(html, indexable ? /<meta name="robots" content="index, follow"/ : /<meta name="robots" content="noindex, follow"/);
  for (const other of slugs.slice(1)) assert(html.includes(`href="/${lang}/${other}"`), `Missing navigation to ${other}`);
  if (indexable) {
    assert(canonicalOrigin, "Set SITE_CANONICAL_ORIGIN");
    assert(html.includes(`rel="canonical" href="${canonicalOrigin}${path}"`), path);
    assert.match(html, /hrefLang="ru"/i);
    assert.match(html, /hrefLang="en"/i);
    assert.match(html, /property="og:image"/);
    if (!slug) {
      const data = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
      const website = data.find(item => item["@type"] === "WebSite");
      assert(website, "Missing site name structured data");
      assert.equal(website.url, canonicalOrigin + "/");
      assert.equal(website.name, "CS2 Boost");
    }
  }
}
for (const [path, size] of [["/favicon.png", 120], ["/apple-touch-icon.png", 180]]) {
  const response = await fetch(base + path, { headers: { "User-Agent": "Googlebot-Image" } });
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get("content-type") || "", /^image\/png/);
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
}
const icon = await fetch(base + "/favicon.ico");
assert.equal(icon.status, 200);
assert.equal(Buffer.from(await icon.arrayBuffer()).subarray(0, 4).toString("hex"), "00000100");
const yandex = await fetch(base + "/ru", { headers: { "User-Agent": "YandexBot" } });
assert.equal(yandex.status, 200);
assert.match(await yandex.text(), /<meta name="description" content="[^"]{50,}"/);
const map = await fetch(base + "/sitemap.xml").then(response => response.text());
assert.equal((map.match(/<loc>/g) || []).length, indexable ? 8 : 0);
assert.doesNotMatch(map, /dashboard|orders|support|analytics|localhost|127\.0\.0\.1/);
for (const path of ["/account", "/dashboard", "/analytics", "/login", "/register", "/inbox", "/support"]) {
  const response = await fetch(base + path);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  assert.match(await response.text(), /<meta name="robots" content="noindex, nofollow"/);
}
const redirect = await fetch(base + "/?utm_source=telegram&utm_campaign=launch", { redirect: "manual" });
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.get("location"), "/ru?utm_source=telegram&utm_campaign=launch");
for (const code of ["Cherep", "Terasay"]) {
  const promoRedirect = await fetch(`${base}/?promo=${code}`, { redirect: "manual" });
  assert.equal(promoRedirect.status, 308);
  assert.equal(promoRedirect.headers.get("location"), `/ru?promo=${code}`);
}
assert.equal((await fetch(base + "/de/premier-boost")).status, 404);
assert.equal((await fetch(base + "/ru/not-a-service")).status, 404);
console.log(JSON.stringify({ ok: true, indexable, localizedPages: 8, privatePagesNoindex: true, canonicalAndSitemap: true }));
