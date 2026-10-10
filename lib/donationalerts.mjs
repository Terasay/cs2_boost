export const donationScopes = "oauth-user-show oauth-donation-index";
const origin = "https://www.donationalerts.com";

export function donationConfig() {
  const mode = process.env.DONATIONALERTS_MODE || "off";
  if (!["off", "test", "orders"].includes(mode)) throw new Error("Invalid DonationAlerts mode");
  return { mode, enabled: mode !== "off", clientId: process.env.DONATIONALERTS_CLIENT_ID || "", clientSecret: process.env.DONATIONALERTS_CLIENT_SECRET || "", account: process.env.DONATIONALERTS_ACCOUNT || "" };
}

export function donationAuthorization(config, callback, state) {
  if (!/^\d+$/.test(config.clientId) || !config.clientSecret) throw new Error("DonationAlerts OAuth is not configured");
  const url = new URL("/oauth/authorize", origin);
  for (const [key, value] of Object.entries({ client_id: config.clientId, redirect_uri: callback, response_type: "code", scope: donationScopes, state })) url.searchParams.set(key, value);
  return url.href;
}

async function requestJson(path, options, fetcher = fetch) {
  const response = await fetcher(new URL(path, origin), { ...options, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(response.status === 401 ? "DonationAlerts authorization expired. Reconnect the account" : "DonationAlerts API is unavailable");
  if (!response.body) throw new Error("Invalid DonationAlerts response");
  const reader = response.body.getReader();
  let length = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 262144) { await reader.cancel(); throw new Error("Invalid DonationAlerts response"); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

export async function donationToken(config, grant, fetcher) {
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...grant });
  const data = await requestJson("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, fetcher);
  if (data.token_type?.toLowerCase() !== "bearer" || typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 16384 || /\s/.test(data.access_token) || !Number.isSafeInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 3155760000 || (data.refresh_token !== undefined && (typeof data.refresh_token !== "string" || data.refresh_token.length > 16384))) throw new Error("Invalid DonationAlerts response");
  return { accessToken: data.access_token, refreshToken: data.refresh_token || grant.refresh_token || null, expiresAt: Date.now() + data.expires_in * 1000 };
}

export async function donationProfile(token, expectedAccount, fetcher) {
  const { data } = await requestJson("/api/v1/user/oauth", { headers: { Authorization: `Bearer ${token}` } }, fetcher);
  if (!Number.isSafeInteger(data?.id) || data.id < 1 || typeof data.code !== "string" || !/^[a-z0-9_.-]{1,128}$/i.test(data.code) || typeof data.name !== "string" || data.name.length > 200) throw new Error("Invalid DonationAlerts response");
  if (expectedAccount && data.code.toLowerCase() !== expectedAccount.toLowerCase()) throw new Error("Connect the configured DonationAlerts account");
  return { accountId: String(data.id), code: data.code, name: data.name };
}

export async function donationPage(token, page = 1, fetcher) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 3) throw new Error("Invalid donation page");
  const data = await requestJson(`/api/v1/alerts/donations?page=${page}`, { headers: { Authorization: `Bearer ${token}` } }, fetcher);
  if (!Array.isArray(data.data) || data.data.length > 100) throw new Error("Invalid DonationAlerts response");
  return { donations: data.data, hasMore: Boolean(data.links?.next) };
}

export function donationMinorAmount(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const text = String(value);
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= 10000000000 ? amount : null;
}

export function normalizeDonation(value) {
  if (!value || typeof value !== "object" || value.name !== "donation" || (value.message_type !== undefined && value.message_type !== "text") || !Number.isSafeInteger(value.id) || value.id < 1 || typeof value.message !== "string" || !/^CS2(?:TEST|PAY)-[a-f0-9]{32}$/.test(value.message.trim()) || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) return null;
  const amount = donationMinorAmount(value.amount);
  if (amount === null) return null;
  return { id: String(value.id), reference: value.message.trim(), amount, currency: value.currency };
}

export function donationMatch(invoice, donation, now = Date.now()) {
  if (invoice.reference !== donation.reference) return "unrelated";
  if (invoice.expiresAt <= now) return "expired";
  if (invoice.status === "matched") return "already_matched";
  if (invoice.currency !== donation.currency) return "wrong_currency";
  if (invoice.amount !== donation.amount) return "wrong_amount";
  return "matched";
}
