"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { api } from "./account-ui";
import { ChatHistory, type ChatMessage, type ChatPage } from "./chat-history";

export function ConversationPanel({ endpoint, sendEndpoint, page, currentUserId, role, lang, onSent, onRefresh, offline = false, refreshing = false, title }: { endpoint: string; sendEndpoint?: string; page: ChatPage; currentUserId: string; role: "client" | "admin"; lang: "ru" | "en"; onSent: (message?: ChatMessage) => void; onRefresh: () => void; offline?: boolean; refreshing?: boolean; title?: string }) {
  const ru = lang === "ru";
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const pending = useRef(false);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(130, element.scrollHeight)}px`;
  }, [body]);
  useEffect(() => {
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith("cs2-message:")) sessionStorage.removeItem(key); } catch {}
    const timer = setTimeout(() => setBody(""), 0);
    return () => clearTimeout(timer);
  }, [endpoint, currentUserId]);
  function edit(value: string) { setBody(value); setSent(false); }
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (pending.current || !body.trim()) return;
    pending.current = true;
    setSending(true); setError(""); setSent(false);
    try {
      const result = await api<{ message?: ChatMessage }>(sendEndpoint || `${endpoint}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      edit(""); setSent(true); onSent(result.message);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setSending(false); }
  }
  return <section className="conversation-panel" aria-label={title || (ru ? "Чат заказа" : "Order chat")}>
    <header className="conversation-heading"><div><MessageSquare size={19}/><h2>{title || (ru ? "Чат заказа" : "Order chat")}</h2></div><div><span className={offline ? "connection offline" : "connection"}>{offline ? (ru ? "Нет связи" : "Offline") : (ru ? "Автообновление" : "Auto refresh")}</span><button className="icon-button" type="button" onClick={onRefresh} disabled={refreshing} aria-label={ru ? "Обновить чат" : "Refresh chat"}><RefreshCw size={16}/></button></div></header>
    <ChatHistory key={`${endpoint}:${currentUserId}`} endpoint={endpoint} page={page} currentUserId={currentUserId} role={role} lang={lang} empty={<div className="conversation-empty"><MessageSquare size={30}/><strong>{ru ? "Начните диалог" : "Start a conversation"}</strong><p>{ru ? "Обсудите цель, время и детали заказа." : "Discuss your goal, schedule and order details."}</p></div>}/>
    <form className="chat-composer" onSubmit={send}><label className="sr-only" htmlFor={`${id}-message`}>{ru ? "Сообщение" : "Message"}</label><textarea ref={textarea} id={`${id}-message`} value={body} onChange={event => edit(event.target.value)} maxLength={2000} rows={1} disabled={sending} placeholder={ru ? "Написать сообщение…" : "Write a message…"} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><div className="composer-actions"><small role="status">{sent ? (ru ? "Сообщение отправлено" : "Message sent") : (ru ? "Enter — отправить · Shift+Enter — новая строка" : "Enter to send · Shift+Enter for a new line")}</small><button className="send-button" type="submit" disabled={sending || !body.trim()}>{sending ? (ru ? "Отправка…" : "Sending…") : (ru ? "Отправить" : "Send")}<Send size={16}/></button></div>{error && <p className="error" role="alert">{error}</p>}<p className="composer-safety">{ru ? "Не отправляйте пароли и коды Steam Guard." : "Do not send passwords or Steam Guard codes."}</p></form>
  </section>;
}
