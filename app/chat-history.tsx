"use client";

import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "./account-ui";

import type { ChatPage } from "@/lib/chat-sync";
export type { ChatMessage, ChatPage } from "@/lib/chat-sync";

export const ChatHistory = memo(function ChatHistory({ endpoint, page, currentUserId, role, lang, empty }: { endpoint: string; page: ChatPage; currentUserId: string; role: "client" | "admin"; lang: "ru" | "en"; empty: React.ReactNode }) {
  const [history, setHistory] = useState<ChatPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const previousAnchor = useRef<{ id: string; offset: number } | null>(null);
  const previousLast = useRef<string | undefined>(undefined);
  const [readThrough, setReadThrough] = useState(page.messages.at(-1)?.id);
  const pending = useRef(false);
  const merged = useMemo(() => Array.from(new Map([...(history?.messages ?? []), ...page.messages].map(message => [message.id, message])).values())
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), [history, page.messages]);
  const cursor = history ? history.nextCursor : page.nextCursor;
  const lastId = merged.at(-1)?.id;
  const readIndex = merged.findIndex(message => message.id === readThrough);
  const newMessages = !atBottom && readIndex >= 0 ? merged.slice(readIndex + 1).filter(message => message.senderId !== currentUserId).length : 0;
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (previousHeight.current !== null) {
      const anchor = previousAnchor.current;
      const row = anchor && Array.from(element.querySelectorAll<HTMLElement>("[data-message-id]")).find(row => row.dataset.messageId === anchor.id);
      element.scrollTop += row && anchor ? row.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset : element.scrollHeight - previousHeight.current;
      previousHeight.current = null;
      previousAnchor.current = null;
    } else if (nearBottom.current || (previousLast.current !== lastId && page.messages.at(-1)?.senderId === currentUserId)) {
      element.scrollTop = element.scrollHeight;
    }
    previousLast.current = lastId;
  }, [lastId, history, currentUserId, page.messages]);
  async function older() {
    if (!cursor || pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      const result = await api<ChatPage>(`${endpoint}?before=${encodeURIComponent(cursor)}`, { signal: AbortSignal.timeout(15000) });
      const element = box.current;
      previousHeight.current = element?.scrollHeight ?? null;
      if (element) {
        const top = element.getBoundingClientRect().top;
        const row = Array.from(element.querySelectorAll<HTMLElement>("[data-message-id]")).find(row => row.getBoundingClientRect().bottom > top);
        previousAnchor.current = row ? { id: row.dataset.messageId!, offset: row.getBoundingClientRect().top - top } : null;
      }
      setHistory({ messages: [...result.messages, ...merged], nextCursor: result.nextCursor });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setBusy(false); }
  }
  const ru = lang === "ru";
  return <div className="chat-history"><div className="messages" ref={box} role="log" aria-label={ru ? "История сообщений" : "Message history"} onScroll={() => { const element = box.current; if (element) { const next = element.scrollHeight - element.scrollTop - element.clientHeight < 80; if (nearBottom.current || next) setReadThrough(lastId); nearBottom.current = next; setAtBottom(next); } }}>
    {cursor && <button className="history-button" type="button" aria-disabled={busy} aria-busy={busy} onClick={older}>{busy ? (ru ? "Загружаем…" : "Loading…") : (ru ? "Предыдущие сообщения" : "Earlier messages")}</button>}
    {error && <p className="error" role="alert">{error}</p>}
    {merged.length ? merged.map(message => <div key={message.id} data-message-id={message.id} className={message.senderId === currentUserId ? "message mine" : "message"}><small>{message.senderId === currentUserId ? (ru ? "Вы" : "You") : message.senderRole === "admin" ? (ru ? "Администратор" : "Admin") : message.senderRole === "client" || role === "admin" ? (ru ? "Клиент" : "Client") : (ru ? "Администратор" : "Admin")} · {new Date(message.createdAt).toLocaleString(ru ? "ru-RU" : "en-US")}</small><p>{message.body}</p></div>) : empty}
  </div>{!atBottom && <button type="button" className="jump-latest" onClick={() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>{newMessages ? (ru ? `Новые сообщения · ${newMessages} ↓` : `New messages · ${newMessages} ↓`) : (ru ? "К последним сообщениям ↓" : "Latest messages ↓")}</button>}</div>;
});
