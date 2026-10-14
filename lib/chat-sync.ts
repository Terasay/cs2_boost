export type ChatMessage = { id: string; senderId: string; senderRole?: "client" | "admin"; body: string; createdAt: number };
export type ChatPage = { messages: ChatMessage[]; nextCursor: string | null; latestCursor?: string | null; hasMore?: boolean; currentUserId?: string; thread?: { id: string } | null; order?: { id: string } };

const emptyCursor = "0:00000000-0000-0000-0000-000000000000";
const cursorOf = (message: ChatMessage) => `${message.createdAt}:${message.id}`;
const sameConversation = (previous: ChatPage, next: ChatPage) => previous.currentUserId === next.currentUserId && previous.thread?.id === next.thread?.id && previous.order?.id === next.order?.id;

export function mergeChatPages<T extends ChatPage>(previous: T, next: T): T {
  if (!sameConversation(previous, next)) return next;
  const messages = Array.from(new Map([...previous.messages, ...next.messages].map(message => [message.id, message])).values())
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { ...next, messages, nextCursor: previous.nextCursor };
}

export async function refreshChat<T extends ChatPage>(endpoint: string, previousCursor: string | null, fetchPage: (url: string) => Promise<T>, options?: { previousPage?: ChatPage; onConversationChange?: () => void }): Promise<{ page: T; cursor: string }> {
  const url = (cursor: string) => `${endpoint}${endpoint.includes("?") ? "&" : "?"}after=${encodeURIComponent(cursor)}`;
  const restart = () => {
    options?.onConversationChange?.();
    return refreshChat(endpoint, null, fetchPage);
  };
  let page = await fetchPage(previousCursor === null ? endpoint : url(previousCursor));
  if (options?.previousPage && !sameConversation(options.previousPage, page)) return restart();
  let latest = page;
  let cursor = page.latestCursor ?? (page.messages.length ? cursorOf(page.messages.at(-1)!) : previousCursor ?? emptyCursor);
  for (let batch = 1; previousCursor !== null && latest.hasMore && batch < 5; batch++) {
    latest = await fetchPage(url(cursor));
    if (!sameConversation(page, latest)) return restart();
    const nextCursor = latest.latestCursor ?? (latest.messages.length ? cursorOf(latest.messages.at(-1)!) : null);
    if (!nextCursor || nextCursor === cursor) throw new Error("Chat update did not advance");
    cursor = nextCursor;
    page = { ...latest, messages: [...page.messages, ...latest.messages] };
  }
  return { page, cursor };
}
