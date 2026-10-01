"use client";

import { useState } from "react";
import { ArrowUpRight, Inbox, LogOut, Plus, RefreshCw, Search, X } from "lucide-react";
import { AccountShell, api, statusLabels, type User, useLanguage } from "../account-ui";
import { useDebounced, useLiveResource } from "../use-live-resource";
import { Pagination, WorkspaceNav } from "../workspace-ui";
import { money } from "@/lib/pricing.mjs";

type Order = { id: string; platform: string; service: string; method: string; currentRating: number | null; targetRating: number | null; status: string; createdAt: number; email: string; quotedPrice: number | null; quotedCurrency: string | null; totalAmount: number | null; durationDays: number | null; dueAt: number | null; promoCode: string | null; deadline: string | null; needsReply: number };
type Listing = { orders: Order[]; total: number; page: number; pages: number; summary: { total: number; fresh: number; active: number; waiting: number } };

export default function OrdersBoard() {
  const lang = useLanguage();
  const ru = lang === "ru";
  const auth = useLiveResource<{ user: User | null }>("/api/auth/me", 60000);
  const admin = auth.data?.user?.role === "admin";
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [reply, setReply] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const search = useDebounced(query);
  const params = new URLSearchParams({ page: String(page), q: search, status, platform, ...(reply ? { reply: "1" } : {}) });
  const list = useLiveResource<Listing>(`/api/orders?${params}`, 15000);
  const data = list.data;
  function filterStatus(value: string) { setStatus(value); setReply(false); setPage(1); }
  function reset() { setQuery(""); setStatus(""); setPlatform(""); setReply(false); setPage(1); }
  async function logout() { try { await api("/api/auth/logout", { method: "POST" }); window.location.assign(`/${lang}`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); } }
  return <AccountShell workspace>
    {admin && <WorkspaceNav active="orders" ru={ru}/>}
    <header className="board-heading"><div><span className="kicker">{admin ? "ADMIN / WORKSPACE" : "CS2 BOOST"}</span><h1>{admin ? (ru ? "Заказы" : "Orders") : (ru ? "Мои заказы" : "My orders")}</h1><p>{auth.data?.user?.email}</p></div><div className="board-actions"><button className="icon-button" onClick={list.reload} disabled={list.loading} aria-label={ru ? "Обновить заказы" : "Refresh orders"}><RefreshCw size={18}/></button>{!admin && <a className="compact-primary" href={`/${lang}#calculator`}><Plus size={16}/>{ru ? "Новый заказ" : "New order"}</a>}<button className="text-action" onClick={logout}><LogOut size={17}/>{ru ? "Выйти" : "Sign out"}</button></div></header>
    {admin && <div className="board-stats"><button onClick={reset}><span>{ru ? "Всего заказов" : "All orders"}</span><strong>{data?.summary.total ?? "—"}</strong><small>{ru ? "За всё время" : "All time"}</small></button><button onClick={() => filterStatus("new")}><span>{ru ? "Новые заявки" : "New requests"}</span><strong>{data?.summary.fresh ?? "—"}</strong><small>{ru ? "Ожидают принятия" : "Awaiting acceptance"}</small></button><button onClick={() => filterStatus("in_progress")}><span>{ru ? "В работе" : "In progress"}</span><strong>{data?.summary.active ?? "—"}</strong><small>{ru ? "Контроль выполнения" : "Track delivery"}</small></button><button className="attention-stat" onClick={() => { setReply(true); setStatus(""); setPage(1); }}><span>{ru ? "Ждут ответа" : "Awaiting reply"}</span><strong>{data?.summary.waiting ?? "—"}</strong><small>{ru ? "Последнее сообщение от клиента" : "Last message from client"}</small></button></div>}
    <section className="orders-board" aria-label={ru ? "Список заказов" : "Order list"}>
      <div className="board-toolbar"><label className="search-field"><Search size={17}/><input aria-label={ru ? "Поиск заказов" : "Search orders"} placeholder={ru ? "Email клиента или номер заказа" : "Client email or order ID"} value={query} maxLength={120} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label><select aria-label={ru ? "Статус заказа" : "Order status"} value={status} onChange={event => filterStatus(event.target.value)}><option value="">{ru ? "Все статусы" : "All statuses"}</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label[lang]}</option>)}</select><select aria-label={ru ? "Площадка" : "Platform"} value={platform} onChange={event => { setPlatform(event.target.value); setPage(1); }}><option value="">{ru ? "Все площадки" : "All platforms"}</option><option value="premier">Premier</option><option value="faceit">FACEIT</option></select>{admin && <button className={reply ? "filter-chip active" : "filter-chip"} aria-pressed={reply} onClick={() => { setReply(!reply); setPage(1); }}>{ru ? "Ждут ответа" : "Awaiting reply"}</button>}{(query || status || platform || reply) && <button className="icon-button" onClick={reset} aria-label={ru ? "Сбросить фильтры" : "Reset filters"}><X size={17}/></button>}</div>
      {(error || list.error) && <p className="error board-error" role="alert">{error || list.error}</p>}
      {!data ? <div className="list-placeholder">{list.error ? (ru ? "Не удалось загрузить заказы. Повторите попытку." : "Unable to load orders. Try again.") : (ru ? "Загружаем заказы…" : "Loading orders…")}</div> : data.orders.length === 0 ? <div className="list-placeholder"><Inbox size={32}/><h2>{ru ? "Заказы не найдены" : "No orders found"}</h2><p>{query || status || platform || reply ? (ru ? "Попробуйте изменить фильтры." : "Try different filters.") : (ru ? "Новые заявки появятся здесь." : "New requests will appear here.")}</p></div> : <div className="orders-table-scroll"><table className="orders-table"><thead><tr><th>{ru ? "Заказ / клиент" : "Order / client"}</th><th>{ru ? "Услуга / цель" : "Service / goal"}</th><th>{ru ? "Статус" : "Status"}</th><th>{ru ? "Стоимость" : "Price"}</th><th>{ru ? "Срок" : "Deadline"}</th><th><span className="sr-only">{ru ? "Открыть" : "Open"}</span></th></tr></thead><tbody>{data.orders.map(order => <tr key={order.id}><td><a className="order-id-link" href={`/orders/${order.id}`}>#{order.id.slice(0, 8).toUpperCase()}</a><small title={order.email}>{order.email}</small></td><td><strong className="platform-label">{order.platform.toUpperCase()}</strong><small>{order.service === "rating" ? `${order.currentRating?.toLocaleString()} → ${order.targetRating?.toLocaleString()}` : (ru ? "Калибровка" : "Calibration")} · {order.method === "duo" ? "Duo" : "Piloted"}</small></td><td><span className={`status status-${order.status}`}>{statusLabels[order.status]?.[lang] || order.status}</span>{admin && Boolean(order.needsReply) && <a className="reply-label" href={`/inbox?order=${order.id}`}>{ru ? "Ждёт ответа" : "Awaiting reply"}</a>}</td><td>{order.totalAmount !== null ? money(order.totalAmount,lang,order.quotedCurrency || "RUB") : order.quotedPrice !== null ? money(order.quotedPrice * 100,lang,order.quotedCurrency || "KZT") : "—"}{order.promoCode && <small>{order.promoCode} · −20%</small>}</td><td>{order.dueAt ? new Date(order.dueAt).toLocaleDateString(ru ? "ru-RU" : "en-US") : order.durationDays ? `${order.durationDays} ${ru ? "дн. после старта" : "days after start"}` : order.deadline || "—"}<small>{ru ? "Создан" : "Created"} {new Date(order.createdAt).toLocaleDateString(ru ? "ru-RU" : "en-US")}</small></td><td><a className="icon-button" href={`/orders/${order.id}`} aria-label={`${ru ? "Открыть заказ" : "Open order"} ${order.id.slice(0, 8)}`}><ArrowUpRight size={18}/></a></td></tr>)}</tbody></table></div>}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} busy={list.loading} onPage={setPage} ru={ru}/>}
    </section>
    {!admin && <a className="client-support-link" href="/support">{ru ? "Нужна помощь? Написать в поддержку" : "Need help? Contact support"} →</a>}
  </AccountShell>;
}
