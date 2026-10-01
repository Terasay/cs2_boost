"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { writeStorage } from "@/lib/browser-storage";
import { readCampaign } from "@/lib/campaign-storage";
import { calculatePrice, type Price } from "@/lib/pricing.mjs";
import { PriceSummary, PromoInput } from "../price-summary";
import { AccountShell, api, readDraft, type Draft, type User, useLanguage } from "../account-ui";
import EmailSignup from "../email-signup";

export default function Register() {
  const lang = useLanguage(); const ru = lang === "ru";
  const [draft, setDraft] = useState<Draft | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  let price: Price | null = null;
  try { if (draft) price = calculatePrice(draft); } catch {}
  function promo(value: string) {
    if (!draft) return;
    const updated = { ...draft, promoCode: value };
    setDraft(updated);
    setAccepted(false);
    writeStorage("sessionStorage", "cs2-draft", JSON.stringify(updated));
    writeStorage("sessionStorage", "cs2-promo", value);
  }
  useEffect(() => {
    const timer = setTimeout(() => setDraft(readDraft()), 0);
    api<{ user: User | null }>("/api/auth/me").then(data => { setUser(data.user); setReady(true); }).catch(reason => setError(reason instanceof Error ? reason.message : "Error"));
    return () => clearTimeout(timer);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (loading || !ready || !user || !draft) return;
    if (!accepted) { setError(ru ? "Подтвердите ознакомление с рисками." : "Please acknowledge the risks."); return; }
    if (!price) { setError(ru ? "Проверьте промокод и параметры заказа." : "Check the promo code and order details."); return; }
    setLoading(true); setError("");
    try {
      const result = await api<{ id: string }>("/api/orders", { method: "POST", body: JSON.stringify({ ...draft, expectedTotalAmount: price.totalAmount, riskAccepted: true, attribution: readCampaign() }) });
      writeStorage("sessionStorage", "cs2-draft", null);
      window.location.assign(`/orders/${result.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); setLoading(false); }
  }
  return <AccountShell><div className="account-intro"><span className="kicker">02 / 03</span><h1>{ru ? "Оформление заявки" : "Complete your request"}</h1><p>{ru ? "Создайте аккаунт, чтобы сохранить заказ и общаться с администратором." : "Create an account to save your order and chat with an admin."}</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="account-grid"><section className="account-panel"><h2>{ru ? "Параметры заказа" : "Order details"}</h2>{draft ? <><dl className="summary-list"><div><dt>{ru ? "Площадка" : "Platform"}</dt><dd>{draft.platform.toUpperCase()}</dd></div><div><dt>{ru ? "Услуга" : "Service"}</dt><dd>{draft.service === "rating" ? (ru ? "Буст рейтинга" : "Rating boost") : (ru ? "Калибровка" : "Calibration")}</dd></div><div><dt>{ru ? "Способ" : "Method"}</dt><dd>{draft.method === "duo" ? (ru ? "Игра вместе" : "Play together") : (ru ? "На аккаунте" : "Piloted")}</dd></div>{draft.service === "rating" && <div><dt>{ru ? "Рейтинг" : "Rating"}</dt><dd>{draft.current} → {draft.target}</dd></div>}</dl>{draft.platform === "premier" && <label className="trust-check"><input type="checkbox" checked={draft.redTrust === true} onChange={event=>{const updated={...draft,redTrust:event.target.checked};setDraft(updated);setAccepted(false);writeStorage("sessionStorage","cs2-draft",JSON.stringify(updated));}}/><span>{ru ? "Красный траст · +10%" : "Red trust · +10%"}</span></label>}<PromoInput value={draft.promoCode || ""} onChange={promo} ru={ru}/><PriceSummary price={price} ru={ru}/></> : <p className="email-description">{ru ? "Пока без заказа. После регистрации можно выбрать услугу на главной." : "No order yet. You can choose a service after registering."}</p>}<div className="summary-note">{ru ? "Условия сохранятся в заказе. Оплата откроется после принятия администратором. Любое новое предложение потребует вашего подтверждения." : "Your terms are saved with the order. Payment opens after admin approval. Any new offer requires your acceptance."}</div><p className="account-footnote"><a href={`/${lang}#calculator`}>{ru ? "Изменить параметры" : "Configure request"}</a></p></section>
    {!ready ? <div className="account-panel">{ru ? "Загрузка…" : "Loading…"}</div> : !user ? <EmailSignup lang={lang}/> : <form className="account-panel" onSubmit={submit}><h2>{ru ? "Подтвердите заявку" : "Confirm request"}</h2><p className="signed-as">{ru ? "Вы вошли как" : "Signed in as"} <b>{user.email}</b></p><label className="risk-check"><Checkbox checked={accepted} onCheckedChange={value => setAccepted(value === true)}/><span>{ru ? "Я понимаю, что буст может нарушать правила Steam и FACEIT и привести к ограничениям аккаунта." : "I understand that boosting may violate Steam and FACEIT rules and lead to account restrictions."}</span></label><p className="credential-note">{ru ? "Не указывайте пароль Steam и код Steam Guard в этой форме или чате." : "Do not enter your Steam password or Steam Guard code here or in the chat."}</p>{user.role === "admin" && <p className="summary-note">{ru ? "Для оформления заказа войдите как клиент." : "Use a client account to place an order."}</p>}<Button type="submit" className="account-cta" disabled={loading || !draft || user.role === "admin"}>{loading ? (ru ? "Отправляем…" : "Submitting…") : (ru ? "Отправить заявку" : "Submit request")}<ArrowRight size={18}/></Button><p className="account-footnote"><a href="/dashboard">{ru ? "В кабинет" : "Open account"}</a></p></form>}
    </div></AccountShell>;
}
