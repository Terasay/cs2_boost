"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "./account-ui";
import type { Order } from "./order-controls";
import { money } from "@/lib/pricing.mjs";

type Intent = { id: string; reference: string; accountCode: string; status: string; amount: number; currency: string; expiresAt: number; expired: boolean };
export type PaymentInfo = {
  available: boolean;
  autoConfirm: boolean;
  intent: Intent | null;
  receipt: { id: string } | null;
  issue: { result: string; amount: number; currency: string; createdAt: number } | null;
  sync: { checkedAt: number | null; failedAt: number | null; error: string | null };
};

export function OrderPayment({ order, payment, admin, ru, busy, run, reload }: {
  order: Order; payment: PaymentInfo; admin: boolean; ru: boolean; busy: boolean;
  run: (action: string, values?: Record<string, unknown>) => Promise<boolean>; reload: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const pending = useRef(false);
  if (order.status !== "awaiting_payment") return null;
  const t = (ruText: string, enText: string) => ru ? ruText : enText;
  const invoice = payment.intent;
  const reviewing = invoice?.status === "review";
  const total = order.totalAmount;
  const currency = order.quotedCurrency || "RUB";
  const locale = ru ? "ru" : "en";
  const issue = payment.issue;
  const endpoint = "/api/orders/" + order.id + "/payment";

  async function checkout() {
    if (pending.current) return;
    pending.current = true; setWorking(true); setError(""); setFeedback("");
    try {
      await api(endpoint, { method: "POST", signal: AbortSignal.timeout(15000), body: JSON.stringify({ updatedAt: order.updatedAt }) });
      reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setWorking(false); }
  }

  async function checkPayment() {
    if (pending.current) return;
    pending.current = true; setWorking(true); setError(""); setFeedback("");
    try {
      if (admin) {
        await api("/api/payments/donationalerts", { method: "POST", signal: AbortSignal.timeout(45000), body: JSON.stringify({ action: "sync" }) });
        setFeedback(t("Уведомления проверены. Статус обновляется.", "Alerts checked. Updating the status."));
      } else {
        const result = await api<{ checked: boolean; retryAfter: number; payment: PaymentInfo }>(endpoint, { method: "POST", signal: AbortSignal.timeout(45000), body: JSON.stringify({ action: "check" }) });
        setFeedback(result.payment.intent?.status === "confirmed" ? t("Оплата подтверждена. Можно передать игровые данные.", "Payment confirmed. You can submit your game details.") : result.payment.intent?.status === "review" ? t("Платёж найден. Завершаем подтверждение.", "Alert found. Completing confirmation.") : !result.checked && result.retryAfter ? t("Проверка уже выполнялась. Повторить можно через " + result.retryAfter + " сек.", "Already checked recently. Try again in " + result.retryAfter + " sec.") : result.payment.issue ? t("Перевод найден, но требует уточнения. Подробности ниже.", "Transfer found but needs clarification. See below.") : t("Совпадение пока не найдено. Если вы уже заплатили, не отправляйте деньги повторно.", "No match yet. If you already paid, do not send another transfer."));
      }
      reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); reload(); }
    finally { pending.current = false; setWorking(false); }
  }

  async function copyReference() {
    if (!invoice) return;
    try { await navigator.clipboard.writeText(invoice.reference); setFeedback(t("Код скопирован. Вставьте его в поле сообщения DonationAlerts перед оплатой.", "Reference copied. Paste it into the DonationAlerts message field before paying.")); }
    catch { setError(t("Выделите код и скопируйте вручную.", "Select the reference and copy it manually.")); }
  }

  const paymentLink = invoice && <a className="compact-primary" href={"https://www.donationalerts.com/r/" + encodeURIComponent(invoice.accountCode)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t("Перейти в DonationAlerts", "Open DonationAlerts")}</a>;
  return <section className="payment-instructions" aria-label={t("Оплата заказа", "Order payment")}>
    <div className="payment-amount"><span>{t("Сумма заказа", "Order amount")}</span><strong>{total === null ? "—" : money(total, locale, currency)}</strong></div>
    {error && <p className="error" role="alert">{error}</p>}
    {feedback && <p className="saved-feedback" role="status">{feedback}</p>}
    {issue && !reviewing && <div className="payment-issue" role="status"><AlertCircle size={18}/><div>
      <strong>{issue.result === "wrong_currency" ? t("Валюта перевода отличается", "Transfer currency differs") : issue.result === "wrong_amount" ? t("Сумма перевода отличается", "Transfer amount differs") : t("Нужна проверка администратора", "Admin verification needed")}</strong>
      <p>{t("DonationAlerts сообщил:", "DonationAlerts reported:")} <b>{money(issue.amount, locale, issue.currency)}</b>. {t("В заказе:", "Order:")} <b>{total === null ? "—" : money(total, locale, currency)}</b>.</p>
      <small>{t("Не переводите деньги ещё раз. Напишите в чат заказа: администратор сверит оплату, комиссию и валюту.", "Do not pay again. Contact the order chat so the admin can verify payment, fees and currency.")}</small>
    </div></div>}
    {payment.sync?.error && <p className="payment-sync-warning">{t("Проверка DonationAlerts временно недоступна. Если деньги отправлены, сообщите в чат и не повторяйте перевод.", "DonationAlerts checks are temporarily unavailable. If you already paid, contact the chat and do not transfer again.")}</p>}

    {admin ? <>
      <p>{payment.autoConfirm ? t("Оплата подтвердится автоматически, когда код, сумма и валюта совпадут. Клиент сразу получит доступ к форме игровых данных.", "Payment is confirmed automatically when the reference, amount and currency match. The client can then submit game details.") : t("Уточните способ оплаты с клиентом и подтвердите получение указанной суммы.", "Agree on payment details with the client and verify the stated amount.")}</p>
      {reviewing && payment.receipt && <p className="inspector-note">DonationAlerts ID: {payment.receipt.id.split(":").at(-1)}</p>}
      <p className="payment-fee-note">{t("Комиссия DonationAlerts может уменьшить ваш баланс. Сверяйте сумму самого платежа клиента, а не сумму для вывода.", "DonationAlerts fees can reduce your balance. Check the client's payment amount, not the withdrawal balance.")}</p>
      {payment.available && <button className="secondary-action" type="button" disabled={working || busy} onClick={checkPayment}><RefreshCw size={15}/>{working ? t("Проверяем…", "Checking…") : t("Проверить DonationAlerts", "Check DonationAlerts")}</button>}
      <details className="inspector-breakdown" open={!payment.autoConfirm}><summary>{t("Подтвердить оплату вручную", "Confirm payment manually")}</summary>
      <label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{t("Сверил реальный платёж клиента с суммой заказа", "I verified the real client payment against the order amount")}</span></label>
      <button className="compact-primary" type="button" disabled={busy || working || !confirmed} onClick={async () => { if (await run("confirm_payment", { receivedAmount: total, confirmed: true, ...(reviewing ? { paymentIntentId: invoice!.id } : {}) })) setConfirmed(false); }}><CheckCircle2 size={16}/>{t("Подтвердить оплату", "Confirm payment")}</button>
      </details>
      {reviewing && <details className="inspector-breakdown"><summary>{t("Платёж не подтверждается", "Payment cannot be verified")}</summary><label>{t("Причина — видна клиенту", "Reason — visible to the client")}<textarea rows={2} minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label><button type="button" className="danger-action" disabled={busy || reason.trim().length < 3} onClick={() => run("reject_payment", { reason })}>{t("Отклонить уведомление", "Reject alert")}</button></details>}
    </> : reviewing ? <div className="payment-found"><CheckCircle2 size={20}/><div><strong>{t("Платёж найден, переводить ещё раз не нужно", "Alert found. Do not pay again")}</strong><p>{t("Завершаем подтверждение. Здесь появится форма данных для игры.", "Completing confirmation. The game details form will appear here.")}</p><button className="secondary-action" type="button" disabled={working || busy} onClick={checkPayment}>{working ? t("Проверяем…", "Checking…") : t("Обновить статус", "Check status")}</button></div></div> : payment.available && currency === "RUB" ? invoice?.status === "pending" ? <>
      <div className="checkout-reference"><small>{t("Код для комментария к оплате", "Payment comment reference")}</small><code>{invoice.reference}</code><button className="secondary-action" type="button" onClick={copyReference}><Copy size={15}/>{t("Скопировать код", "Copy reference")}</button></div>
      {invoice.expired ? <><p className="payment-sync-warning">{t("Срок кода истёк. Уже отправленный перевод проверит администратор — напишите в чат.", "This reference expired. Contact the chat so the admin can verify any transfer already sent.")}</p><details className="inspector-breakdown"><summary>{t("Я ещё не отправлял деньги", "I have not paid yet")}</summary><button className="secondary-action" type="button" disabled={working || busy} onClick={checkout}>{t("Подготовить новый код", "Prepare a new reference")}</button></details></> : !issue && <>
        <ol className="payment-steps">
          <li><span>1</span><div><strong>{t("Вставьте код в сообщение DonationAlerts", "Paste the reference into the DonationAlerts message")}</strong><small>{t("Скопируйте код целиком и перед оплатой проверьте, что он виден в поле сообщения. Без кода платёж сможет подтвердить только администратор вручную.", "Copy the complete reference and check it is visible in the message field before paying. Without it, only the admin can verify payment manually.")}</small></div></li>
          <li><span>2</span><div><strong>{t("Отправьте указанную сумму в RUB", "Pay the stated RUB amount")}</strong><small>{t("Выберите рубли на странице оплаты. Комиссия сервиса может уменьшить баланс получателя.", "Select RUB on the payment page. Provider fees may reduce the recipient's balance.")}</small></div></li>
          <li><span>3</span><div><strong>{t("Вернитесь сюда и проверьте статус", "Return here and check the status")}</strong><small>{t("Сайт автоматически подтвердит оплату и откроет защищённую форму игровых данных.", "The site automatically confirms payment and opens the secure game details form.")}</small></div></li>
        </ol>{paymentLink}
      </>}
      <button className="secondary-action payment-check" type="button" disabled={working || busy} onClick={checkPayment}><RefreshCw size={16}/>{working ? t("Проверяем платёж…", "Checking payment…") : t("Я оплатил — проверить", "I paid — check payment")}</button>
      <p className="payment-check-time">{payment.sync?.checkedAt ? t("Последняя проверка: ", "Last check: ") + new Date(payment.sync.checkedAt).toLocaleTimeString(ru ? "ru-RU" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : t("Сервер ещё не проверял уведомления. Кнопка выше запустит проверку.", "The server has not checked alerts yet. The button above starts a check.")}</p>
      <p className="payment-fee-note">{t("Если вы уже заплатили, дождитесь проверки или напишите в чат. Повторный перевод не нужен.", "If you already paid, wait for verification or contact the chat. Do not pay again.")}</p>
    </> : <button className="compact-primary" type="button" disabled={working || busy} onClick={checkout}>{working ? t("Готовим оплату…", "Preparing payment…") : t("Подготовить оплату через DonationAlerts", "Prepare DonationAlerts payment")}</button> : <p>{t("Уточните способ оплаты в чате заказа. После подтверждения поступления откроется форма данных для игры.", "Ask for payment details in the order chat. The game details form opens after receipt is confirmed.")}</p>}
  </section>;
}
