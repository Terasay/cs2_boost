import { getDb } from "@/db";
import { and, eq } from "drizzle-orm";
import { walletTopups, walletReceipts } from "@/db/schema";
import { claimPersonalPromo, walletBalance } from "@/lib/wallet.mjs";
import { getCurrentUser } from "../auth/auth-lib";
import { chargeAttempt, rateKey } from "../auth/rate-limit";
import { connectionId, createWalletTopup, syncPaymentTests, walletPaymentStatus } from "../payments/donationalerts/service";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../request-security";

export const GET = safeApi(async request => {
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  const db = getDb().$client;
  const page = Math.min(100000, Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1));
  if (!Number.isSafeInteger(page)) return privateJson({ error: "Invalid filters" }, 400);
  const personal = db.prepare("SELECT code FROM personal_promos WHERE user_id = ?").get(user.id) as { code: string } | undefined;
  const eligible = db.prepare("SELECT o.id FROM orders o JOIN order_reviews r ON r.order_id = o.id WHERE o.user_id = ? AND o.status = 'completed' AND o.paid_at IS NOT NULL LIMIT 1").get(user.id) as { id: string } | undefined;
  const completed = db.prepare("SELECT id FROM orders WHERE user_id = ? AND status = 'completed' AND paid_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1").get(user.id) as { id: string } | undefined;
  const stats = db.prepare("SELECT count(*) as orders, coalesce(sum(CASE WHEN credited_at IS NOT NULL THEN amount ELSE 0 END), 0) AS earned, coalesce(sum(CASE WHEN credited_at IS NULL THEN amount ELSE 0 END), 0) AS pending FROM promo_earnings WHERE owner_id = ? AND amount > 0 AND reversed_at IS NULL").get(user.id);
  const total = (db.prepare("SELECT count(*) AS n FROM wallet_entries WHERE user_id = ?").get(user.id) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / 20));
  const currentPage = Math.min(page, pages);
  const entries = db.prepare("SELECT id, kind, amount, CASE WHEN kind IN ('order', 'refund') THEN order_id END AS orderId, created_at AS createdAt FROM wallet_entries WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ?").all(user.id, (currentPage - 1) * 20);
  return privateJson({ currentUserId: user.id, role: user.role, balance: walletBalance(db, user.id), currency: "RUB", personalCode: personal?.code ?? null, eligible: Boolean(eligible), completedOrderId: completed?.id ?? null, referral: stats, entries, page: currentPage, pages, total, ...walletPaymentStatus(user.id) });
});

export const POST = safeApi(async request => {
  if (!sameOriginMutation(request)) return privateJson({ error: "Invalid origin" }, 403);
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  if (user.role !== "client") return privateJson({ error: "Client account required" }, 403);
  const input = await jsonInput(request);
  if (!input) return privateJson({ error: "Invalid request" }, 400);
  if (await chargeAttempt(await rateKey("wallet", null, user.id), 20, 60000)) return privateJson({ error: "Too many requests. Try again later" }, 429);
  try {
    if (input.action === "claim") return privateJson({ code: claimPersonalPromo(getDb().$client, user.id) });
    if (input.action === "cancel_topup") {
      if (typeof input.id !== "string" || input.confirmed !== true) return privateJson({ error: "Invalid request" }, 400);
      return getDb().transaction(tx => {
        const topup = tx.select().from(walletTopups).where(and(eq(walletTopups.id, input.id as string), eq(walletTopups.userId, user.id))).get();
        if (!topup) return privateJson({ error: "Top up not found" }, 404);
        if (topup.status !== "pending" || tx.select().from(walletReceipts).where(eq(walletReceipts.topupId, topup.id)).get()) return privateJson({ error: "Top up cannot be cancelled" }, 409);
        tx.update(walletTopups).set({ status: "void" }).where(eq(walletTopups.id, topup.id)).run();
        return privateJson({ ok: true });
      });
    }
    if (input.action === "prepare") {
      const topup = createWalletTopup(user.id, input.amount);
      return privateJson({ id: topup.id }, 201);
    }
    if (input.action === "check") {
      const retryAfter = await chargeAttempt(await rateKey("donation-api-sync", null, connectionId), 1, 30000);
      if (!retryAfter) await syncPaymentTests();
      return privateJson({ checked: !retryAfter, retryAfter: retryAfter || 30, balance: walletBalance(getDb().$client, user.id) });
    }
    return privateJson({ error: "Invalid wallet action" }, 400);
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "";
    if (["Complete a paid order and leave a review first", "Finish the pending top up first", "Top up between 100 and 100000 RUB", "Order payments are disabled", "Connect the configured DonationAlerts account"].includes(message)) return privateJson({ error: message }, 409);
    if (message.startsWith("DonationAlerts")) return privateJson({ error: message }, 503);
    throw reason;
  }
});
