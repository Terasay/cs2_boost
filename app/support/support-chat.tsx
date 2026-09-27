"use client";

import { useCallback, useEffect, useState } from "react";
import { Headset, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatHistory, type ChatPage } from "../chat-history";
import { ApiError, AccountShell, api, useLanguage } from "../account-ui";

type Thread = { id: string; clientEmail?: string; status: "open" | "closed" };
type Detail = ChatPage & { thread: Thread | null; currentUserId: string; role: "client" | "admin" };

export default function SupportChat({ id }: { id?: string }) {
  const lang = useLanguage();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const endpoint = id ? `/api/support/${id}` : "/api/support";
  const load = useCallback(async () => {
    try {
      const result = await api<Detail>(endpoint);
      setDetail(result);

    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) { window.location.assign("/login"); return; }
      if (reason instanceof ApiError && reason.status === 403 && !id) { window.location.assign("/inbox"); return; }
      setError(reason instanceof Error ? reason.message : "Error");
    } finally { setLoading(false); }
  }, [endpoint, id]);
  useEffect(() => { const initial = setTimeout(load, 0); const timer = setInterval(load, 15000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [load]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true); setError("");
    try {
      await api(id ? `/api/support/${id}/messages` : "/api/support", { method: "POST", body: JSON.stringify({ body }) });
      setBody("");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }

  async function changeStatus() {
    if (!id || !detail?.thread) return;
    setBusy(true); setError("");
    try {
      await api(endpoint, { method: "PATCH", body: JSON.stringify({ status: detail.thread.status === "open" ? "closed" : "open" }) });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }

  const ru = lang === "ru";
  return <AccountShell back={detail?.role === "admin" ? "/inbox" : "/dashboard"} backLabel={ru ? "Назад" : "Back"}>
    <div className="account-intro"><span className="kicker">CS2 BOOST / {ru ? "ПОДДЕРЖКА" : "SUPPORT"}</span><h1>{ru ? "Чат поддержки" : "Support chat"}</h1><p>{id ? detail?.thread?.clientEmail : (ru ? "Напишите нам по вопросам, не связанным с конкретным заказом." : "Ask us about anything outside a specific order.")}</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading ? <p className="muted">{ru ? "Загружаем переписку…" : "Loading conversation…"}</p> : detail && <div className="support-layout"><section className="account-panel chat-panel support-chat"><div className="panel-title"><h2><Headset size={22}/> {ru ? "Диалог" : "Conversation"}</h2>{detail.thread && <span className={`status ${detail.thread.status === "open" ? "status-in_progress" : "status-completed"}`}>{detail.thread.status === "open" ? (ru ? "Открыт" : "Open") : (ru ? "Закрыт" : "Closed")}</span>}</div>
      <ChatHistory key={endpoint} endpoint={endpoint} page={detail} currentUserId={detail.currentUserId} role={detail.role} lang={lang} empty={<div className="support-empty"><Headset size={28}/><strong>{ru ? "Чем можем помочь?" : "How can we help?"}</strong><p>{ru ? "Ваше сообщение увидит администратор." : "An admin will see your message."}</p></div>}/>
      <form onSubmit={send}><label htmlFor="support-message">{ru ? "Сообщение" : "Message"}</label><Textarea id="support-message" value={body} onChange={event => setBody(event.target.value)} maxLength={2000} rows={3} placeholder={ru ? "Напишите сообщение…" : "Write a message…"}/><p className="credential-note">{ru ? "Не отправляйте пароли или коды подтверждения." : "Do not send passwords or verification codes."}</p><div className="support-actions"><Button disabled={busy || !body.trim()}>{ru ? "Отправить" : "Send"}<Send size={17}/></Button></div></form>
    </section><aside className="account-panel support-side"><span className="kicker">{ru ? "ОБРАЩЕНИЕ" : "TICKET"}</span><h2>{id ? (ru ? "Клиент" : "Client") : (ru ? "На связи" : "Here to help")}</h2>{id ? <p className="support-email">{detail.thread?.clientEmail}</p> : <p>{ru ? "Вопросы по заказу удобнее обсуждать в его карточке. Здесь можно решить общие вопросы." : "Discuss order details in the order chat. Use this conversation for general questions."}</p>}{detail.thread && <div className="support-side-status"><span>{ru ? "Статус" : "Status"}</span><strong>{detail.thread.status === "open" ? (ru ? "Открыт" : "Open") : (ru ? "Закрыт" : "Closed")}</strong></div>}{id && detail.role === "admin" ? <Button type="button" variant="secondary" className="support-side-button" disabled={busy} onClick={changeStatus}>{detail.thread?.status === "open" ? (ru ? "Закрыть обращение" : "Close ticket") : (ru ? "Открыть обращение" : "Reopen ticket")}</Button> : <a className="support-side-link" href="/dashboard">{ru ? "Перейти к заказам" : "View orders"} →</a>}</aside></div>}
  </AccountShell>;
}
