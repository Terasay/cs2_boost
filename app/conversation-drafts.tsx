"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type OutgoingMessage = { id: string; body: string };
type Draft = { body: string; outgoing: OutgoingMessage | null; failed: OutgoingMessage | null; error: string };
type Change = (previous: Draft) => Draft;
const emptyDraft: Draft = { body: "", outgoing: null, failed: null, error: "" };
const Drafts = createContext<{ entries: Record<string, Draft>; update: (key: string, change: Change) => void } | null>(null);

export function ConversationDrafts({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Draft>>({});
  const update = useCallback((key: string, change: Change) => {
    setEntries(previous => {
      const next = change(previous[key] || emptyDraft);
      const result = { ...previous };
      if (!next.body && !next.outgoing && !next.failed && !next.error) delete result[key];
      else result[key] = next;
      return result;
    });
  }, []);
  const value = useMemo(() => ({ entries, update }), [entries, update]);
  return <Drafts.Provider value={value}>{children}</Drafts.Provider>;
}

export function useConversationDraft(key: string) {
  const shared = useContext(Drafts);
  const [local, setLocal] = useState(emptyDraft);
  const updateShared = shared?.update;
  const update = useCallback((change: Change) => {
    if (updateShared) updateShared(key, change);
    else setLocal(change);
  }, [key, updateShared]);
  return [shared ? shared.entries[key] || emptyDraft : local, update] as const;
}
