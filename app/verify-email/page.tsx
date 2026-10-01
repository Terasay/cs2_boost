"use client";

import { useEffect, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { writeStorage } from "@/lib/browser-storage";
import { AccountShell, api, type Draft } from "../account-ui";

export default function VerifyEmail() {
  const [lang, setLang] = useState<"ru" | "en">("ru");
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const ru = lang === "ru";
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const language = params.get("lang") === "en" ? "en" : "ru";
    writeStorage("localStorage", "cs2-lang", language);
    document.documentElement.lang = language;
    const timer = setTimeout(() => { setToken(params.get("token") || ""); setLang(language); setReady(true); }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    if (password !== confirmation) { setError(ru ? "Пароли не совпадают." : "Passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ draft?: Draft; attribution?: unknown }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token, password }) });
      if (result.draft) writeStorage("sessionStorage", "cs2-draft", JSON.stringify(result.draft));
      if (result.attribution) writeStorage("sessionStorage", "cs2-campaign", JSON.stringify(result.attribution));
      setHasDraft(Boolean(result.draft)); setDone(true); setPassword(""); setConfirmation(""); setToken("");
      window.history.replaceState(null, "", "/verify-email");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }
  return <AccountShell><div className="account-intro"><span className="kicker">CS2 BOOST / EMAIL</span><h1>{done ? (ru ? "Аккаунт готов" : "Your account is ready") : (ru ? "Завершите регистрацию" : "Complete registration")}</h1><p>{ru ? "Подтверждение почты и доступ к личному кабинету." : "Confirm your email and access your account."}</p></div><div className="account-narrow">
    {done ? <section className="account-panel"><Check size={32} className="email-icon"/><h2>{ru ? "Почта подтверждена" : "Email verified"}</h2><p className="email-description">{hasDraft ? (ru ? "Параметры сохранены. Теперь подтвердите заявку — администратор получит её после отправки." : "Your settings have been saved. Review and submit the request to send it to the admin.") : (ru ? "Вы вошли в аккаунт и можете перейти в кабинет." : "You are signed in and can open your account.")}</p><a className="compact-primary" href={hasDraft ? "/register" : "/dashboard"}>{hasDraft ? (ru ? "Продолжить оформление" : "Continue request") : (ru ? "В кабинет" : "Open account")}</a></section> : !ready ? <p>{ru ? "Загрузка…" : "Loading…"}</p> : !/^[0-9a-f]{64}$/.test(token) ? <section className="account-panel"><p className="error">{ru ? "Откройте полную ссылку из письма или запросите новую." : "Open the complete link from the email or request a new one."}</p><a className="compact-primary" href="/register">{ru ? "Получить ссылку" : "Request a link"}</a></section> : <form className="account-panel" onSubmit={submit}><ShieldCheck size={30} className="email-icon"/><h2>{ru ? "Задайте пароль" : "Choose a password"}</h2><p className="email-description">{ru ? "Создайте отдельный пароль для сайта. Не используйте пароль от Steam." : "Choose a separate password for this website. Do not use your Steam password."}</p><label htmlFor="new-password">{ru ? "Пароль" : "Password"}</label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)}/><small>{ru ? "От 12 до 128 символов." : "12–128 characters."}</small><label htmlFor="confirm-password">{ru ? "Повторите пароль" : "Confirm password"}</label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)}/>{error && <p className="error" role="alert">{error}</p>}<Button className="account-cta" disabled={busy}>{busy ? (ru ? "Создаём аккаунт…" : "Creating account…") : (ru ? "Создать аккаунт" : "Create account")}</Button><p className="account-footnote"><a href="/register">{ru ? "Запросить новую ссылку" : "Request a new link"}</a></p></form>}
  </div></AccountShell>;
}
