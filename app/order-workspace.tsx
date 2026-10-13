"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown, ClipboardList, MessagesSquare } from "lucide-react";
import { AccountShell, api, statusLabels, useLanguage } from "./account-ui";
import { ConversationPanel } from "./conversation-panel";
import { useLiveResource } from "./use-live-resource";
import { OrderActions, OrderHistory, OrderTimer, SecureOrderAccess, type AccessInfo, type Order, type OrderEvent } from "./order-controls";
import { OrderPayment, type PaymentInfo } from "./order-payment";
import { OrderReviewPanel } from "./order-review";
import type { OrderReview } from "@/lib/reviews";
import { money } from "@/lib/pricing.mjs";
import type { ChatMessage, ChatPage } from "./chat-history";

type Detail = ChatPage & { order: Order; access: AccessInfo; payment: PaymentInfo; review: OrderReview | null; events: OrderEvent[]; currentUserId: string; role: "client" | "admin" };

export default function OrderWorkspace({ id, embedded = false, onActivity }: { id: string; embedded?: boolean; onActivity?: () => void }) {
  const lang = useLanguage();
  const ru = lang === "ru";
  const endpoint = `/api/orders/${id}`;
  const [selectedPane, setSelectedPane] = useState<"order" | "chat" | null>(null);
  const [compact, setCompact] = useState<boolean | null>(null);
  const [readChat, setReadChat] = useState(false);
  const resource = useLiveResource<Detail>(endpoint, 5000, true, undefined, { markRead: readChat });
  const { data, reload, update } = resource;
  const order = data?.order;
  const hasData = Boolean(data);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [error, setError] = useState("");
  const pane = selectedPane ?? (data?.role === "client" && ["quoted", "awaiting_payment", "awaiting_access", "completed"].includes(order?.status || "") ? "order" : "chat");
  const tabs = useRef<HTMLElement>(null);
  const panelId = useId();
  useEffect(() => {
    const media = window.matchMedia(embedded ? "(max-width: 1200px)" : "(max-width: 760px)");
    const resize = () => setCompact(media.matches);
    const timer = setTimeout(resize, 0);
    media.addEventListener("change", resize);
    return () => { clearTimeout(timer); media.removeEventListener("change", resize); };
  }, [embedded]);
  useEffect(() => {
    const timer = setTimeout(() => setReadChat(hasData && (compact === false || (compact === true && pane === "chat"))), 0);
    return () => clearTimeout(timer);
  }, [compact, pane, hasData]);
  function selectPane(value: "order" | "chat") {
    setSelectedPane(value);
    if (compact) requestAnimationFrame(() => tabs.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }));
  }
  const total = order?.totalAmount ?? (order?.quotedPrice === null || !order ? null : order.quotedPrice * 100);
  const currency = order?.quotedCurrency || (order?.pricingVersion ? "RUB" : "KZT");
  async function run(action: string, values: Record<string, unknown> = {}) {
    if (actionPending.current || !order) return false;
    actionPending.current = true;
    setBusy(true); setError("");
    try {
      await api(endpoint, { method: "PATCH", signal: AbortSignal.timeout(15000), body: JSON.stringify({ action, updatedAt: order.updatedAt, ...values }) });
      await reload(); onActivity?.(); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); void reload(); return false; }
    finally { actionPending.current = false; setBusy(false); }
  }
  function sent(message?: ChatMessage) { if (message) update(value => ({ ...value, messages: [...value.messages.filter(item => item.id !== message.id), message] })); void reload(); onActivity?.(); }
  const Heading = embedded ? "h2" : "h1";
  const content = <div className={`order-workspace ${embedded ? "embedded " : ""}pane-${pane}`}>
    <header className="order-workspace-heading"><div><span className="kicker">{ru ? "ЗАКАЗ" : "ORDER"} / #{id.slice(0, 8).toUpperCase()}</span><Heading>{order ? `${order.platform.toUpperCase()} · ${order.service === "rating" ? (ru ? "Буст рейтинга" : "Rating boost") : (ru ? "Калибровка" : "Calibration")}` : resource.error ? (ru ? "Заказ недоступен" : "Order unavailable") : (ru ? "Загрузка заказа…" : "Loading order…")}</Heading><p>{order?.clientEmail}</p></div>{order && <div className="order-workspace-badges"><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang] || order.status}</span>{embedded && <a className="icon-button" href={`/orders/${id}`} aria-label={ru ? "Открыть полный заказ" : "Open full order"}><ArrowUpRight size={18}/></a>}</div>}</header>
    {(resource.error || error) && <p className="error" role="alert">{error || resource.error}</p>}
    {data && order && <><ol className="order-flow">{(ru ? ["Заявка","Принятие","Оплата","Данные","Выполнение"] : ["Request","Accepted","Payment","Details","Delivery"]).map((label,index)=>{const stage=order.status === "completed" ? 5 : order.status === "in_progress" || order.startedAt ? 4 : order.paidAt ? 3 : order.status === "awaiting_payment" ? 2 : order.status === "quoted" ? 1 : 0;return <li key={label} aria-current={order.status !== "cancelled" && index === stage ? "step" : undefined} className={order.status === "cancelled" ? "" : index < stage ? "done" : index === stage ? "current" : ""}><span>{index+1}</span>{label}</li>})}</ol>
      <OrderNextStep order={order} access={data.access} payment={data.payment} admin={data.role === "admin"} ru={ru}/>
      {order.status === "completed" && data.role === "client" && <div className="completed-order-actions"><button className="secondary-action" type="button" onClick={() => { selectPane("order"); requestAnimationFrame(() => document.getElementById(`${panelId}-review`)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })); }}>{data.review ? (ru ? "Посмотреть свой отзыв" : "View your review") : (ru ? "Оставить отзыв" : "Leave a review")}</button></div>}
      <nav className="order-pane-tabs" ref={tabs} aria-label={ru ? "Разделы заказа" : "Order sections"}>
        <button type="button" aria-pressed={pane === "chat"} aria-controls={`${panelId}-chat`} onClick={() => selectPane("chat")}><MessagesSquare size={17}/>{ru ? "Чат" : "Chat"}</button>
        <button type="button" aria-pressed={pane === "order"} aria-controls={`${panelId}-order`} onClick={() => selectPane("order")}><ClipboardList size={17}/>{data.role === "admin" ? (ru ? "Управление" : "Manage order") : (ru ? "Заказ и оплата" : "Order & payment")}</button>
      </nav>
      <div className="order-workspace-grid"><section className="order-inspector" id={`${panelId}-order`} aria-labelledby={`${panelId}-title`}><header className="order-inspector-heading"><h2 id={`${panelId}-title`}>{ru ? "Условия и действия" : "Terms and actions"}</h2><ClipboardList size={17}/></header><div className="inspector-body"><div className="rating-summary"><span>{order.service === "rating" ? (ru ? "Рейтинг" : "Rating") : (ru ? "Услуга" : "Service")}</span>{order.service === "rating" ? <strong>{order.currentRating?.toLocaleString()}<ArrowRight size={18}/>{order.targetRating?.toLocaleString()}</strong> : <strong>{ru ? "Калибровка" : "Calibration"}</strong>}<small>{order.method === "duo" ? (ru ? "Игра вместе" : "Duo play") : (ru ? "На аккаунте" : "Piloted play")}</small></div>
      {data.role === "admin" && <><div className="admin-order-summary"><strong>{total === null ? (ru ? "На согласовании" : "Pending agreement") : money(total,lang,currency)}</strong><span>{order.durationDays ? `${order.durationDays} ${ru ? "дн." : "days"}` : "—"}</span></div>{order.startedAt && <OrderTimer order={order} ru={ru}/>}<OrderPayment key={`payment-${order.id}`} order={order} payment={data.payment} admin={data.role === "admin"} ru={ru} busy={busy} run={run} reload={()=>{void reload();onActivity?.();}}/><OrderActions key={`actions-${order.id}`} order={order} admin={true} ru={ru} busy={busy} error={error} run={run}/><SecureOrderAccess key={`access-${order.id}`} order={order} admin={true} info={data.access} ru={ru} onSaved={()=>{void reload();onActivity?.();}}/></>}
      <details className="inspector-breakdown" open={data.role !== "admin" && compact === false}><summary>{ru ? "Расчёт и условия" : "Price and terms"}<ChevronDown size={15}/></summary><dl className="compact-terms">
        {order.baseAmount !== null && <div><dt>{ru ? "Базовая стоимость" : "Base price"}</dt><dd>{money(order.baseAmount,lang,currency)}</dd></div>}
        {order.redTrust && <div><dt>{ru ? "Красный траст · +10%" : "Red trust · +10%"}</dt><dd>{money(order.surchargeAmount,lang,currency)}</dd></div>}
        {order.baseAmount !== null && total !== null && total + order.discountAmount !== order.baseAmount + order.surchargeAmount && <div><dt>{ru ? "Согласованная поправка" : "Agreed adjustment"}</dt><dd>{money(total + order.discountAmount - order.baseAmount - order.surchargeAmount,lang,currency)}</dd></div>}
        {order.promoCode && <div className="price-discount"><dt>{order.promoCode} · −20%</dt><dd>−{money(order.discountAmount,lang,currency)}</dd></div>}
        <div className="order-total"><dt>{ru ? "Итого" : "Total"}</dt><dd>{total === null ? (ru ? "На согласовании" : "Pending agreement") : money(total,lang,currency)}</dd></div>
        <div><dt>{ru ? "Дней на выполнение" : "Delivery days"}</dt><dd>{order.durationDays ?? "—"}</dd></div>
        {!order.pricingVersion && order.deadline && <div><dt>{ru ? "Прежний срок" : "Previous deadline"}</dt><dd>{order.deadline}</dd></div>}
        {order.initialTotalAmount !== null && order.initialTotalAmount !== total && <div><dt>{ru ? "При оформлении" : "When submitted"}</dt><dd>{money(order.initialTotalAmount,lang,currency)}</dd></div>}
        {data.role === "admin" && order.promoCode && <div><dt>{ru ? "Доля владельца промокода" : "Promo owner's share"}</dt><dd>{money(order.commissionAmount,lang,currency)}</dd></div>}
      </dl></details>
      {!order.pricingVersion && <p className="inspector-note">{ru ? "Заказ оформлен по прежним условиям. Исторические цена и валюта сохранены." : "This order uses earlier terms. Its historical price and currency are preserved."}</p>}
      {data.role !== "admin" && <OrderTimer order={order} ru={ru}/>}
      {data.role !== "admin" && <><OrderPayment key={`payment-${order.id}`} order={order} payment={data.payment} admin={false} ru={ru} busy={busy} run={run} reload={()=>{void reload();onActivity?.();}}/><OrderActions key={`actions-${order.id}`} order={order} admin={false} ru={ru} busy={busy} error={error} run={run}/></>}
      {data.role !== "admin" && <SecureOrderAccess key={`access-${order.id}`} order={order} admin={false} info={data.access} ru={ru} onSaved={()=>{void reload();onActivity?.();}}/>}
      <OrderReviewPanel key={`review-${order.id}`} id={`${panelId}-review`} order={order} review={data.review} admin={data.role === "admin"} ru={ru} onSaved={review => { update(value => ({ ...value, review })); void reload(); }}/>
      <OrderHistory events={data.events} order={order} ru={ru}/>
    </div></section><div className="order-chat-pane" id={`${panelId}-chat`}><ConversationPanel endpoint={endpoint} page={data} currentUserId={data.currentUserId} role={data.role} lang={lang} onSent={sent} onRefresh={reload} offline={Boolean(resource.error)} refreshing={resource.loading}/></div></div></>}
  </div>;
  return embedded ? content : <AccountShell workspace back="/dashboard" backLabel={ru ? "Все заказы" : "All orders"}>{content}</AccountShell>;
}

function OrderNextStep({ order, access, payment, admin, ru }: { order: Order; access: AccessInfo; payment: PaymentInfo; admin: boolean; ru: boolean }) {
  let title = "", description = "";
  if (order.status === "new") {
    title = admin ? (ru ? "Проверьте заявку" : "Review the request") : (ru ? "Заявка отправлена" : "Request submitted");
    description = admin ? (ru ? "Откройте управление, чтобы принять заявку или предложить условия." : "Open Manage order to accept the request or propose terms.") : (ru ? "Администратор проверит возможность выполнения. Пока оплачивать ничего не нужно." : "The admin will review availability. No payment is needed yet.");
  } else if (order.status === "quoted") {
    title = ru ? "Условия на согласовании" : "Terms awaiting agreement";
    description = admin ? (ru ? "Ждём подтверждения клиента." : "Waiting for the client to confirm.") : (ru ? "Откройте заказ и проверьте предложенную цену и срок перед подтверждением." : "Open Order & payment to review the proposed price and duration.");
  } else if (order.status === "awaiting_payment") {
    title = payment.intent?.status === "review" ? (ru ? "Платёж найден" : "Payment alert found") : payment.issue ? (ru ? "Перевод требует уточнения" : "Transfer needs clarification") : (ru ? "Можно перейти к оплате" : "Ready for payment");
    description = payment.issue ? (ru ? "Сумма или валюта отличается от заказа. Обсудите перевод в чате; не оплачивайте повторно." : "The amount or currency differs from the order. Discuss the transfer in chat; do not pay again.") : payment.intent?.status === "review" ? (ru ? "Завершаем подтверждение оплаты. Повторно переводить деньги не нужно." : "Completing payment confirmation. Do not send another transfer.") : admin ? payment.autoConfirm ? (ru ? "Сайт автоматически подтвердит оплату при совпадении кода, суммы и валюты." : "Payment is confirmed automatically when reference, amount and currency match.") : (ru ? "Уточните способ оплаты с клиентом." : "Agree on payment details with the client.") : (ru ? "Откройте «Заказ и оплата»: там сумма, код и проверка платежа." : "Open Order & payment for the amount, reference and payment check.");
  } else if (order.status === "awaiting_access") {
    title = access ? (ru ? "Данные на проверке" : "Details under review") : (ru ? "Оплата подтверждена" : "Payment confirmed");
    description = admin ? (ru ? "Проверьте данные клиента и подтвердите получение, чтобы начать выполнение." : "Review the client's details and confirm receipt to start delivery.") : access ? (ru ? "Администратор проверит переданные данные и запустит выполнение." : "The admin will review the submitted details and start delivery.") : order.method === "duo" ? (ru ? "Откройте заказ и передайте код дружбы Steam через отдельную форму." : "Open Order & payment to submit your Steam friend code.") : (ru ? "Откройте заказ и передайте данные Steam через защищённую форму, а не в чат." : "Open Order & payment to submit Steam details in the secure form, not the chat.");
  }
  if (order.status === "completed") {
    title = ru ? "Заказ завершён" : "Order completed";
    description = admin ? (ru ? "Заказ и переписка сохранены в истории. Клиент может оставить отзыв." : "The order and conversation remain in history. The client can leave a review.") : (ru ? "Заказ и чат остаются доступны. Оцените работу и поделитесь своим опытом." : "Your order and chat remain available. Rate the service and share your experience.");
  }
  return title ? <div className="order-next-step"><span><strong>{title}</strong><small>{description}</small></span></div> : null;
}
