"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./account-ui";
import { mergeChatPages, refreshChat, type ChatPage } from "@/lib/chat-sync";

export function useLiveResource<T>(endpoint: string, interval = 5000, chat = false, forbiddenRedirect?: string) {
  const [stored, setStored] = useState<{ key: string; value: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const latest = useRef<{ key: string; cursor: string } | null>(null);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true);
    try {
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]);
      const sync = chat ? await refreshChat(endpoint, latest.current?.key === endpoint ? latest.current.cursor : null, url => api<T & ChatPage>(url, { signal })) : null;
      const result = sync ? sync.page : await api<T>(endpoint, { signal });
      if (request !== sequence.current || abort.signal.aborted) return;
      if (sync) latest.current = { key: endpoint, cursor: sync.cursor };
      setStored(previous => {
        if (!chat || previous?.key !== endpoint) return { key: endpoint, value: result };
        const prior = previous.value as T & ChatPage;
        const next = result as T & ChatPage;
        return { key: endpoint, value: mergeChatPages(prior, next) };
      });
      setFailure(null);
    } catch (reason) {
      if (abort.signal.aborted || request !== sequence.current) return;
      if (reason instanceof ApiError && [401, 403, 404].includes(reason.status)) { setStored(null); latest.current = null; }
      if (reason instanceof ApiError && reason.status === 401) { window.location.assign("/login"); return; }
      if (reason instanceof ApiError && reason.status === 403 && forbiddenRedirect) { window.location.assign(forbiddenRedirect); return; }
      setFailure({ key: endpoint, message: reason instanceof Error ? reason.message : "Error" });
    } finally { if (request === sequence.current) { setLoading(false); controller.current = null; } }
  }, [endpoint, chat, forbiddenRedirect]);
  useEffect(() => {
    const requests = sequence;
    const initial = setTimeout(reload, 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible" && !controller.current) void reload(); }, interval);
    const focus = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", focus);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", focus); requests.current++; controller.current?.abort(); };
  }, [reload, interval]);
  const update = useCallback((transform: (value: T) => T) => setStored(previous => previous?.key === endpoint ? { key: endpoint, value: transform(previous.value) } : previous), [endpoint]);
  return { data: stored?.key === endpoint ? stored.value : null, error: failure?.key === endpoint ? failure.message : "", loading, reload, update };
}

export function useDebounced(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), 250); return () => clearTimeout(timer); }, [value]);
  return settled;
}
