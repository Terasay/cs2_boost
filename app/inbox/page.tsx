"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Headset, MessageCircle, RefreshCw } from "lucide-react";
import { ApiError, AccountShell, api, statusLabels, useLanguage } from "../account-ui";

type OrderChat = { id: string; email: string; platform: string; service: string; status: string; createdAt: number; lastMessage: string | null; lastActivity: number };
type SupportChat = { id: string; email: string; status: string; lastMessage: string | null; lastActivity: number };
type Inbox = { orderChats: OrderChat[]; supportChats: SupportChat[] };

export default function InboxPage() {
  const lang = useLanguage();
  const [data, setData] = useState<Inbox | null>(null);
  const [tab, setTab] = useState<"support" | "orders">("orders");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { setData(await api<Inbox>("/api/inbox")); setError(""); }
    catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { window.location.assign("/login"); return; }
      if(reason instanceof ApiError && reason.status === 403){window.location.assign("/dashboard");return;}
      setError(reason instanceof Error ? reason.message : "Error");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { const initial = setTimeout(load, 0); const timer = setInterval(load, 15000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [load]);
  const ru = lang === "ru";
  const items = tab === "support" ? data?.supportChats ?? [] : data?.orderChats ?? [];
  const filtered = items.filter(item => item.email.toLowerCase().includes(search.trim().toLowerCase()) || item.id.toLowerCase().includes(search.trim().toLowerCase()));
  return <AccountShell back="/dashboard" backLabel={ru ? "Заявки" : "Requests"}>
    <div className="dashboard-heading"><div className="account-intro"><span className="kicker">ADMIN / CS2 BOOST</span><h1>{ru ? "Входящие" : "Inbox"}</h1><p>{ru ? "Переписки по заказам и обращения в поддержку." : "Order conversations and support requests."}</p></div><button className="text-action inbox-refresh" onClick={load}><RefreshCw size={17}/>{ru ? "Обновить" : "Refresh"}</button></div>
    <div className="inbox-toolbar"><div className="inbox-tabs" role="tablist"><button role="tab" aria-selected={tab === "support"} className={tab === "support" ? "active" : ""} onClick={() => setTab("support")}><Headset size={17}/>{ru ? "Поддержка" : "Support"}<span>{data?.supportChats.length ?? 0}</span></button><button role="tab" aria-selected={tab === "orders"} className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}><MessageCircle size={17}/>{ru ? "Чаты заказов" : "Order chats"}<span>{data?.orderChats.length ?? 0}</span></button></div><input aria-label={ru ? "Поиск по email или номеру" : "Search email or ID"} placeholder={ru ? "Поиск по email или номеру" : "Search email or ID"} value={search} onChange={event => setSearch(event.target.value)}/></div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="muted">{ru ? "Загружаем входящие…" : "Loading inbox…"}</p> : error && !data ? null : filtered.length ? <div className="inbox-list">{filtered.map(item => <a className="inbox-row" key={item.id} href={tab === "support" ? `/support/${item.id}` : `/orders/${item.id}`}><div className="inbox-row-main"><div className="inbox-row-title"><strong>{item.email}</strong><span className={`status ${item.status === "open" ? "status-in_progress" : item.status === "closed" ? "status-completed" : `status-${item.status}`}`}>{tab === "support" ? (item.status === "open" ? (ru ? "Открыт" : "Open") : (ru ? "Закрыт" : "Closed")) : statusLabels[item.status]?.[lang] ?? item.status}</span></div><p>{item.lastMessage ?? (ru ? "Сообщений пока нет" : "No messages yet")}</p><small>{tab === "orders" ? `${(item as OrderChat).platform.toUpperCase()} · #${item.id.slice(0, 8).toUpperCase()}` : `#${item.id.slice(0, 8).toUpperCase()}`} · {new Date(item.lastActivity).toLocaleString(ru ? "ru-RU" : "en-US")}</small></div><ArrowRight size={20}/></a>)}</div> : <div className="empty-state"><h2>{search.trim() ? (ru ? "Ничего не найдено" : "No matches") : (ru ? "Пока пусто" : "Nothing here yet")}</h2><p>{search.trim() ? (ru ? "Попробуйте другой email или номер." : "Try another email or ID.") : (ru ? "Новые сообщения появятся здесь." : "New conversations will appear here.")}</p></div>}
  </AccountShell>;
}
