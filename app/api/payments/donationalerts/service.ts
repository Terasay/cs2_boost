import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { donationConnections, donationTestEvents, donationTests, orders, paymentIntents, paymentReceipts } from "@/db/schema";
import { openAccess, sealAccess } from "@/lib/order-access.mjs";
import { donationConfig, donationMatch, donationPage, donationScopes, donationToken, normalizeDonation, type Donation, type DonationTokens } from "@/lib/donationalerts.mjs";

export const connectionId = "donationalerts-test";
export const stateDigest = (value: string) => createHash("sha256").update(value).digest("hex");

export function sealDonationTokens(tokens: DonationTokens) {
  return sealAccess(connectionId, { tokens: JSON.stringify(tokens) });
}

export function requireDonationTest() {
  const config = donationConfig();
  if (!config.enabled) throw new Error("DonationAlerts test mode is disabled");
  return config;
}

export function paymentTestStatus() {
  const config = donationConfig();
  const db = getDb();
  const connection = db.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
  const tests = db.select().from(donationTests).orderBy(desc(donationTests.createdAt)).limit(20).all();
  const events = db.select().from(donationTestEvents).orderBy(desc(donationTestEvents.createdAt)).limit(30).all();
  const payments = db.select().from(paymentIntents).orderBy(desc(sql`${paymentIntents.status} = 'review'`), desc(paymentIntents.createdAt)).limit(50).all();
  return { enabled: config.enabled, mode: config.mode, oauthConfigured: /^\d+$/.test(config.clientId) && Boolean(config.clientSecret), expectedAccount: config.account, connected: Boolean(connection?.secret), account: connection?.secret ? { code: connection.code, name: connection.name } : null, tests, events, payments };
}

export function createPaymentTest(actorId: string, input: Record<string, unknown>) {
  const db = getDb();
  const now = Date.now();
  let amount = input.amount;
  let orderId: string | null = null, orderRevision: number | null = null;
  if (input.orderId) {
    if (typeof input.orderId !== "string" || input.orderId.length > 64) throw new Error("Order not found");
    const order = db.select().from(orders).where(eq(orders.id, input.orderId)).get();
    if (!order) throw new Error("Order not found");
    if (order.status !== "awaiting_payment" || order.paidAt || !order.totalAmount || !order.durationDays || (order.quotedCurrency && order.quotedCurrency !== "RUB")) throw new Error("Choose an accepted unpaid RUB order");
    amount = order.totalAmount; orderId = order.id; orderRevision = order.updatedAt;
  }
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 100 || amount > 10000000000) throw new Error("Invalid price");
  return db.transaction(tx => {
    tx.delete(donationTests).where(lt(donationTests.createdAt, now - 7 * 86400000)).run();
    const row = { id: crypto.randomUUID(), reference: `CS2TEST-${randomBytes(16).toString("hex")}`, actorId, orderId, orderRevision, amount, currency: "RUB", status: "pending" as const, createdAt: now, expiresAt: now + 3600000 };
    tx.insert(donationTests).values(row).run();
    return row;
  });
}

export function processTestDonation(donation: Donation, source: "simulation" | "api", accountId = "local") {
  const db = getDb();
  const key = `${source}:${accountId}:${donation.id}`;
  return db.transaction(tx => {
    if (tx.select().from(donationTestEvents).where(eq(donationTestEvents.id, key)).get()) return "duplicate";
    const invoice = tx.select().from(donationTests).where(eq(donationTests.reference, donation.reference)).get();
    if (!invoice) return "unrelated";
    const now = Date.now();
    let result = donationMatch(invoice, donation, now);
    if (invoice.orderId) {
      const order = tx.select().from(orders).where(eq(orders.id, invoice.orderId)).get();
      if (!order || order.updatedAt !== invoice.orderRevision || order.status !== "awaiting_payment" || order.paidAt || order.totalAmount !== invoice.amount || (order.quotedCurrency || "RUB") !== invoice.currency) result = "order_changed";
    }
    tx.insert(donationTestEvents).values({ id: key, testId: invoice.id, source, result, amount: donation.amount, currency: donation.currency, createdAt: now }).run();
    if (result === "matched") tx.update(donationTests).set({ status: "matched", matchedAt: now }).where(eq(donationTests.id, invoice.id)).run();
    return result;
  });
}

type ActiveConnection = { token: string; accountId: string; revision: number };
let refreshing: Promise<ActiveConnection> | null = null;
async function accessToken() {
  const config = requireDonationTest();
  const db = getDb();
  const connection = db.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
  if (!connection?.secret || !connection.accountId) throw new Error("Connect DonationAlerts first");
  if (!config.account || connection.code?.toLowerCase() !== config.account.toLowerCase()) throw new Error("Connect the configured DonationAlerts account");
  const tokens = JSON.parse(openAccess(connectionId, connection.secret).tokens) as DonationTokens;
  if (!tokens || typeof tokens.accessToken !== "string" || !tokens.accessToken || !Number.isSafeInteger(tokens.expiresAt) || (tokens.refreshToken !== null && typeof tokens.refreshToken !== "string")) throw new Error("Connect DonationAlerts first");
  if (tokens.expiresAt > Date.now() + 60000) return { token: tokens.accessToken, accountId: connection.accountId, revision: connection.revision };
  if (!tokens.refreshToken) throw new Error("DonationAlerts authorization expired. Reconnect the account");
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const updated = await donationToken(config, { grant_type: "refresh_token", refresh_token: tokens.refreshToken!, scope: donationScopes });
    const saved = db.update(donationConnections).set({ secret: sealDonationTokens(updated), revision: connection.revision + 1 }).where(and(eq(donationConnections.id, connectionId), eq(donationConnections.revision, connection.revision))).run();
    if (!saved.changes) throw new Error("DonationAlerts connection changed. Try again");
    return { token: updated.accessToken, accountId: connection.accountId!, revision: connection.revision + 1 };
  })();
  try { return await refreshing; } finally { refreshing = null; }
}

export async function syncPaymentTests() {
  const active = await accessToken();
  const results: Record<string, number> = {};
  for (let page = 1; page <= 3; page++) {
    if (page > 1) await new Promise(resolve => setTimeout(resolve, 1000));
    const batch = await donationPage(active.token, page);
    const current = getDb().select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
    if (current?.revision !== active.revision || !current.secret || current.accountId !== active.accountId) throw new Error("DonationAlerts connection changed. Try again");
    for (const raw of batch.donations) {
      const donation = normalizeDonation(raw);
      if (!donation) continue;
      const result = donation.reference.startsWith("CS2PAY-") ? (donationConfig().mode === "orders" ? processOrderDonation(donation, active.accountId) : "unrelated") : processTestDonation(donation, "api", active.accountId);
      if (result !== "unrelated") results[result] = (results[result] || 0) + 1;
    }
    if (!batch.hasMore) break;
  }
  return results;
}

export function orderPaymentStatus(orderId: string) {
  const config = donationConfig();
  const db = getDb();
  const connection = db.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
  const intent = db.select().from(paymentIntents).where(eq(paymentIntents.orderId, orderId)).orderBy(desc(paymentIntents.createdAt), desc(paymentIntents.id)).get();
  const receipt = intent ? db.select({ id: paymentReceipts.id }).from(paymentReceipts).where(and(eq(paymentReceipts.intentId, intent.id), eq(paymentReceipts.result, "matched"))).get() : null;
  return { available: config.mode === "orders" && Boolean(connection?.secret && config.account && connection.code?.toLowerCase() === config.account.toLowerCase()), intent: intent ? { ...intent, expired: intent.expiresAt <= Date.now() } : null, receipt: receipt ?? null };
}

export function createOrderPayment(orderId: string, userId: string, updatedAt: unknown) {
  const config = donationConfig();
  if (config.mode !== "orders") throw new Error("Order payments are disabled");
  return getDb().transaction(tx => {
    const connection = tx.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
    if (!connection?.secret || !connection.accountId || !connection.code || !config.account || connection.code.toLowerCase() !== config.account.toLowerCase()) throw new Error("Connect the configured DonationAlerts account");
    const order = tx.select().from(orders).where(eq(orders.id, orderId)).get();
    if (!order || order.userId !== userId) throw new Error("Order not found");
    if (order.updatedAt !== updatedAt || order.status !== "awaiting_payment" || order.paidAt || !order.totalAmount || !order.durationDays || (order.quotedCurrency || "RUB") !== "RUB") throw new Error("Order changed. Refresh and review the latest terms");
    const now = Date.now();
    const previous = tx.select().from(paymentIntents).where(and(eq(paymentIntents.orderId, orderId), inArray(paymentIntents.status, ["pending", "review"]))).orderBy(desc(paymentIntents.createdAt)).get();
    if (previous?.status === "review") return previous;
    if (previous && previous.expiresAt > now && previous.orderRevision === order.updatedAt && previous.accountId === connection.accountId) return previous;
    tx.update(paymentIntents).set({ status: "void" }).where(and(eq(paymentIntents.orderId, orderId), eq(paymentIntents.status, "pending"))).run();
    const intent = { id: crypto.randomUUID(), orderId, reference: `CS2PAY-${randomBytes(16).toString("hex")}`, accountId: connection.accountId, accountCode: connection.code, orderRevision: order.updatedAt, amount: order.totalAmount, currency: "RUB", status: "pending" as const, createdAt: now, expiresAt: now + 24 * 3600000 };
    tx.insert(paymentIntents).values(intent).run();
    return intent;
  });
}

export function processOrderDonation(donation: Donation, accountId: string) {
  if (!donation.reference.startsWith("CS2PAY-")) return "unrelated";
  return getDb().transaction(tx => {
    const key = `donationalerts:${accountId}:${donation.id}`;
    if (tx.select().from(paymentReceipts).where(eq(paymentReceipts.id, key)).get()) return "duplicate";
    const invoice = tx.select().from(paymentIntents).where(eq(paymentIntents.reference, donation.reference)).get();
    if (!invoice || invoice.accountId !== accountId) return "unrelated";
    const now = Date.now();
    const order = tx.select().from(orders).where(eq(orders.id, invoice.orderId)).get();
    let result = donationMatch(invoice, donation, now);
    if (invoice.status !== "pending") result = "already_matched";
    if (!order || order.updatedAt !== invoice.orderRevision || order.status !== "awaiting_payment" || order.paidAt || order.totalAmount !== invoice.amount || (order.quotedCurrency || "RUB") !== invoice.currency) result = "order_changed";
    tx.insert(paymentReceipts).values({ id: key, intentId: invoice.id, amount: donation.amount, currency: donation.currency, result, createdAt: now }).run();
    if (result === "matched") tx.update(paymentIntents).set({ status: "review", matchedAt: now }).where(eq(paymentIntents.id, invoice.id)).run();
    return result;
  });
}
