"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { readCampaign } from "@/lib/campaign-storage";
import { api, readDraft } from "./account-ui";
import { LegalFormLinks } from "./legal-links";

export default function EmailSignup({ lang }: { lang: "ru" | "en" }) {
  const ru = lang === "ru";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || cooldown) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ retryAfter: number }>(sent ? "/api/auth/resend-verification" : "/api/auth/register", { method: "POST", body: JSON.stringify({ email, lang, draft: readDraft(), attribution: readCampaign() }) });
      setSent(true); setCooldown(result.retryAfter);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }
  return <form className="account-panel" onSubmit={submit}><Mail className="email-icon" size={29}/><h2>{sent ? (ru ? "Проверьте почту" : "Check your inbox") : (ru ? "Создать аккаунт" : "Create an account")}</h2>
    <p className="email-description">{sent ? (ru ? `Если ${email} ещё не зарегистрирован, письмо отправлено. Откройте ссылку, чтобы задать пароль. Проверьте также папку «Спам».` : `If ${email} is not registered yet, an email has been sent. Open the link to set your password. Also check your spam folder.`) : (ru ? "Отправим ссылку для подтверждения адреса. Пароль задаётся после перехода по ссылке. Параметры заявки сохранятся." : "We'll email you a confirmation link. Set your password after opening it. Your request settings will be saved.")}</p>
    {!sent && <><label htmlFor="signup-email">Email</label><Input id="signup-email" type="email" required maxLength={254} autoComplete="email" value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/></>}
    {!sent && <LegalFormLinks lang={lang}/>}
    {sent && <p className="credential-note">{ru ? "Ссылка действует 30 минут. Аккаунт появится после подтверждения почты и выбора пароля." : "The link expires in 30 minutes. Your account is created after you confirm your email and choose a password."}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <Button className="account-cta" disabled={busy || cooldown > 0}>{busy ? (ru ? "Отправляем…" : "Sending…") : cooldown ? (ru ? `Повторить через ${cooldown} с` : `Resend in ${cooldown}s`) : sent ? (ru ? "Отправить письмо повторно" : "Resend email") : (ru ? "Получить ссылку" : "Email me a link")}<ArrowRight size={18}/></Button>
    {sent && <button type="button" className="editor-discard" disabled={busy} onClick={() => { setSent(false); setError(""); }}>{ru ? "Исправить адрес" : "Change email address"}</button>}
    <p className="account-footnote">{ru ? "Уже есть аккаунт?" : "Already have an account?"} <a href="/login">{ru ? "Войти" : "Sign in"}</a></p>
  </form>;
}
