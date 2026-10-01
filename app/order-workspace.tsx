"use client";

import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Save } from "lucide-react";
import { AccountShell, api, statusLabels, useLanguage } from "./account-ui";
import { ConversationPanel } from "./conversation-panel";
import { useLiveResource } from "./use-live-resource";
import type { ChatMessage, ChatPage } from "./chat-history";

type Order = { id: string; clientEmail: string; platform: string; service: string; method: string; currentRating: number | null; targetRating: number | null; status: string; quotedPrice: number | null; deadline: string | null; updatedAt: number };
type Detail = ChatPage & { order: Order; currentUserId: string; role: "client" | "admin" };
type Draft = { price: string; deadline: string; status: string; version: number };

export default function OrderWorkspace({ id, embedded = false, onActivity }: { id: string; embedded?: boolean; onActivity?: () => void }) {
  const lang = useLanguage();
  const ru = lang === "ru";
  const endpoint = `/api/orders/${id}`;
  const resource = useLiveResource<Detail>(endpoint, 5000, true);
  const { data, reload, update } = resource;
  const order = data?.order;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const form = draft || { price: order?.quotedPrice?.toString() || "", deadline: order?.deadline || "", status: order?.status || "new", version: order?.updatedAt || 0 };
  const conflict = Boolean(draft && order && draft.version !== order.updatedAt);
  function edit(value: Partial<Draft>) { setDraft({ ...form, ...value }); setSaved(false); }
  async function save(accept = false) {
    if (busy || !order) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      await api(endpoint, { method: "PATCH", body: JSON.stringify(accept ? { action: "accept", updatedAt: order.updatedAt } : { status: form.status, quotedPrice: form.price, deadline: form.deadline, updatedAt: form.version }) });
      setDraft(null); setSaved(true); await reload(); onActivity?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); void reload(); }
    finally { setBusy(false); }
  }
  function sent(message?: ChatMessage) { if (message) update(value => ({ ...value, messages: [...value.messages.filter(item => item.id !== message.id), message] })); void reload(); onActivity?.(); }
  const content = <div className={embedded ? "order-workspace embedded" : "order-workspace"}>
    <header className="order-workspace-heading"><div><span className="kicker">{ru ? "ЗАКАЗ" : "ORDER"} / #{id.slice(0, 8).toUpperCase()}</span><h1>{order ? `${order.platform.toUpperCase()} · ${order.service === "rating" ? (ru ? "Буст рейтинга" : "Rating boost") : (ru ? "Калибровка" : "Calibration")}` : (ru ? "Загрузка заказа…" : "Loading order…")}</h1><p>{order?.clientEmail}</p></div>{order && <div className="order-workspace-badges"><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang] || order.status}</span>{embedded && <a className="icon-button" href={`/orders/${id}`} aria-label={ru ? "Открыть полный заказ" : "Open full order"}><ArrowUpRight size={18}/></a>}</div>}</header>
    {(resource.error || error) && <p className="error" role="alert">{error || resource.error}</p>}
    {data && order && <div className="order-workspace-grid"><details className="order-inspector" open><summary>{ru ? "Условия и управление" : "Terms and management"}<ChevronDown size={17}/></summary><div className="inspector-body"><div className="rating-summary"><span>{order.service === "rating" ? (ru ? "Рейтинг" : "Rating") : (ru ? "Услуга" : "Service")}</span>{order.service === "rating" ? <strong>{order.currentRating?.toLocaleString()}<ArrowRight size={18}/>{order.targetRating?.toLocaleString()}</strong> : <strong>{ru ? "Калибровка" : "Calibration"}</strong>}<small>{order.method === "duo" ? (ru ? "Игра вместе" : "Duo play") : (ru ? "На аккаунте" : "Piloted play")}</small></div>
      <dl className="compact-terms"><div><dt>{ru ? "Стоимость" : "Price"}</dt><dd>{order.quotedPrice === null ? (ru ? "Ожидает расчёта" : "Pending quote") : `${order.quotedPrice.toLocaleString(ru ? "ru-RU" : "en-US")} ₸`}</dd></div><div><dt>{ru ? "Срок" : "Deadline"}</dt><dd>{order.deadline || "—"}</dd></div></dl>
      {data.role === "admin" ? <form className="order-editor" onSubmit={event => { event.preventDefault(); void save(); }}><h2>{ru ? "Управление заказом" : "Manage order"}</h2><label htmlFor="order-status">{ru ? "Статус" : "Status"}</label><select id="order-status" value={form.status} disabled={busy} onChange={event => edit({ status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label[lang]}</option>)}</select><div className="editor-fields"><div><label htmlFor="order-price">{ru ? "Цена, ₸" : "Price, KZT"}</label><input id="order-price" type="number" min="0" max="100000000" step="1" value={form.price} disabled={busy} onChange={event => edit({ price: event.target.value })}/></div><div><label htmlFor="order-deadline">{ru ? "Дата завершения" : "Completion date"}</label><input id="order-deadline" type="date" value={form.deadline} disabled={busy} onChange={event => edit({ deadline: event.target.value })}/></div></div>{conflict && <p className="error">{ru ? "Заказ изменён. Сбросьте черновик и проверьте новые условия." : "Order changed. Discard the draft and review the latest terms."}</p>}<button type="submit" className="compact-primary" disabled={busy || !draft || conflict}><Save size={16}/>{busy ? (ru ? "Сохраняем…" : "Saving…") : (ru ? "Сохранить" : "Save")}</button>{saved && <p className="saved-feedback" role="status"><Check size={14}/>{ru ? "Сохранено" : "Saved"}</p>}{draft && <button type="button" className="editor-discard" onClick={() => { setDraft(null); setError(""); }}>{ru ? "Сбросить изменения" : "Discard changes"}</button>}</form> : order.status === "quoted" ? <div className="accept-offer"><p>{ru ? "Проверьте стоимость и дату завершения перед подтверждением." : "Review the price and completion date before accepting."}</p><button className="compact-primary" disabled={busy} onClick={() => save(true)}>{ru ? "Принять предложение" : "Accept offer"}<ArrowRight size={16}/></button></div> : <p className="inspector-note">{ru ? "Все детали и изменения обсуждайте в чате этого заказа." : "Discuss details and changes in this order's chat."}</p>}
    </div></details><ConversationPanel endpoint={endpoint} page={data} currentUserId={data.currentUserId} role={data.role} lang={lang} onSent={sent} onRefresh={reload} offline={Boolean(resource.error)} refreshing={resource.loading}/></div>}
  </div>;
  return embedded ? content : <AccountShell workspace back="/dashboard" backLabel={ru ? "Все заказы" : "All orders"}>{content}</AccountShell>;
}
