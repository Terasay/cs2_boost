"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { api } from "./account-ui";

import type { ChatPage } from "@/lib/chat-sync";
export type { ChatMessage, ChatPage } from "@/lib/chat-sync";

export function ChatHistory({ endpoint, page, currentUserId, role, lang, empty }: { endpoint: string; page: ChatPage; currentUserId: string; role: "client" | "admin"; lang: "ru" | "en"; empty: React.ReactNode }) {
  const [history, setHistory] = useState<ChatPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousHeight = useRef<number | null>(null);
  const previousLast = useRef<string | undefined>(undefined);
  const merged = Array.from(new Map([...(history?.messages ?? []), ...page.messages].map(message => [message.id, message])).values())
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const cursor = history ? history.nextCursor : page.nextCursor;
  const lastId = merged.at(-1)?.id;
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    if (previousHeight.current !== null) {
      element.scrollTop += element.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    } else if (nearBottom.current || (previousLast.current !== lastId && page.messages.at(-1)?.senderId === currentUserId)) element.scrollTop = element.scrollHeight;
    previousLast.current = lastId;
  }, [lastId, history, currentUserId, page.messages]);
  async function older() {
    if (!cursor || busy) return;
    setBusy(true); setError("");
    try {
      const result = await api<ChatPage>(`${endpoint}?before=${encodeURIComponent(cursor)}`);
      previousHeight.current = box.current?.scrollHeight ?? null;
      setHistory({ messages: [...result.messages, ...merged], nextCursor: result.nextCursor });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }
  const ru = lang === "ru";
  return <div className="chat-history"><div className="messages" ref={box} role="log" aria-label={ru ? "История сообщений" : "Message history"} onScroll={() => { const element = box.current; if (element) { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; setAtBottom(nearBottom.current); } }}>
    {cursor && <button className="history-button" type="button" disabled={busy} onClick={older}>{busy ? (ru ? "Загружаем…" : "Loading…") : (ru ? "Предыдущие сообщения" : "Earlier messages")}</button>}
    {error && <p className="error" role="alert">{error}</p>}
    {merged.length ? merged.map(message => <div key={message.id} className={message.senderId === currentUserId ? "message mine" : "message"}><small>{message.senderId === currentUserId ? (ru ? "Вы" : "You") : message.senderRole === "admin" ? (ru ? "Администратор" : "Admin") : message.senderRole === "client" || role === "admin" ? (ru ? "Клиент" : "Client") : (ru ? "Администратор" : "Admin")} · {new Date(message.createdAt).toLocaleString(ru ? "ru-RU" : "en-US")}</small><p>{message.body}</p></div>) : empty}
  </div>{!atBottom && <button type="button" className="jump-latest" onClick={() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}>{ru ? "К последним сообщениям ↓" : "Latest messages ↓"}</button>}</div>;
}
