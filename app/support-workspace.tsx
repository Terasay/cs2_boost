"use client";

import { useState } from "react";
import { ArrowUpRight, Headset } from "lucide-react";
import { AccountShell, api, useLanguage } from "./account-ui";
import { ConversationPanel } from "./conversation-panel";
import { useLiveResource } from "./use-live-resource";
import { WorkspaceNav } from "./workspace-ui";
import type { ChatMessage, ChatPage } from "./chat-history";

type Detail = ChatPage & { thread: { id: string; clientEmail?: string; status: "open" | "closed" } | null; currentUserId: string; role: "admin" | "client" };
export default function SupportWorkspace({ id, embedded = false, onActivity }: { id?: string; embedded?: boolean; onActivity?: () => void }) {
  const lang = useLanguage(); const ru = lang === "ru";
  const endpoint = id ? `/api/support/${id}` : "/api/support";
  const resource = useLiveResource<Detail>(endpoint, 5000, true, id ? undefined : "/inbox");
  const { data, reload, update } = resource;
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function changeStatus() {
    if (!data?.thread || busy) return;
    setBusy(true); setError("");
    try { await api(endpoint, { method: "PATCH", body: JSON.stringify({ status: data.thread.status === "open" ? "closed" : "open" }) }); await reload(); onActivity?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }
  function sent(message?: ChatMessage) { if (message) update(value => ({ ...value, messages: [...value.messages.filter(item => item.id !== message.id), message] })); void reload(); onActivity?.(); }
  const Heading = embedded ? "h2" : "h1";
  const content = <div className="support-workspace"><header className="order-workspace-heading"><div><span className="kicker">CS2 BOOST / SUPPORT</span><Heading>{ru ? "Поддержка" : "Support"}</Heading><p>{data?.thread?.clientEmail || (ru ? "Общие вопросы и помощь с аккаунтом" : "General questions and account help")}</p></div><div className="order-workspace-badges">{data?.thread && <span className={`status ${data.thread.status === "closed" ? "status-completed" : "status-new"}`}>{data.thread.status === "closed" ? (ru ? "Закрыто" : "Closed") : (ru ? "Открыто" : "Open")}</span>}{id && data?.role === "admin" && <button className="filter-chip" onClick={changeStatus} disabled={busy}>{data.thread?.status === "closed" ? (ru ? "Открыть" : "Reopen") : (ru ? "Закрыть обращение" : "Close ticket")}</button>}{embedded && <a className="icon-button" href={`/support/${id}`} aria-label={ru ? "Открыть обращение" : "Open ticket"}><ArrowUpRight size={18}/></a>}</div></header>{(error || resource.error) && <p className="error" role="alert">{error || resource.error}</p>}{data ? <ConversationPanel endpoint={endpoint} sendEndpoint={id ? `${endpoint}/messages` : endpoint} page={data} currentUserId={data.currentUserId} role={data.role} lang={lang} title={ru ? "Чат поддержки" : "Support conversation"} onSent={sent} onRefresh={reload} offline={Boolean(resource.error)} refreshing={resource.loading}/> : !resource.error && <div className="list-placeholder"><Headset size={28}/>{ru ? "Загружаем диалог…" : "Loading conversation…"}</div>}</div>;
  return embedded ? content : <AccountShell workspace back={data?.role === "admin" ? "/inbox" : "/dashboard"} backLabel={ru ? "Назад" : "Back"}>{data && <WorkspaceNav active={data.role === "admin" ? "inbox" : "support"} ru={ru} admin={data.role === "admin"}/>}<div className={data?.role === "client" ? "support-layout" : ""}>{content}{data?.role === "client" && <aside className="support-help"><span className="panel-icon"><Headset size={22}/></span><h2>{ru ? "На связи с вами" : "Here to help"}</h2><p>{ru ? "Здесь поможем с аккаунтом, оформлением и общими вопросами." : "Get help with your account, ordering and general questions."}</p><a className="secondary-action" href="/dashboard">{ru ? "Мои заказы" : "My orders"}<ArrowUpRight size={16}/></a><p>{ru ? "Вопрос по конкретному заказу? Напишите в его чат — все договорённости будут рядом с условиями." : "A question about an order? Use its chat to keep the conversation beside the terms."}</p><a href="/account">{ru ? "Настройки безопасности" : "Security settings"} →</a></aside>}</div></AccountShell>;
}
