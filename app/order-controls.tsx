"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, LockKeyhole } from "lucide-react";
import { api } from "./account-ui";
import { dayMs, discountedAmount, money } from "@/lib/pricing.mjs";

export type Order = {
  id: string; clientEmail: string; platform: string; service: string; method: string; currentRating: number | null; targetRating: number | null;
  status: string; quotedPrice: number | null; quotedCurrency: string | null; deadline: string | null; updatedAt: number; pricingVersion: number;
  redTrust: boolean; promoCode: string | null; baseAmount: number | null; surchargeAmount: number; discountAmount: number; totalAmount: number | null;
  initialTotalAmount: number | null; commissionAmount: number; durationDays: number | null; standardDays: number | null;
  acceptedAt: number | null; paidAt: number | null; startedAt: number | null; dueAt: number | null; completedAt: number | null;
  proposalAmount: number | null; proposalDays: number | null; proposalReason: string | null;
};
export type OrderEvent = { id: string; type: string; details: { reason?: string; bonus?: string; days?: number; totalAmount?: number; dueAt?: number }; createdAt: number };
export type AccessInfo = { submittedAt: number; expiresAt: number } | null;

export function OrderTimer({ order, ru }: { order: Order; ru: boolean }) {
  const [now, setNow] = useState(0);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
  if (!order.startedAt || !order.dueAt) return <p className="inspector-note"><Clock3 size={15}/>{ru ? "Срок отсчитывается после оплаты и передачи данных." : "Delivery time starts after payment and details are received."}</p>;
  const remaining = order.dueAt - (now || order.startedAt);
  const overdue = remaining < 0 && order.status === "in_progress";
  const days = Math.floor(Math.abs(remaining) / dayMs);
  const hours = Math.floor(Math.abs(remaining) / 3600000) % 24;
  const minutes = Math.floor(Math.abs(remaining) / 60000) % 60;
  const finished = order.status === "completed" || order.status === "cancelled";
  return <div className={`delivery-timer ${overdue ? "overdue" : ""}`}><span><Clock3 size={16}/>{finished ? (ru ? "Выполнение завершено" : "Delivery ended") : overdue ? (ru ? "Задержка выполнения" : "Delivery overdue") : (ru ? "До завершения" : "Time remaining")}</span>{!finished && <strong>{days}{ru ? "д" : "d"} {hours}{ru ? "ч" : "h"} {minutes}{ru ? "м" : "m"}</strong>}<small>{ru ? "Срок:" : "Due:"} {new Date(order.dueAt).toLocaleString(ru ? "ru-RU" : "en-US")}</small>{overdue && <p>{ru ? "Напишите администратору в чат для уточнения срока и бонуса." : "Contact the admin about the delay and a possible bonus."}</p>}</div>;
}

export function OrderActions({ order, admin, ru, busy, run }: { order: Order; admin: boolean; ru: boolean; busy: boolean; run: (action: string, values?: Record<string, unknown>) => Promise<boolean> }) {
  const [mode, setMode] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [bonus, setBonus] = useState("");
  const [version, setVersion] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const lang = ru ? "ru" : "en";
  const currency = order.quotedCurrency || (order.pricingVersion ? "RUB" : "KZT");
  const total = order.totalAmount ?? (order.quotedPrice === null ? null : order.quotedPrice * 100);
  const beforePayment = ["new", "quoted", "awaiting_payment"].includes(order.status);
  const proposal = order.proposalAmount === null ? null : discountedAmount(order.proposalAmount, order.promoCode);
  function open(value: string) { setMode(value); setAmount(((total ?? 0) + order.discountAmount) / 100 + ""); setDays(String(order.durationDays || 1)); setReason(""); setBonus(""); setVersion(order.updatedAt); setConfirmed(false); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const values = mode === "propose" ? { amount: Math.round(Number(amount) * 100), days: Number(days), reason } : mode === "delay" ? { days: Number(days), reason, bonus } : { reason, confirmed };
    if (await run(mode, { ...values, updatedAt: version })) setMode("");
  }
  return <div className="order-actions-panel">
    {order.status === "new" && <p className="inspector-note">{admin ? (ru ? "Проверьте параметры. Принятие откроет клиенту оплату по сохранённой цене." : "Review the details. Acceptance opens payment at the saved price.") : (ru ? "Администратор проверяет заявку. До принятия оплачивать её не нужно." : "An admin is reviewing the request. Wait for acceptance before paying.")}</p>}
    {order.status === "quoted" && proposal && <div className="pending-proposal"><b>{ru ? "Новые условия на подтверждении" : "New terms awaiting acceptance"}</b><p>{order.proposalReason}</p><dl><div><dt>{ru ? "Сейчас" : "Current"}</dt><dd>{total === null ? "—" : money(total, lang, currency)}</dd></div><div><dt>{ru ? "Предложено" : "Proposed"}</dt><dd>{money(proposal.totalAmount, lang, currency)} · {order.proposalDays} {ru ? "дн." : "days"}</dd></div></dl>{order.promoCode && <small>{order.promoCode}: −20% {ru ? "уже учтены" : "included"}</small>}{!admin && <button className="compact-primary" disabled={busy} onClick={()=>run("accept")}>{ru ? "Принять новые условия" : "Accept new terms"}</button>}</div>}
    {order.status === "awaiting_payment" && <div className="payment-instructions"><strong>{ru ? "К оплате" : "Amount due"}: {total === null ? "—" : money(total, lang, currency)}</strong><p>{admin ? (ru ? "Подтверждайте оплату только после фактического получения этой суммы." : "Confirm only after receiving this exact amount.") : (ru ? "Уточните реквизиты в чате заказа. После перевода администратор подтвердит оплату и откроет форму передачи данных." : "Ask for payment details in the order chat. After the transfer, the admin confirms payment and opens the access form.")}</p>{admin && <><label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>{ru ? "Получена полная сумма заказа" : "The full amount has been received"}</span></label><button className="compact-primary" disabled={busy || !confirmed} onClick={()=>run("confirm_payment",{receivedAmount:total,confirmed:true})}>{ru ? "Подтвердить оплату" : "Confirm payment"}</button></>}</div>}
    <div className="order-action-buttons">
      {admin && order.status === "new" && total !== null && <button className="compact-primary" disabled={busy} onClick={()=>run("accept")}>{ru ? "Принять без изменений" : "Accept as submitted"}</button>}
      {admin && beforePayment && <button className="secondary-action" disabled={busy} onClick={()=>open("propose")}>{ru ? "Предложить другие условия" : "Propose different terms"}</button>}
      {admin && order.status === "in_progress" && <><button className="compact-primary" disabled={busy} onClick={()=>open("complete")}>{ru ? "Завершить заказ" : "Complete order"}</button>{order.dueAt && <button className="secondary-action" disabled={busy} onClick={()=>open("delay")}>{ru ? "Сообщить о задержке" : "Report a delay"}</button>}</>}
      {beforePayment && <button className="danger-action" disabled={busy} onClick={()=>open("cancel")}>{admin ? (ru ? "Отклонить заявку" : "Decline request") : (ru ? "Отменить заявку" : "Cancel request")}</button>}
      {admin && order.paidAt && order.status !== "cancelled" && <button className="danger-action" disabled={busy} onClick={()=>open("refund")}>{ru ? "Зафиксировать полный возврат" : "Record a full refund"}</button>}
    </div>
    {mode && <form className="order-editor action-form" onSubmit={submit}><h2>{({propose:ru ? "Предложение клиенту" : "Offer to the client",delay:ru ? "Задержка и бонус" : "Delay and bonus",cancel:ru ? "Отмена заявки" : "Cancel request",refund:ru ? "Подтверждение возврата" : "Confirm refund",complete:ru ? "Завершение заказа" : "Complete order"} as Record<string,string>)[mode]}</h2>
      {mode === "propose" && <><label>{ru ? "Цена до скидки по промокоду" : "Price before the promo discount"} · {currency}<input type="number" min="1" max="100000000" step="0.01" value={amount} required onChange={event=>setAmount(event.target.value)}/></label><p className="inspector-note">{ru ? "Включите все надбавки в эту сумму. Скидка по промокоду применится автоматически." : "Include any surcharges. The promo discount is applied automatically."}</p></>}
      {["propose","delay"].includes(mode) && <label>{mode === "delay" ? (ru ? "Дополнительные дни" : "Additional days") : (ru ? "Дней на выполнение" : "Delivery days")}<input type="number" min="1" max={mode === "delay" ? 30 : 1000} step="1" value={days} required onChange={event=>setDays(event.target.value)}/></label>}
      {mode !== "complete" && <label>{ru ? "Причина — видна клиенту" : "Reason — visible to the client"}<textarea value={reason} minLength={3} maxLength={1000} required rows={3} onChange={event=>setReason(event.target.value)}/></label>}
      {mode === "delay" && <label>{ru ? "Бонус клиенту (если согласован)" : "Client bonus (if agreed)"}<input value={bonus} maxLength={500} onChange={event=>setBonus(event.target.value)}/></label>}
      {["refund","complete"].includes(mode) && <label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>{mode === "refund" ? (ru ? "Полная сумма уже возвращена клиенту вне сайта" : "The full amount was refunded outside the site") : (ru ? "Согласованный результат достигнут" : "The agreed result has been delivered")}</span></label>}
      {version !== order.updatedAt && <p className="error">{ru ? "Заказ изменился. Закройте форму и проверьте условия." : "The order changed. Close this form and review its terms."}</p>}
      <button className="compact-primary" type="submit" disabled={busy || version !== order.updatedAt || (["refund","complete"].includes(mode) && !confirmed)}>{busy ? (ru ? "Сохраняем…" : "Saving…") : (ru ? "Подтвердить" : "Confirm")}</button><button className="editor-discard" type="button" onClick={()=>setMode("")}>{ru ? "Закрыть" : "Close"}</button>
    </form>}
  </div>;
}

export function SecureOrderAccess({ order, admin, info, ru, onSaved }: { order: Order; admin: boolean; info: AccessInfo; ru: boolean; onSaved: ()=>void }) {
  const [login,setLogin]=useState(""); const [password,setPassword]=useState(""); const [profile,setProfile]=useState(""); const [note,setNote]=useState(""); const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [revealed,setRevealed]=useState<Record<string,string>|null>(null);
  const [editing,setEditing]=useState(false);
  useEffect(()=>{if(!revealed)return;const timer=setTimeout(()=>setRevealed(null),60000);return()=>clearTimeout(timer)},[revealed]);
  if (!order.paidAt || !["awaiting_access","in_progress"].includes(order.status)) return null;
  async function send(event?:React.FormEvent) {
    event?.preventDefault(); if(busy)return;setBusy(true);setError("");
    try {const result=await api<{access?:Record<string,string>}>(`/api/orders/${order.id}/access`,{method:"POST",body:JSON.stringify(admin ? {action:"reveal"} : {action:"submit",login,password,profile,note,confirmed,updatedAt:order.updatedAt})});if(admin)setRevealed(result.access || null);else{setLogin("");setPassword("");setProfile("");setNote("");setConfirmed(false);setEditing(false);}onSaved();}
    catch(reason){setError(reason instanceof Error?reason.message:"Error");}finally{setBusy(false);}
  }
  return <section className="secure-access"><h2><LockKeyhole size={17}/>{ru ? "Данные для выполнения" : "Delivery details"}</h2>{error && <p className="error">{error}</p>}{info && <p className="saved-feedback"><Check size={14}/>{ru ? "Данные получены" : "Details received"} · {new Date(info.submittedAt).toLocaleString(ru ? "ru-RU" : "en-US")}</p>}
    {admin ? info ? <>{revealed ? <><dl className="revealed-access">{Object.entries(revealed).filter(([,value])=>value).map(([key,value])=><div key={key}><dt>{({login:ru?"Логин":"Login",password:ru?"Пароль":"Password",profile:ru?"Профиль":"Profile",note:ru?"Примечание":"Note"} as Record<string,string>)[key]}</dt><dd>{value}</dd></div>)}</dl><button className="secondary-action" onClick={()=>setRevealed(null)}>{ru ? "Скрыть данные" : "Hide details"}</button></> : <button className="secondary-action" disabled={busy} onClick={()=>send()}>{ru ? "Показать данные на 60 секунд" : "Reveal details for 60 seconds"}</button>}</> : <p className="inspector-note">{order.startedAt ? (ru ? "Срок хранения данных истёк. Попросите клиента обновить их; таймер продолжает идти." : "The stored details expired. Ask the client to update them; the timer continues.") : (ru ? "Ждём передачу данных клиентом. Таймер ещё не запущен." : "Awaiting client details. The timer has not started.")}</p> : info && !editing ? <button className="secondary-action" onClick={()=>setEditing(true)}>{ru ? "Обновить данные" : "Update details"}</button> : <form className="order-editor" onSubmit={send}>
      {order.method === "piloted" && <><label>{ru ? "Логин игрового аккаунта" : "Game account login"}<input autoComplete="off" maxLength={254} value={login} required onChange={event=>setLogin(event.target.value)}/></label><label>{ru ? "Пароль игрового аккаунта" : "Game account password"}<input type="password" autoComplete="new-password" maxLength={256} value={password} required onChange={event=>setPassword(event.target.value)}/></label></>}
      <label>{ru ? "Ссылка на Steam / FACEIT профиль" : "Steam / FACEIT profile"}<input value={profile} maxLength={500} required={order.method === "duo"} onChange={event=>setProfile(event.target.value)}/></label><label>{order.method === "duo" ? (ru ? "Регион и удобное время игры" : "Region and available playing times") : (ru ? "Примечание (без кодов Steam Guard)" : "Note (no Steam Guard codes)")}<textarea value={note} rows={3} maxLength={1000} required={order.method === "duo"} onChange={event=>setNote(event.target.value)}/></label><p className="inspector-note">{ru ? "Данные шифруются и доступны администрации этого сайта. Не отправляйте пароль в чат. Подтверждение Steam Guard согласуйте с исполнителем при входе." : "Details are encrypted and available to this site's admins. Keep passwords out of chat. Arrange Steam Guard confirmation with the booster when they sign in."}</p><label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/><span>{ru ? "Доступ / расписание готово. Можно начать выполнение и отсчёт срока." : "Access / scheduling is ready. Delivery and the timer can start."}</span></label><button className="compact-primary" type="submit" disabled={busy || !confirmed}>{ru ? "Передать данные" : "Submit details"}</button>{editing && <button type="button" className="editor-discard" onClick={()=>{setEditing(false);setPassword("");setLogin("");}}>{ru ? "Отмена" : "Cancel"}</button>}</form>}
  </section>;
}

export function OrderHistory({ events, order, ru }: { events: OrderEvent[]; order: Order; ru: boolean }) {
  if(!events.length)return null;
  const labels: Record<string,string>=ru?{accept:"Условия приняты",propose:"Предложены новые условия",confirm_payment:"Оплата подтверждена",started:"Выполнение началось",access_updated:"Данные обновлены",access_viewed:"Администратор просмотрел данные",delay:"Срок продлён",complete:"Заказ завершён",cancel:"Заявка отменена",refund:"Полный возврат подтверждён"}:{accept:"Terms accepted",propose:"New terms proposed",confirm_payment:"Payment confirmed",started:"Delivery started",access_updated:"Details updated",access_viewed:"An admin viewed the details",delay:"Deadline extended",complete:"Order completed",cancel:"Request cancelled",refund:"Full refund confirmed"};
  return <details className="order-history"><summary>{ru ? "История условий и действий" : "Terms and activity history"}</summary><ol>{events.map(event=><li key={event.id}><b>{labels[event.type] || event.type}</b><small>{new Date(event.createdAt).toLocaleString(ru?"ru-RU":"en-US")}</small>{event.details.totalAmount !== undefined && <span>{money(event.details.totalAmount,ru?"ru":"en",order.quotedCurrency || "RUB")}</span>}{event.details.reason && <p>{event.details.reason}</p>}{event.details.bonus && <p>{ru ? "Бонус:" : "Bonus:"} {event.details.bonus}</p>}{event.details.dueAt && <p>{ru ? "Срок:" : "Due:"} {new Date(event.details.dueAt).toLocaleString(ru?"ru-RU":"en-US")}</p>}</li>)}</ol></details>;
}
