import { randomBytes, randomUUID } from "node:crypto";
import { promoCodes } from "./pricing.mjs";

const maxBalance = 1_000_000_000_000;

export function resolvePromo(db, value, buyerId = null) {
  if (value === undefined || value === null || value === "" || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string" || value.length > 32) throw new Error("Unknown promo code");
  const code = value.trim();
  const standard = promoCodes.find(item => item.toLowerCase() === code.toLowerCase());
  if (standard) return { code: standard, discountPercent: 20, commissionPercent: 20, ownerId: null };
  if (!/^[a-z0-9-]{3,32}$/i.test(code)) throw new Error("Unknown promo code");
  const personal = db.prepare("SELECT code, user_id FROM personal_promos WHERE code = ?").get(code.toUpperCase());
  if (!personal) throw new Error("Unknown promo code");
  return { code: personal.code, discountPercent: 5, commissionPercent: personal.user_id === buyerId ? 0 : 5, ownerId: personal.user_id };
}

export function claimPersonalPromo(db, userId) {
  return db.transaction(() => {
    const existing = db.prepare("SELECT code FROM personal_promos WHERE user_id = ?").get(userId);
    if (existing) return existing.code;
    const eligible = db.prepare("SELECT 1 FROM orders o JOIN order_reviews r ON r.order_id = o.id WHERE o.user_id = ? AND o.status = 'completed' AND o.paid_at IS NOT NULL LIMIT 1").get(userId);
    if (!eligible) throw new Error("Complete a paid order and leave a review first");
    const code = `PLAYER-${randomBytes(6).toString("hex").toUpperCase()}`;
    db.prepare("INSERT INTO personal_promos (user_id, code, created_at) VALUES (?, ?, ?)").run(userId, code, Date.now());
    return code;
  }).immediate();
}

export function walletBalance(db, userId) {
  return db.prepare("SELECT balance FROM wallet_accounts WHERE user_id = ?").get(userId)?.balance ?? 0;
}

export function changeWallet(db, { userId, reference, kind, amount, orderId = null, allowDebt = false, now = Date.now() }) {
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > maxBalance) throw new Error("Invalid wallet amount");
  return db.transaction(() => {
    const existing = db.prepare("SELECT user_id, amount, kind FROM wallet_entries WHERE reference = ?").get(reference);
    if (existing) {
      if (existing.user_id !== userId || existing.amount !== amount || existing.kind !== kind) throw new Error("Wallet entry conflict");
      return false;
    }
    db.prepare("INSERT INTO wallet_accounts (user_id, balance) VALUES (?, 0) ON CONFLICT(user_id) DO NOTHING").run(userId);
    const changed = db.prepare("UPDATE wallet_accounts SET balance = balance + ? WHERE user_id = ? AND balance + ? BETWEEN ? AND ?").run(amount, userId, amount, allowDebt || amount > 0 ? -maxBalance : 0, maxBalance);
    if (!changed.changes) throw new Error(amount < 0 ? "Insufficient balance" : "Wallet balance limit reached");
    db.prepare("INSERT INTO wallet_entries (id, user_id, reference, kind, amount, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(randomUUID(), userId, reference, kind, amount, orderId, now);
    return true;
  }).immediate();
}

export function creditReferral(db, orderId, now = Date.now()) {
  return db.transaction(() => {
    const earning = db.prepare("SELECT e.*, o.user_id, o.status, o.paid_at FROM promo_earnings e JOIN orders o ON o.id = e.order_id WHERE e.order_id = ?").get(orderId);
    if (!earning || !earning.owner_id || earning.owner_id === earning.user_id || earning.status !== "completed" || !earning.paid_at || earning.reversed_at || earning.credited_at || earning.amount <= 0) return false;
    changeWallet(db, { userId: earning.owner_id, reference: `referral:${orderId}`, kind: "referral", amount: earning.amount, orderId, now });
    db.prepare("UPDATE promo_earnings SET credited_at = ? WHERE order_id = ?").run(now, orderId);
    return true;
  }).immediate();
}

export function reverseOrderWallet(db, orderId, now = Date.now()) {
  return db.transaction(() => {
    const order = db.prepare("SELECT user_id, total_amount, payment_method FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new Error("Order not found");
    const earning = db.prepare("SELECT * FROM promo_earnings WHERE order_id = ?").get(orderId);
    if (earning?.owner_id && earning.credited_at && !earning.reversed_at && earning.amount > 0) changeWallet(db, { userId: earning.owner_id, reference: `referral-reversal:${orderId}`, kind: "referral_reversal", amount: -earning.amount, orderId, allowDebt: true, now });
    db.prepare("UPDATE promo_earnings SET reversed_at = COALESCE(reversed_at, ?) WHERE order_id = ?").run(now, orderId);
    if (order.payment_method === "wallet") changeWallet(db, { userId: order.user_id, reference: `refund:${orderId}`, kind: "refund", amount: order.total_amount, orderId, now });
  }).immediate();
}
