"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountShell, api, readDraft, useLanguage } from "../account-ui";

export default function Login() {
  const lang = useLanguage();
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [secondFactor, setSecondFactor] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      if (secondFactor) {
        await api("/api/auth/two-factor-login", { method: "POST", body: JSON.stringify({ code }) });
      } else {
        const result = await api<{ twoFactorRequired?: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setPassword("");
        if (result.twoFactorRequired) { setSecondFactor(true); setCode(""); setLoading(false); return; }
      }
      window.location.assign(readDraft() ? "/register" : "/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); setLoading(false); }
  }

  async function back() {
    if (loading) return;
    setLoading(true); setError("");
    try {
      await api("/api/auth/logout", { method: "POST" });
      setSecondFactor(false); setRecovery(false); setCode("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setLoading(false); }
  }

  return <AccountShell><div className="login-layout"><div><div className="account-intro"><span className="kicker">CS2 BOOST</span><h1>{secondFactor ? t("Подтвердите вход", "Verify your sign-in") : t("Вход в аккаунт", "Sign in")}</h1><p>{secondFactor ? t("Остался код из приложения на телефоне.", "Enter the code from your authenticator app.") : t("Вернитесь к заказам и переписке с администратором.", "Return to your orders and admin chat.")}</p></div><form className="account-panel account-narrow" onSubmit={submit}>
    {secondFactor ? <><ShieldCheck className="security-icon" size={27}/><p className="mfa-login-email">{email}</p><label htmlFor="verification-code">{recovery ? t("Резервный код", "Recovery code") : t("Код из приложения", "Authenticator code")}</label><Input key={recovery ? "recovery" : "totp"} id="verification-code" type="text" inputMode={recovery ? "text" : "numeric"} autoComplete="one-time-code" autoFocus required maxLength={recovery ? 32 : 6} pattern={recovery ? undefined : "[0-9]{6}"} value={code} onChange={event => setCode(event.target.value)}/><small>{recovery ? t("Введите один из сохранённых резервных кодов. Каждый используется один раз.", "Enter one saved recovery code. Each can be used once.") : t("Шесть цифр из приложения. Если код уже использован, дождитесь нового.", "Enter six digits from your authenticator. If already used, wait for a new code.")}</small><p className="mfa-hint">{t("На подтверждение есть 5 минут. Если время истекло, вернитесь к вводу пароля.", "Verification expires after 5 minutes. If expired, return to the password step.")}</p></> : <><label htmlFor="email">Email</label><Input id="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)}/><label htmlFor="password">{t("Пароль", "Password")}</label><Input id="password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/></>}
    {error && <p className="error" role="alert">{error}</p>}<Button className="account-cta" disabled={loading}>{loading ? "…" : secondFactor ? t("Подтвердить вход", "Verify sign-in") : t("Войти", "Sign in")}<ArrowRight size={18}/></Button>
    {secondFactor ? <div className="mfa-login-actions"><Button type="button" variant="ghost" disabled={loading} onClick={() => { setRecovery(value => !value); setCode(""); setError(""); }}>{recovery ? t("Использовать приложение", "Use authenticator") : t("Телефон недоступен?", "Phone unavailable?")}</Button><Button type="button" variant="ghost" disabled={loading} onClick={back}>{t("Вернуться к паролю", "Back to password")}</Button></div> : <p className="account-footnote">{t("Нет аккаунта?", "No account?")} <a href={`/${lang}#calculator`}>{t("Начать с заказа", "Start a request")}</a></p>}
    </form></div><aside className="login-media"><Image src="/hero-arena.png" alt="" width={1536} height={1024} priority/><div className="login-media-caption"><span>PREMIER / FACEIT</span><strong>{t("Заказы и чат в одном кабинете", "Orders and chat in one place")}</strong></div></aside></div></AccountShell>;
}
