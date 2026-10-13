"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Check, Languages, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotificationPreferences } from "@/lib/notifications.mjs";
import { api } from "./account-ui";

export function NotificationSettings({ ru }: { ru: boolean }) {
  const [settings, setSettings] = useState<(NotificationPreferences & { enabled: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    api<NotificationPreferences & { enabled: boolean }>("/api/notifications", { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]) }).then(setSettings).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Error"); });
    return () => abort.abort();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || pending.current) return;
    pending.current = true;
    setBusy(true); setSaved(false); setError("");
    try { await api("/api/notifications", { method: "PATCH", body: JSON.stringify(settings), signal: AbortSignal.timeout(15000) }); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="account-panel notification-panel"><div className="panel-heading"><span className="panel-icon"><Bell size={21}/></span><div><h2>{ru ? "Уведомления по почте" : "Email notifications"}</h2><p>{ru ? "Важные события, даже когда кабинет закрыт." : "Important updates while you are away."}</p></div></div>
    {settings ? <form onSubmit={submit} className="notification-form"><label className="notification-choice"><input type="checkbox" disabled={busy} checked={settings.orderUpdates} onChange={event => { setSettings({ ...settings, orderUpdates: event.target.checked }); setSaved(false); }}/><span><strong>{ru ? "События заказа" : "Order updates"}</strong><small>{ru ? "Принятие, оплата, новые условия, задержка и завершение. Для админа — также новые заявки и передача данных." : "Acceptance, payment, new terms, delays and completion. Admins also receive new requests and submitted details."}</small></span></label><label className="notification-choice"><input type="checkbox" disabled={busy} checked={settings.chatReminders} onChange={event => { setSettings({ ...settings, chatReminders: event.target.checked }); setSaved(false); }}/><span><strong>{ru ? "Напоминания о сообщениях" : "Message reminders"}</strong><small>{ru ? "Одно письмо, если новые сообщения не прочитаны около пяти минут. Без текста переписки." : "One email when new messages remain unread for about five minutes. Conversation content is excluded."}</small></span></label><label className="notification-language"><Languages size={18} aria-hidden="true"/><span>{ru ? "Язык писем" : "Email language"}</span><select value={settings.language} disabled={busy} onChange={event => { setSettings({ ...settings, language: event.target.value as "ru" | "en" }); setSaved(false); }}><option value="ru">Русский</option><option value="en">English</option></select></label>{!settings.enabled && <p className="inspector-note">{ru ? "Уведомления о заказах отключены на сервере или почта ещё не настроена." : "Order notifications are disabled on the server or email delivery is not configured."}</p>}<p className="inspector-note notification-security-note"><Mail size={16}/><span>{ru ? "Письма для восстановления и защиты аккаунта отправляются независимо от этих настроек." : "Account recovery and security emails are independent of these settings."}</span></p>{error && <p className="error" role="alert">{error}</p>}{saved && <p className="success-note" role="status"><Check size={15}/>{ru ? "Настройки сохранены" : "Settings saved"}</p>}<Button type="submit" variant="secondary" className="account-cta" disabled={busy}>{busy ? (ru ? "Сохраняем…" : "Saving…") : (ru ? "Сохранить уведомления" : "Save notifications")}</Button></form> : <p role={error ? "alert" : "status"} className={error ? "error" : "inspector-note"}>{error || (ru ? "Загружаем настройки…" : "Loading settings…")}</p>}
  </section>;
}
