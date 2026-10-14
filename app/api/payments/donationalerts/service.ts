import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { donationConnections, donationTestEvents, donationTests, orders, paymentIntents, paymentReceipts, serviceState, walletTopups, walletReceipts } from "@/db/schema";
import { changeWallet, walletBalance } from "@/lib/wallet.mjs";
import { enqueueOrderEvent } from "@/lib/notifications.mjs";
import { publicOrigin } from "@/lib/server-config.mjs";
import { confirmOrderPayment } from "@/lib/confirm-order-payment";
import { openAccess, sealAccess } from "@/lib/order-access.mjs";
import { donationConfig, donationMatch, donationPage, donationScopes, donationToken, normalizeDonation, type Donation, type DonationTokens } from "@/lib/donationalerts.mjs";

export const connectionId = "donationalerts-test";
export const stateDigest = (value: string) => createHash("sha256").update(value).digest("hex");

type SyncStatus = { checkedAt: number | null; failedAt: number | null; error: "unavailable" | "authorization" | "connection" | null };
function syncStatus(): SyncStatus {
  const saved = getDb().select().from(serviceState).where(eq(serviceState.key, "payment-sync")).get();
  if (saved) {
    try { return JSON.parse(saved.value) as SyncStatus; } catch {}
  }
  return { checkedAt: null, failedAt: null, error: null };
}

function latestReceipt(intentId: string) {
  return getDb().select({ id: paymentReceipts.id, result: paymentReceipts.result, amount: paymentReceipts.amount, currency: paymentReceipts.currency, createdAt: paymentReceipts.createdAt }).from(paymentReceipts).where(eq(paymentReceipts.intentId, intentId)).orderBy(desc(paymentReceipts.createdAt), desc(paymentReceipts.id)).get() ?? null;
}

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
  const topups = db.$client.prepare("SELECT t.id, t.reference, t.amount, t.currency, t.status, t.expires_at AS expiresAt, u.email, (SELECT result FROM wallet_receipts WHERE topup_id = t.id ORDER BY created_at DESC LIMIT 1) AS issue FROM wallet_topups t JOIN users u ON u.id = t.user_id ORDER BY t.created_at DESC LIMIT 50").all().map(row => ({ ...(row as Record<string, unknown>), expired: Number((row as {expiresAt:number}).expiresAt) <= Date.now() }));
  const walletLiability = (db.$client.prepare("SELECT coalesce(sum(max(balance, 0)), 0) AS amount FROM wallet_accounts").get() as { amount: number }).amount;
  return { enabled: config.enabled, mode: config.mode, autoConfirm: config.autoConfirm, oauthConfigured: /^\d+$/.test(config.clientId) && Boolean(config.clientSecret), expectedAccount: config.account, connected: Boolean(connection?.secret), account: connection?.secret ? { code: connection.code, name: connection.name } : null, tests, events, topups, walletLiability, payments: payments.map(payment => ({ ...payment, receipt: latestReceipt(payment.id) })), sync: syncStatus() };
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
  try {
    const results = await readPaymentAlerts();
    const value = JSON.stringify({ checkedAt: Date.now(), failedAt: null, error: null });
    getDb().insert(serviceState).values({ key: "payment-sync", value }).onConflictDoUpdate({ target: serviceState.key, set: { value } }).run();
    return results;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "";
    const error = message.includes("authorization expired") ? "authorization" : message.includes("account") || message.includes("Connect ") ? "connection" : "unavailable";
    const value = JSON.stringify({ ...syncStatus(), failedAt: Date.now(), error });
    getDb().insert(serviceState).values({ key: "payment-sync", value }).onConflictDoUpdate({ target: serviceState.key, set: { value } }).run();
    throw reason;
  }
}

async function readPaymentAlerts() {
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
      const result = donation.reference.startsWith("CS2WAL-") ? (donationConfig().mode === "orders" ? processWalletDonation(donation, active.accountId) : "unrelated") : donation.reference.startsWith("CS2PAY-") ? (donationConfig().mode === "orders" ? processOrderDonation(donation, active.accountId) : "unrelated") : processTestDonation(donation, "api", active.accountId);
      if (result !== "unrelated") results[result] = (results[result] || 0) + 1;
    }
    if (!batch.hasMore) break;
  }
  if (donationConfig().autoConfirm) {
    const reviews = getDb().select().from(paymentIntents).where(and(eq(paymentIntents.accountId, active.accountId), eq(paymentIntents.status, "review"))).limit(50).all();
    for (const review of reviews) getDb().transaction(tx => {
      const invoice = tx.select().from(paymentIntents).where(eq(paymentIntents.id, review.id)).get();
      if (!invoice || invoice.status !== "review") return;
      const receipt = tx.select().from(paymentReceipts).where(and(eq(paymentReceipts.intentId, invoice.id), eq(paymentReceipts.result, "matched"), eq(paymentReceipts.amount, invoice.amount), eq(paymentReceipts.currency, invoice.currency))).get();
      const order = tx.select().from(orders).where(eq(orders.id, invoice.orderId)).get();
      if (order && receipt && confirmOrderPayment(tx, order, { invoice, receiptId: receipt.id, actorId: order.userId, automatic: true, origin: publicOrigin(new Request("http://127.0.0.1:3000")), now: Date.now() })) results.confirmed = (results.confirmed || 0) + 1;
    });
  }
  return results;
}

export function orderPaymentStatus(orderId: string) {
  const config = donationConfig();
  const db = getDb();
  const buyer = db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, orderId)).get();
  const connection = db.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
  const intent = db.select().from(paymentIntents).where(eq(paymentIntents.orderId, orderId)).orderBy(desc(paymentIntents.createdAt), desc(paymentIntents.id)).get();
  const receipt = intent ? db.select({ id: paymentReceipts.id }).from(paymentReceipts).where(and(eq(paymentReceipts.intentId, intent.id), eq(paymentReceipts.result, "matched"))).get() : null;
  const latest = intent ? latestReceipt(intent.id) : null;
  const issue = latest && ["wrong_amount", "wrong_currency", "expired", "order_changed"].includes(latest.result) && intent?.status !== "review" && intent?.status !== "confirmed" ? latest : null;
  return { walletBalance: buyer ? walletBalance(db.$client, buyer.userId) : 0, available: config.mode === "orders" && Boolean(connection?.secret && config.account && connection.code?.toLowerCase() === config.account.toLowerCase()), autoConfirm: config.autoConfirm, intent: intent ? { ...intent, expired: intent.expiresAt <= Date.now() } : null, receipt: receipt ?? null, issue, sync: syncStatus() };
}

export async function checkOrderPayment(orderId: string, userId: string) {
  const order = getDb().select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).get();
  if (!order) throw new Error("Order not found");
  const payment = orderPaymentStatus(orderId);
  if (order.paidAt || (payment.intent?.status === "review" && !payment.autoConfirm)) return { checked: false, retryAfter: 0, payment };
  if (!payment.available) throw new Error("Connect the configured DonationAlerts account");
  if (!payment.intent) throw new Error("Prepare payment first");
  return null;
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
    if (tx.select().from(paymentReceipts).where(eq(paymentReceipts.id, key)).get() || tx.select().from(walletReceipts).where(eq(walletReceipts.id, key)).get()) return "duplicate";
    const invoice = tx.select().from(paymentIntents).where(eq(paymentIntents.reference, donation.reference)).get();
    if (!invoice || invoice.accountId !== accountId) return "unrelated";
    const now = Date.now();
    const order = tx.select().from(orders).where(eq(orders.id, invoice.orderId)).get();
    let result = donationMatch(invoice, donation, now);
    if (invoice.status !== "pending") result = "already_matched";
    if (!order || order.updatedAt !== invoice.orderRevision || order.status !== "awaiting_payment" || order.paidAt || order.totalAmount !== invoice.amount || (order.quotedCurrency || "RUB") !== invoice.currency) result = "order_changed";
    tx.insert(paymentReceipts).values({ id: key, intentId: invoice.id, amount: donation.amount, currency: donation.currency, result, createdAt: now }).run();
    if (result === "matched") {
      if (donationConfig().autoConfirm && confirmOrderPayment(tx, order!, { invoice, receiptId: key, actorId: order!.userId, automatic: true, origin: publicOrigin(new Request("http://127.0.0.1:3000")), now })) return "confirmed";
      tx.update(paymentIntents).set({ status: "review", matchedAt: now }).where(eq(paymentIntents.id, invoice.id)).run();
      enqueueOrderEvent(getDb().$client, { orderId: invoice.orderId, actorId: order!.userId, type: "payment_review", eventId: key, origin: publicOrigin(new Request("http://127.0.0.1:3000")) });
    }
    return result;
  });
}

export function walletPaymentStatus(userId: string) {
  const db = getDb();
  const config = donationConfig();
  const connection = db.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
  const topups = db.select().from(walletTopups).where(eq(walletTopups.userId, userId)).orderBy(desc(walletTopups.createdAt), desc(walletTopups.id)).limit(10).all();
  return { available: config.mode === "orders" && Boolean(connection?.secret && config.account && connection.code?.toLowerCase() === config.account.toLowerCase()), topups: topups.map(row => ({ id: row.id, reference: row.reference, accountCode: row.accountCode, amount: row.amount, currency: row.currency, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt, confirmedAt: row.confirmedAt, expired: row.expiresAt <= Date.now(), issue: db.select({ result: walletReceipts.result, amount: walletReceipts.amount, currency: walletReceipts.currency }).from(walletReceipts).where(eq(walletReceipts.topupId, row.id)).orderBy(desc(walletReceipts.createdAt)).get() ?? null })), sync: syncStatus() };
}

export function createWalletTopup(userId: string, amount: unknown) {
  if (!Number.isSafeInteger(amount) || Number(amount) < 10000 || Number(amount) > 10000000) throw new Error("Top up between 100 and 100000 RUB");
  const config = donationConfig();
  if (config.mode !== "orders") throw new Error("Order payments are disabled");
  return getDb().transaction(tx => {
    const connection = tx.select().from(donationConnections).where(eq(donationConnections.id, connectionId)).get();
    if (!connection?.secret || !connection.accountId || !connection.code || !config.account || connection.code.toLowerCase() !== config.account.toLowerCase()) throw new Error("Connect the configured DonationAlerts account");
    const now = Date.now();
    const previous = tx.select().from(walletTopups).where(and(eq(walletTopups.userId, userId), eq(walletTopups.status, "pending"))).orderBy(desc(walletTopups.createdAt)).get();
    if (previous && previous.expiresAt > now) {
      if (previous.amount !== amount) throw new Error("Finish the pending top up first");
      return previous;
    }
    const topup = { id: crypto.randomUUID(), userId, reference: `CS2WAL-${randomBytes(16).toString("hex")}`, accountId: connection.accountId, accountCode: connection.code, amount: Number(amount), currency: "RUB", status: "pending", createdAt: now, expiresAt: now + 24 * 3600000 };
    tx.insert(walletTopups).values(topup).run();
    return topup;
  });
}

export function processWalletDonation(donation: Donation, accountId: string) {
  if (!donation.reference.startsWith("CS2WAL-")) return "unrelated";
  return getDb().transaction(tx => {
    const key = `donationalerts:${accountId}:${donation.id}`;
    if (tx.select().from(walletReceipts).where(eq(walletReceipts.id, key)).get() || tx.select().from(paymentReceipts).where(eq(paymentReceipts.id, key)).get()) return "duplicate";
    const topup = tx.select().from(walletTopups).where(eq(walletTopups.reference, donation.reference)).get();
    if (!topup || topup.accountId !== accountId) return "unrelated";
    const now = Date.now();
    const result = topup.status !== "pending" ? "already_matched" : donationMatch(topup, donation, now);
    tx.insert(walletReceipts).values({ id: key, topupId: topup.id, amount: donation.amount, currency: donation.currency, result, createdAt: now }).run();
    if (result !== "matched") return result;
    changeWallet(getDb().$client, { userId: topup.userId, reference: `topup:${topup.id}`, kind: "topup", amount: topup.amount, now });
    tx.update(walletTopups).set({ status: "confirmed", confirmedAt: now }).where(eq(walletTopups.id, topup.id)).run();
    return "wallet_confirmed";
  });
}
