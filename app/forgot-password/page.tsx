"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountShell, api, useLanguage } from "../account-ui";

export default function ForgotPassword() {
  const lang = useLanguage();
  const ru = lang === "ru";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email, lang }), signal: AbortSignal.timeout(15000) });
      setSent(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <AccountShell back="/login" backLabel={ru ? "Ко входу" : "Back to sign in"}>
    <div className="recovery-layout">
      <header className="recovery-heading"><span className="kicker">CS2 BOOST / ACCOUNT RECOVERY</span><h1>{ru ? "Вернём доступ" : "Recover your account"}</h1><p>{ru ? "Укажите почту аккаунта. Мы отправим ссылку, по которой можно задать новый пароль." : "Enter your account email. We will send a link to choose a new password."}</p></header>
      <section className="account-panel recovery-panel">
        <span className="panel-icon"><Mail size={23}/></span>
        {sent ? <div className="recovery-result" role="status"><h2>{ru ? "Проверьте почту" : "Check your email"}</h2><p>{ru ? "Если для этой почты есть подтверждённый аккаунт, письмо будет отправлено. Обычно оно приходит в течение нескольких минут. Проверьте папку «Спам»." : "If a verified account exists for this address, an email will be sent. It usually arrives within a few minutes. Check your spam folder."}</p><p>{ru ? "Ссылка действует 30 минут. До её использования пароль не меняется." : "The link is valid for 30 minutes. Your password remains unchanged until you use it."}</p><Button variant="secondary" type="button" onClick={() => setSent(false)}>{ru ? "Запросить ещё раз" : "Request another email"}</Button></div>
          : <form className="recovery-form" onSubmit={submit}><label htmlFor="recovery-email">Email</label><Input id="recovery-email" type="email" autoComplete="email" maxLength={254} required value={email} disabled={busy} onChange={event => setEmail(event.target.value)}/><Button className="account-cta" disabled={busy}>{busy ? (ru ? "Отправляем…" : "Sending…") : (ru ? "Получить ссылку" : "Send reset link")}<Send size={17}/></Button></form>}
        {error && <p className="error" role="alert">{error}</p>}
        <a className="recovery-back" href="/login"><ArrowLeft size={15}/>{ru ? "Вернуться ко входу" : "Back to sign in"}</a>
      </section>
      <aside className="recovery-notes"><div><strong>01 / {ru ? "Одноразовая ссылка" : "One-time link"}</strong><p>{ru ? "Письмо не содержит пароль. Новый пароль задаётся только на сайте." : "The email does not contain a password. Choose your new password on the website."}</p></div><div><strong>02 / {ru ? "Защита сохраняется" : "Protection stays enabled"}</strong><p>{ru ? "Если включена 2FA, понадобится код приложения или резервный код." : "If 2FA is enabled, an authenticator or recovery code is required."}</p></div><div><strong>03 / {ru ? "Контроль входов" : "Control over sign-ins"}</strong><p>{ru ? "После смены пароля все старые сеансы завершатся." : "All previous sessions end after your password is reset."}</p></div></aside>
    </div>
  </AccountShell>;
}
