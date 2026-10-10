"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Send, X } from "lucide-react";
import { api } from "./account-ui";
import { ChatHistory, type ChatMessage, type ChatPage } from "./chat-history";
import { useConversationDraft, type OutgoingMessage } from "./conversation-drafts";

type Props = { endpoint: string; sendEndpoint?: string; page: ChatPage; currentUserId: string; role: "client" | "admin"; lang: "ru" | "en"; onSent: (message?: ChatMessage) => void; onRefresh: () => void; offline?: boolean; refreshing?: boolean; title?: string };

export function ConversationPanel(props: Props) {
  return <Conversation key={`${props.endpoint}:${props.currentUserId}`} {...props}/>;
}

function Conversation({ endpoint, sendEndpoint, page, currentUserId, role, lang, onSent, onRefresh, offline = false, refreshing = false, title }: Props) {
  const ru = lang === "ru";
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [draft, updateDraft] = useConversationDraft(`${endpoint}:${currentUserId}`);
  const { body, failed, error } = draft;
  const sending = Boolean(draft.outgoing);
  const [sent, setSent] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const composing = useRef(false);
  const empty = useMemo(() => <div className="conversation-empty"><MessageSquare size={30}/><strong>{ru ? "Начните диалог" : "Start a conversation"}</strong><p>{ru ? "Обсудите цель, время и детали заказа." : "Discuss your goal, schedule and order details."}</p></div>, [ru]);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(130, element.scrollHeight)}px`;
  }, [body]);
  useEffect(() => {
    mounted.current = true;
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith("cs2-message:")) sessionStorage.removeItem(key); } catch {}
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!failed || !page.messages.some(message => message.id === failed.id)) return;
    const timer = setTimeout(() => updateDraft(previous => previous.failed?.id === failed.id ? { ...previous, failed: null, error: "" } : previous), 0);
    return () => clearTimeout(timer);
  }, [failed, page.messages, updateDraft]);
  function edit(value: string) { updateDraft(previous => ({ ...previous, body: value })); setSent(false); }
  async function send(retry?: OutgoingMessage) {
    if (pending.current || sending || (!retry && (failed || !body.trim()))) return;
    const outgoing = retry || { id: crypto.randomUUID(), body: body.trim() };
    pending.current = true;
    if (textarea.current?.form?.contains(document.activeElement)) textarea.current.focus({ preventScroll: true });
    updateDraft(previous => ({ ...previous, body: retry ? previous.body : "", outgoing, failed: null, error: "" }));
    setSent(false);
    try {
      const result = await api<{ message?: ChatMessage }>(sendEndpoint || `${endpoint}/messages`, { method: "POST", signal: AbortSignal.timeout(20000), body: JSON.stringify({ body: outgoing.body, clientId: outgoing.id }) });
      updateDraft(previous => ({ ...previous, outgoing: null }));
      if (mounted.current) { setSent(true); onSent(result.message); }
    } catch (reason) {
      updateDraft(previous => ({ ...previous, outgoing: null, failed: outgoing, error: reason instanceof Error ? reason.message : "Error" }));
    } finally { pending.current = false; }
  }
  return <section className="conversation-panel" aria-label={title || (ru ? "Чат заказа" : "Order chat")}>
    <header className="conversation-heading"><div><MessageSquare size={19}/><h2>{title || (ru ? "Чат заказа" : "Order chat")}</h2></div><div><span className={offline ? "connection offline" : "connection"}>{offline ? (ru ? "Нет связи" : "Offline") : (ru ? "Автообновление" : "Auto refresh")}</span><button className="icon-button" type="button" onClick={() => { if (!refreshing) onRefresh(); }} aria-busy={refreshing} aria-label={ru ? "Обновить чат" : "Refresh chat"}><RefreshCw size={16}/></button></div></header>
    <ChatHistory key={`${endpoint}:${currentUserId}`} endpoint={endpoint} page={page} currentUserId={currentUserId} role={role} lang={lang} empty={empty}/>
    <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      {failed && <div className="composer-failed" role="alert"><div><strong>{ru ? "Отправка не подтверждена" : "Delivery not confirmed"}</strong><button className="icon-button" type="button" aria-label={ru ? "Убрать неотправленное сообщение" : "Dismiss unsent message"} onClick={() => updateDraft(previous => ({ ...previous, failed: null, error: "" }))}><X size={15}/></button></div><p>{failed.body}</p><small>{error}</small><button className="secondary-action" type="button" onClick={() => send(failed)}>{ru ? "Повторить отправку" : "Retry sending"}</button></div>}
      <label className="sr-only" htmlFor={`${id}-message`}>{ru ? "Сообщение" : "Message"}</label><textarea ref={textarea} id={`${id}-message`} value={body} onChange={event => edit(event.target.value)} maxLength={2000} rows={1} enterKeyHint="send" aria-describedby={`${id}-status ${id}-safety`} placeholder={ru ? "Написать сообщение…" : "Write a message…"} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !composing.current && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}/><div className="composer-actions"><small id={`${id}-status`} role="status">{sending ? (ru ? "Отправляем… Можно писать следующее сообщение" : "Sending… You can draft the next message") : sent && !body ? (ru ? "Сообщение отправлено" : "Message sent") : (ru ? "Enter — отправить · Shift+Enter — новая строка" : "Enter to send · Shift+Enter for a new line")}</small><button className="send-button" type="submit" disabled={sending || Boolean(failed) || !body.trim()}>{sending ? (ru ? "Отправка…" : "Sending…") : (ru ? "Отправить" : "Send")}<Send size={16}/></button></div><p id={`${id}-safety`} className="composer-safety">{ru ? "Не отправляйте пароли и коды Steam Guard." : "Do not send passwords or Steam Guard codes."}</p></form>
  </section>;
}
