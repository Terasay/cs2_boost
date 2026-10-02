"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { AccountShell, api, statusLabels, useLanguage } from "./account-ui";
import { ConversationPanel } from "./conversation-panel";
import { useLiveResource } from "./use-live-resource";
import { OrderActions, OrderHistory, OrderTimer, SecureOrderAccess, type AccessInfo, type Order, type OrderEvent } from "./order-controls";
import { money } from "@/lib/pricing.mjs";
import type { ChatMessage, ChatPage } from "./chat-history";

type Detail = ChatPage & { order: Order; access: AccessInfo; events: OrderEvent[]; currentUserId: string; role: "client" | "admin" };

export default function OrderWorkspace({ id, embedded = false, onActivity }: { id: string; embedded?: boolean; onActivity?: () => void }) {
  const lang = useLanguage();
  const ru = lang === "ru";
  const endpoint = `/api/orders/${id}`;
  const resource = useLiveResource<Detail>(endpoint, 5000, true);
  const { data, reload, update } = resource;
  const order = data?.order;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setInspectorOpen(!window.matchMedia("(max-width: 760px)").matches), 0);
    return () => clearTimeout(timer);
  }, []);
  const total = order?.totalAmount ?? (order?.quotedPrice === null || !order ? null : order.quotedPrice * 100);
  const currency = order?.quotedCurrency || (order?.pricingVersion ? "RUB" : "KZT");
  async function run(action: string, values: Record<string, unknown> = {}) {
    if (busy || !order) return false;
    setBusy(true); setError("");
    try {
      await api(endpoint, { method: "PATCH", body: JSON.stringify({ action, updatedAt: order.updatedAt, ...values }) });
      await reload(); onActivity?.(); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); void reload(); return false; }
    finally { setBusy(false); }
  }
  function sent(message?: ChatMessage) { if (message) update(value => ({ ...value, messages: [...value.messages.filter(item => item.id !== message.id), message] })); void reload(); onActivity?.(); }
  const content = <div className={embedded ? "order-workspace embedded" : "order-workspace"}>
    <header className="order-workspace-heading"><div><span className="kicker">{ru ? "ЗАКАЗ" : "ORDER"} / #{id.slice(0, 8).toUpperCase()}</span><h1>{order ? `${order.platform.toUpperCase()} · ${order.service === "rating" ? (ru ? "Буст рейтинга" : "Rating boost") : (ru ? "Калибровка" : "Calibration")}` : resource.error ? (ru ? "Заказ недоступен" : "Order unavailable") : (ru ? "Загрузка заказа…" : "Loading order…")}</h1><p>{order?.clientEmail}</p></div>{order && <div className="order-workspace-badges"><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang] || order.status}</span>{embedded && <a className="icon-button" href={`/orders/${id}`} aria-label={ru ? "Открыть полный заказ" : "Open full order"}><ArrowUpRight size={18}/></a>}</div>}</header>
    {(resource.error || error) && <p className="error" role="alert">{error || resource.error}</p>}
    {data && order && <><ol className="order-flow">{(ru ? ["Заявка","Принятие","Оплата","Данные","Выполнение"] : ["Request","Accepted","Payment","Details","Delivery"]).map((label,index)=>{const stage=order.status === "completed" ? 5 : order.status === "in_progress" || order.startedAt ? 4 : order.paidAt ? 3 : order.status === "awaiting_payment" ? 2 : order.status === "quoted" ? 1 : 0;return <li key={label} className={order.status === "cancelled" ? "" : index <= stage ? "done" : ""}><span>{index+1}</span>{label}</li>})}</ol><div className="order-workspace-grid"><details className="order-inspector" open={inspectorOpen} onToggle={event=>setInspectorOpen(event.currentTarget.open)}><summary><span>{ru ? "Условия и управление" : "Terms and management"}{!inspectorOpen && <small className="inspector-price">{total === null ? (ru ? "На согласовании" : "Pending agreement") : money(total,lang,currency)}</small>}</span><ChevronDown size={17}/></summary><div className="inspector-body"><div className="rating-summary"><span>{order.service === "rating" ? (ru ? "Рейтинг" : "Rating") : (ru ? "Услуга" : "Service")}</span>{order.service === "rating" ? <strong>{order.currentRating?.toLocaleString()}<ArrowRight size={18}/>{order.targetRating?.toLocaleString()}</strong> : <strong>{ru ? "Калибровка" : "Calibration"}</strong>}<small>{order.method === "duo" ? (ru ? "Игра вместе" : "Duo play") : (ru ? "На аккаунте" : "Piloted play")}</small></div>
      <dl className="compact-terms">
        {order.baseAmount !== null && <div><dt>{ru ? "Базовая стоимость" : "Base price"}</dt><dd>{money(order.baseAmount,lang,currency)}</dd></div>}
        {order.redTrust && <div><dt>{ru ? "Красный траст · +10%" : "Red trust · +10%"}</dt><dd>{money(order.surchargeAmount,lang,currency)}</dd></div>}
        {order.baseAmount !== null && total !== null && total + order.discountAmount !== order.baseAmount + order.surchargeAmount && <div><dt>{ru ? "Согласованная поправка" : "Agreed adjustment"}</dt><dd>{money(total + order.discountAmount - order.baseAmount - order.surchargeAmount,lang,currency)}</dd></div>}
        {order.promoCode && <div className="price-discount"><dt>{order.promoCode} · −20%</dt><dd>−{money(order.discountAmount,lang,currency)}</dd></div>}
        <div className="order-total"><dt>{ru ? "Итого" : "Total"}</dt><dd>{total === null ? (ru ? "На согласовании" : "Pending agreement") : money(total,lang,currency)}</dd></div>
        <div><dt>{ru ? "Дней на выполнение" : "Delivery days"}</dt><dd>{order.durationDays ?? "—"}</dd></div>
        {!order.pricingVersion && order.deadline && <div><dt>{ru ? "Прежний срок" : "Previous deadline"}</dt><dd>{order.deadline}</dd></div>}
        {order.initialTotalAmount !== null && order.initialTotalAmount !== total && <div><dt>{ru ? "При оформлении" : "When submitted"}</dt><dd>{money(order.initialTotalAmount,lang,currency)}</dd></div>}
        {data.role === "admin" && order.promoCode && <div><dt>{ru ? "Доля владельца промокода" : "Promo owner's share"}</dt><dd>{money(order.commissionAmount,lang,currency)}</dd></div>}
      </dl>
      {!order.pricingVersion && <p className="inspector-note">{ru ? "Заказ оформлен по прежним условиям. Исторические цена и валюта сохранены." : "This order uses earlier terms. Its historical price and currency are preserved."}</p>}
      <OrderTimer order={order} ru={ru}/>
      <OrderActions key={`actions-${order.id}`} order={order} admin={data.role === "admin"} ru={ru} busy={busy} run={run}/>
      <SecureOrderAccess key={`access-${order.id}`} order={order} admin={data.role === "admin"} info={data.access} ru={ru} onSaved={()=>{void reload();onActivity?.();}}/>
      <OrderHistory events={data.events} order={order} ru={ru}/>
    </div></details><ConversationPanel endpoint={endpoint} page={data} currentUserId={data.currentUserId} role={data.role} lang={lang} onSent={sent} onRefresh={reload} offline={Boolean(resource.error)} refreshing={resource.loading}/></div></>}
  </div>;
  return embedded ? content : <AccountShell workspace back="/dashboard" backLabel={ru ? "Все заказы" : "All orders"}>{content}</AccountShell>;
}
