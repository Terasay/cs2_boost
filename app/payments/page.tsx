"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CreditCard, FlaskConical, Link2, RefreshCw, Unplug } from "lucide-react";
import { AccountShell, api, useLanguage } from "../account-ui";
import { WorkspaceNav } from "../workspace-ui";
import { useLiveResource } from "../use-live-resource";
import { money } from "@/lib/pricing.mjs";

type Test = { id: string; reference: string; orderId: string | null; amount: number; currency: string; status: string; matchedAt: number | null; expiresAt: number };
type Event = { id: string; testId: string; source: string; result: string; amount: number; currency: string; createdAt: number };
type State = { enabled: boolean; mode: string; payments: { id: string; orderId: string; reference: string; status: string; amount: number; currency: string; createdAt: number }[]; oauthConfigured: boolean; expectedAccount: string; connected: boolean; account: { code: string; name: string } | null; tests: Test[]; events: Event[] };
const endpoint = "/api/payments/donationalerts";

export default function Payments() {
  const lang = useLanguage(); const ru = lang === "ru";
  const resource = useLiveResource<State>(endpoint, 30000, false, "/dashboard");
  const [amount, setAmount] = useState("500");
  const [orderId, setOrderId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [callbackStatus, setCallbackStatus] = useState<string | null>(null);
  const actionPending = useRef(false);
  const data = resource.data;
  const selected = data?.tests.find(test => test.id === selectedId) || data?.tests[0];
  const visibleEvents = data?.events.filter(event => !selected || event.testId === selected.id) || [];
  const labels: Record<string, string> = ru ? { matched: "Совпадение найдено", wrong_amount: "Сумма не совпала", wrong_currency: "Валюта не совпала", duplicate: "Повтор пропущен", expired: "Счёт просрочен", already_matched: "Совпадение уже найдено", order_changed: "Условия заказа изменились", unrelated: "Нет связанного теста" } : { matched: "Match found", wrong_amount: "Amount mismatch", wrong_currency: "Currency mismatch", duplicate: "Duplicate ignored", expired: "Test expired", already_matched: "Already matched", order_changed: "Order terms changed", unrelated: "No matching test" };

  async function run(action: string, extra: Record<string, unknown> = {}) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      const response = await api<{ test?: Test; url?: string; result?: string; results?: Record<string, number> }>(endpoint, { method: "POST", signal: AbortSignal.timeout(45000), body: JSON.stringify({ action, ...extra }) });
      if (response.url) { window.location.assign(response.url); return; }
      if (response.test) setSelectedId(response.test.id);
      if (response.result) setFeedback(labels[response.result] || response.result);
      if (response.results) setFeedback(Object.entries(response.results).map(([key, count]) => `${labels[key] || key}: ${count}`).join(" · ") || (ru ? "Новых совпадений нет." : "No new matches."));
      await resource.reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { actionPending.current = false; setBusy(false); }
  }

  const runRef = useRef(run);
  useEffect(() => { runRef.current = run; });
  useEffect(() => {
    if (!auto || !data?.connected || !data.enabled) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !actionPending.current) void runRef.current("sync"); }, 30000);
    return () => clearInterval(timer);
  }, [auto, data?.connected, data?.enabled]);
  useEffect(() => {
    const timer = setTimeout(() => setCallbackStatus(new URLSearchParams(window.location.search).get("connection")), 0);
    return () => clearTimeout(timer);
  }, []);

  async function copyReference() {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected.reference); setFeedback(ru ? "Код тестового счёта скопирован." : "Test reference copied."); }
    catch { setError(ru ? "Не удалось скопировать. Выделите код и скопируйте вручную." : "Copy failed. Select the reference and copy it manually."); }
  }

  return <AccountShell workspace><div className="workspace-heading"><div><span className="kicker">ADMIN / PAYMENTS</span><h1>{ru ? "Оплата заказов" : "Order payments"}</h1><p>{ru ? "DonationAlerts · подключение и сопоставление поступлений" : "DonationAlerts · connection and receipt matching"}</p></div></div>
    <WorkspaceNav active="payments" ru={ru}/>
    {(resource.error || error) && <p className="error" role="alert">{error || resource.error}</p>}
    {feedback && <p className="saved-feedback" role="status"><Check size={16}/>{feedback}</p>}
    {callbackStatus && <p className={callbackStatus === "connected" ? "saved-feedback" : "error"}>{callbackStatus === "connected" ? (ru ? "Аккаунт DonationAlerts подключён для чтения уведомлений." : "DonationAlerts is connected for reading alerts.") : (ru ? "Подключение не завершено. Проверьте Client ID, секрет, callback-адрес и аккаунт, затем повторите подключение." : "Connection incomplete. Check credentials, callback URL and account, then reconnect.")}</p>}
    <div className="payment-test-notice"><CreditCard size={22}/><div><strong>{data?.mode === "orders" ? (ru ? "Оплата привязана к заказам" : "Payments linked to orders") : (ru ? "Тестовый режим или отключено" : "Test mode or disabled")}</strong><p>{data?.mode === "orders" ? (ru ? "Сервер сопоставляет уведомления раз в минуту. После совпадения проверьте поступление денег и подтвердите оплату в заказе. Симуляции отключены." : "The server matches alerts every minute. Verify receipt of funds and confirm payment in the order after a match. Simulations are disabled.") : (ru ? "Тестовые совпадения не меняют оплату заказов и доходы по промокодам. Для заказов используйте DONATIONALERTS_MODE=orders." : "Test matches never change order payment or promo earnings. Use DONATIONALERTS_MODE=orders for order payments.")}</p></div></div>
    {!data ? <p className="inspector-note">{ru ? "Загрузка…" : "Loading…"}</p> : <>
      <div className="payment-test-grid">
        <section className="account-panel"><div className="payment-panel-heading"><h2><Link2 size={18}/>DonationAlerts</h2><span className={`payment-mode ${data.enabled ? "enabled" : ""}`}>{data.mode.toUpperCase()}</span></div>
          <dl className="summary-list"><div><dt>{ru ? "Ожидаемый аккаунт" : "Expected account"}</dt><dd>{data.expectedAccount || "—"}</dd></div><div><dt>{ru ? "Подключение API" : "API connection"}</dt><dd>{data.connected ? data.account?.name : (ru ? "Не подключено" : "Not connected")}</dd></div><div><dt>OAuth</dt><dd>{data.oauthConfigured ? (ru ? "Настройки заполнены" : "Configured") : (ru ? "Нужны Client ID и Secret" : "Client ID and Secret needed")}</dd></div></dl>
          <p className="inspector-note">{data.enabled ? (ru ? "Подключение API запрашивает только чтение профиля и донатов." : "API connection requests only profile and donation read access.") : (ru ? "Включите DONATIONALERTS_MODE=orders в настройках сервера и перезапустите сайт." : "Set DONATIONALERTS_MODE=orders on the server and restart the site.")}</p>
          <div className="payment-buttons">{data.connected ? <><button type="button" className="compact-primary" disabled={busy || !data.enabled} onClick={() => run("sync")}><RefreshCw size={15}/>{ru ? "Проверить API" : "Check API"}</button><button type="button" className="secondary-action" disabled={busy || !data.enabled} onClick={() => { setAuto(false); void run("disconnect"); }}><Unplug size={15}/>{ru ? "Отключить" : "Disconnect"}</button></> : <button type="button" className="compact-primary" disabled={busy || !data.enabled || !data.oauthConfigured} onClick={() => run("connect")}><Link2 size={15}/>{ru ? "Подключить аккаунт" : "Connect account"}</button>}</div>
          {data.connected && <label className="trust-check"><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)}/><span>{ru ? "Проверять API каждые 30 секунд, пока раздел открыт" : "Check API every 30 seconds while this page is open"}</span></label>}
        </section>
        {data.mode === "test" && <section className="account-panel"><h2><CreditCard size={18}/>{ru ? "Новый тестовый счёт" : "New test invoice"}</h2><form className="order-editor" onSubmit={event => { event.preventDefault(); void run("create", { amount: Math.round(Number(amount) * 100), orderId: orderId.trim() || undefined }); }}>
          <label>{ru ? "ID заказа — необязательно" : "Order ID — optional"}<input value={orderId} maxLength={64} onChange={event => setOrderId(event.target.value)} placeholder={ru ? "Полный ID из адреса заказа" : "Full ID from the order URL"}/></label><p className="inspector-note">{ru ? "Для принятого неоплаченного заказа сумма берётся с сервера. Это проверка на копии условий." : "For an accepted unpaid order, the server supplies the amount. This tests a snapshot of its terms."}</p>
          <label>{ru ? "Тестовая сумма, ₽" : "Test amount, RUB"}<input type="number" min="1" max="100000000" step="0.01" value={amount} required={!orderId.trim()} disabled={Boolean(orderId.trim())} onChange={event => setAmount(event.target.value)}/></label>
          <button type="submit" className="compact-primary" disabled={busy || !data.enabled}>{ru ? "Создать тестовый счёт" : "Create test invoice"}</button>
        </form></section>}
      {data.mode === "orders" && <section className="account-panel"><h2>{ru ? "Последние оплаты" : "Recent payments"}</h2><div className="payment-event-list">{data.payments.length ? data.payments.map(payment => <a className="payment-event" href={`/orders/${payment.orderId}`} key={payment.id}><span>#{payment.orderId.slice(0,8).toUpperCase()}</span><strong>{money(payment.amount,lang,payment.currency)}</strong><span className={payment.status === "review" ? "payment-result matched" : "payment-result"}>{({pending:ru?"Ждём перевод":"Awaiting transfer",review:ru?"Проверить поступление":"Verify receipt",confirmed:ru?"Подтверждено":"Confirmed",void:ru?"Закрыто":"Closed"} as Record<string,string>)[payment.status]}</span></a>) : <p className="inspector-note">{ru ? "Счёт появится, когда клиент откроет оплату принятого заказа." : "An invoice appears when the client opens payment for an accepted order."}</p>}</div></section>}
      </div>
      {data.mode === "test" && <><section className="account-panel payment-simulator"><div className="payment-panel-heading"><h2><FlaskConical size={18}/>{ru ? "Проверка уведомления" : "Alert simulation"}</h2><span className="inspector-note">{ru ? "Срок счёта — 1 час" : "Invoice lifetime: 1 hour"}</span></div>
        {data.tests.length ? <><label className="payment-selector">{ru ? "Тестовый счёт" : "Test invoice"}<select value={selected?.id || ""} onChange={event => { setSelectedId(event.target.value); setFeedback(""); }}>{data.tests.map(test => <option key={test.id} value={test.id}>{test.id.slice(0, 8)} · {money(test.amount, lang, test.currency)} · {test.status === "matched" ? (ru ? "совпадение" : "matched") : (ru ? "ожидание" : "pending")}</option>)}</select></label>
          {selected && <><div className="payment-reference"><div><small>{ru ? "Точный текст для сопоставления" : "Exact matching reference"}</small><code>{selected.reference}</code></div><button type="button" className="secondary-action" onClick={copyReference}>{ru ? "Копировать" : "Copy"}</button></div>
          <div className="payment-test-state"><strong>{money(selected.amount, lang, selected.currency)}</strong><span>{selected.status === "matched" ? labels.matched : (ru ? "Ожидает тестового уведомления" : "Awaiting a test alert")}</span><small>{ru ? "До" : "Until"} {new Date(selected.expiresAt).toLocaleString(ru ? "ru-RU" : "en-US")}</small></div>
          <div className="payment-scenarios">{([ ["match", ru ? "Верная сумма" : "Correct amount"], ["wrong_amount", ru ? "Сумма меньше на 1 коп." : "One kopek short"], ["wrong_currency", ru ? "Другая валюта" : "Wrong currency"], ["duplicate", ru ? "Повтор уведомления" : "Replay alert"], ["expired", ru ? "Просроченный счёт" : "Expired invoice"] ] as const).map(([scenario, label]) => <button type="button" className="secondary-action" disabled={busy || !data.enabled} key={scenario} onClick={() => run("simulate", { id: selected.id, scenario })}>{label}</button>)}</div></>}
        </> : <p className="inspector-note">{ru ? "Создайте счёт, чтобы проверить успешное сопоставление, неверную сумму, другую валюту и повтор уведомления." : "Create an invoice to test matching, incorrect amounts, currencies and replayed alerts."}</p>}
      </section>
      <section className="account-panel"><h2>{ru ? "История проверки" : "Test history"}</h2><div className="payment-event-list">{visibleEvents.length ? visibleEvents.map(event => <div className="payment-event" key={event.id}><span className={event.result === "matched" ? "payment-result matched" : "payment-result"}>{labels[event.result] || event.result}</span><span>{money(event.amount, lang, event.currency)}</span><small>{event.source === "simulation" ? (ru ? "Имитация" : "Simulation") : "API"} · {new Date(event.createdAt).toLocaleTimeString(ru ? "ru-RU" : "en-US")}</small></div>) : <p className="inspector-note">{ru ? "Уведомлений пока нет." : "No alerts yet."}</p>}</div></section>
      </>}
    </>}
  </AccountShell>;
}
