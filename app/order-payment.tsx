"use client";

import { useRef, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { api } from "./account-ui";
import type { Order } from "./order-controls";
import { money } from "@/lib/pricing.mjs";

type Intent = { id: string; reference: string; accountCode: string; status: string; amount: number; currency: string; expiresAt: number; expired: boolean };
export type PaymentInfo = { available: boolean; intent: Intent | null; receipt: { id: string } | null };

export function OrderPayment({ order, payment, admin, ru, busy, run, reload }: { order: Order; payment: PaymentInfo; admin: boolean; ru: boolean; busy: boolean; run: (action: string, values?: Record<string, unknown>) => Promise<boolean>; reload: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const pending = useRef(false);
  if (order.status !== "awaiting_payment") return null;
  const invoice = payment.intent;
  const reviewing = invoice?.status === "review";
  const total = order.totalAmount;
  const currency = order.quotedCurrency || "RUB";
  async function checkout() {
    if (pending.current) return;
    pending.current = true; setWorking(true); setError("");
    try { await api(`/api/orders/${order.id}/payment`, { method: "POST", signal: AbortSignal.timeout(15000), body: JSON.stringify({ updatedAt: order.updatedAt }) }); reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setWorking(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(invoice!.reference); setFeedback(ru ? "Код скопирован" : "Reference copied"); }
    catch { setError(ru ? "Выделите код и скопируйте вручную." : "Select the reference and copy it manually."); }
  }
  return <section className="payment-instructions"><strong>{ru ? "К оплате" : "Amount due"}: {total === null ? "—" : money(total, ru ? "ru" : "en", currency)}</strong>
    {error && <p className="error" role="alert">{error}</p>}{feedback && <p className="saved-feedback" role="status">{feedback}</p>}
    {invoice && ["pending", "review"].includes(invoice.status) && <div className="checkout-reference"><small>{ru ? "Код заказа для сообщения в DonationAlerts" : "Order reference for the DonationAlerts message"}</small><code>{invoice.reference}</code><button className="secondary-action" type="button" onClick={copy}><Copy size={14}/>{ru ? "Копировать" : "Copy"}</button></div>}
    {admin ? <>
      <p>{reviewing ? (ru ? "Уведомление совпало по коду, сумме и валюте. Проверьте фактическое поступление денег в DonationAlerts перед подтверждением." : "The alert matched the reference, amount and currency. Check the actual funds in DonationAlerts before confirming.") : (ru ? "Подтвердите только фактически полученную полную сумму." : "Confirm only when the full amount has actually been received.")}</p>
      {reviewing && payment.receipt && <p className="inspector-note">DonationAlerts ID: {payment.receipt.id.split(":").at(-1)}</p>}
      <label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{ru ? "Проверил поступление полной суммы" : "I checked receipt of the full amount"}</span></label>
      <button className="compact-primary" type="button" disabled={busy || !confirmed} onClick={async () => { if (await run("confirm_payment", { receivedAmount: total, confirmed: true, ...(reviewing ? { paymentIntentId: invoice!.id } : {}) })) setConfirmed(false); }}>{ru ? "Подтвердить оплату" : "Confirm payment"}</button>
      {reviewing && <details className="inspector-breakdown"><summary>{ru ? "Деньги не поступили" : "Funds not received"}</summary><label>{ru ? "Причина — видна клиенту" : "Reason — visible to the client"}<textarea rows={2} minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label><button type="button" className="danger-action" disabled={busy || reason.trim().length < 3} onClick={() => run("reject_payment", { reason })}>{ru ? "Отклонить уведомление" : "Reject alert"}</button></details>}
    </> : reviewing ? <p className="saved-feedback">{ru ? "Уведомление найдено. Администратор проверяет поступление денег. Повторно оплачивать не нужно." : "Alert found. The admin is checking the received funds. Do not pay again."}</p> : payment.available && currency === "RUB" ? invoice?.status === "pending" && !invoice.expired ? <>
      <p>{ru ? "Укажите точную сумму в рублях и вставьте код целиком в сообщение. После проверки поступления откроется форма передачи данных." : "Enter the exact RUB amount and paste the complete reference into the message. The details form opens after receipt is verified."}</p>
      <a className="compact-primary" href={`https://www.donationalerts.com/r/${encodeURIComponent(invoice.accountCode)}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{ru ? "Открыть DonationAlerts" : "Open DonationAlerts"}</a>
      <p className="inspector-note">{ru ? "Проверка выполняется раз в минуту. Если оплата не найдена, напишите в чат заказа; повторный перевод не делайте." : "Checked every minute. If the payment is not found, contact the order chat; do not send another transfer."}</p>
      <button className="secondary-action" type="button" onClick={reload}>{ru ? "Обновить статус" : "Refresh status"}</button>
      <details className="inspector-breakdown"><summary>{ru ? "Нужен новый код" : "Need a new reference"}</summary><p>{ru ? "Создавайте новый код только если предыдущий перевод не выполнялся. При просроченном коде уже отправленную оплату проверит администратор в чате." : "Create a new reference only if you have not sent the previous payment. Ask the admin to check payments already sent with an expired reference."}</p><button type="button" className="secondary-action" disabled={working || busy} onClick={checkout}>{ru ? "Обновить код" : "Renew reference"}</button></details>
    </> : <button className="compact-primary" type="button" disabled={working || busy} onClick={checkout}>{working ? (ru ? "Готовим…" : "Preparing…") : (ru ? "Подготовить оплату" : "Prepare payment")}</button> : <p>{ru ? "Уточните способ оплаты в чате заказа. После подтверждения поступления откроется форма передачи данных." : "Ask for payment details in the order chat. The access form opens once receipt is confirmed."}</p>}
  </section>;
}
