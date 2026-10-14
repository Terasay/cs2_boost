"use client";

import { useEffect, useState } from "react";
import { Gift, TicketPercent } from "lucide-react";
import { api } from "./account-ui";
import { LinkCopy } from "./link-copy";
import { useLiveResource } from "./use-live-resource";
import { money } from "@/lib/pricing.mjs";

export type ReferralInfo = { personalCode: string | null; eligible: boolean; completedOrderId: string | null; referral: { orders: number; earned: number; pending: number } };

export function ReferralCard({ data, ru, onClaim, busy }: { data: ReferralInfo; ru: boolean; onClaim: () => void; busy: boolean }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => { const timer = setTimeout(() => setOrigin(window.location.origin), 0); return () => clearTimeout(timer); }, []);
  const lang = ru ? "ru" : "en";
  return <section className="account-panel referral-card">
    <div className="panel-heading"><span className="panel-icon"><Gift size={22}/></span><div><h2>{ru ? "Приглашайте друзей" : "Invite your friends"}</h2><p>{ru ? "Другу −5% на заказ. Вам — 5% от его оплаты." : "Your friend saves 5%. You earn 5% of their payment."}</p></div></div>
    {data.personalCode ? <><div className="personal-promo-code"><TicketPercent size={22}/><strong>{data.personalCode}</strong><span>−5%</span></div><LinkCopy value={origin ? `${origin}/${lang}?promo=${encodeURIComponent(data.personalCode)}#calculator` : ""} label={ru ? "Ваша ссылка для друзей" : "Your referral link"} ru={ru}/><div className="referral-stats"><div><small>{ru ? "Заказов друзей" : "Referred orders"}</small><strong>{data.referral.orders}</strong></div><div><small>{ru ? "На балансе за друзей" : "Rewards credited"}</small><strong>{money(data.referral.earned, lang)}</strong></div><div><small>{ru ? "После выполнения" : "Pending completion"}</small><strong>{money(data.referral.pending, lang)}</strong></div></div><p className="inspector-note">{ru ? "Бонус приходит на баланс после завершения оплаченного заказа. При возврате бонус отменяется. Свой код можно использовать для скидки на повторный заказ; бонус за собственную покупку не начисляется." : "Rewards reach your balance once a paid order is completed and are reversed on refunds. Use your own code for a repeat-order discount; self-purchases do not earn a reward."}</p></> : <div className="referral-locked"><p>{ru ? "Завершите первый оплаченный заказ и оставьте отзыв любой оценки — получите личный промокод и ссылку." : "Complete your first paid order and leave a review with any rating to receive your personal code and link."}</p>{data.eligible ? <button className="compact-primary" disabled={busy} onClick={onClaim}>{busy ? (ru ? "Получаем…" : "Creating…") : (ru ? "Получить свой промокод" : "Get my promo code")}</button> : data.completedOrderId ? <a className="secondary-action" href={`/orders/${data.completedOrderId}#order-review`}>{ru ? "Оставить отзыв" : "Leave a review"}</a> : <a className="secondary-action" href={`/${lang}#calculator`}>{ru ? "Создать заказ" : "Create an order"}</a>}</div>}
  </section>;
}

export function PersonalPromoPanel({ ru }: { ru: boolean }) {
  const resource = useLiveResource<ReferralInfo>("/api/wallet", 30000);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function claim() {
    if (busy) return;
    setBusy(true); setError("");
    try { await api("/api/wallet", { method: "POST", body: JSON.stringify({ action: "claim" }) }); await resource.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }
  return <div className="review-referral">{(error || resource.error) && <p className="error" role="alert">{error || resource.error}</p>}{resource.data && <ReferralCard data={resource.data} ru={ru} onClaim={claim} busy={busy}/>}</div>;
}
