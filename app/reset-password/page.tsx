"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { writeStorage } from "@/lib/browser-storage";
import { AccountShell, api, useLanguage } from "../account-ui";
import { PasswordInput } from "../password-input";

export default function ResetPassword() {
  const savedLanguage = useLanguage();
  const [linkLanguage, setLinkLanguage] = useState<"ru" | "en" | null>(null);
  const lang = linkLanguage ?? savedLanguage;
  const ru = lang === "ru";
  const [token, setToken] = useState("");
  const [valid, setValid] = useState(false);
  const [checking, setChecking] = useState(true);
  const [factor, setFactor] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const activeToken = useRef("");
  useEffect(() => {
    let abort: AbortController | null = null;
    async function readLink() {
      abort?.abort();
      const check = new AbortController();
      abort = check;
      const params = new URLSearchParams(window.location.hash.slice(1));
      const value = params.get("token") || "";
      const language = params.get("lang");
      if (language === "en" || language === "ru") {
        writeStorage("localStorage", "cs2-lang", language);
        setLinkLanguage(language);
        document.documentElement.lang = language;
      }
      window.history.replaceState(null, "", window.location.pathname);
      activeToken.current = value;
      pending.current = false;
      setValid(false); setChecking(true); setDone(false); setBusy(false); setError("");
      setPassword(""); setConfirmation(""); setCode("");
      setToken(value);
      if (!/^[0-9a-f]{64}$/.test(value)) { setChecking(false); return; }
      try {
        const result = await api<{ twoFactorRequired: boolean }>("/api/auth/reset-password-check", { method: "POST", body: JSON.stringify({ token: value }), signal: AbortSignal.any([check.signal, AbortSignal.timeout(15000)]) });
        if (!check.signal.aborted) { setFactor(result.twoFactorRequired); setValid(true); }
      } catch (reason) { if (!check.signal.aborted) setError(reason instanceof Error ? reason.message : "Error"); }
      finally { if (!check.signal.aborted) setChecking(false); }
    }
    const initial = setTimeout(readLink, 0);
    window.addEventListener("hashchange", readLink);
    return () => { clearTimeout(initial); abort?.abort(); window.removeEventListener("hashchange", readLink); };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !valid) return;
    if (password !== confirmation) { setError(ru ? "Пароли не совпадают." : "Passwords do not match."); return; }
    pending.current = true;
    const submittedToken = token;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password, code }), signal: AbortSignal.timeout(15000) });
      if (activeToken.current === submittedToken) { setPassword(""); setConfirmation(""); setCode(""); setToken(""); setDone(true); }
    } catch (reason) { if (activeToken.current === submittedToken) setError(reason instanceof Error ? reason.message : "Error"); }
    finally { if (activeToken.current === submittedToken) { pending.current = false; setBusy(false); } }
  }
  return <AccountShell back="/login" language={lang} backLabel={ru ? "Ко входу" : "Back to sign in"}>
    <div className="recovery-layout"><header className="recovery-heading"><span className="kicker">CS2 BOOST / NEW PASSWORD</span><h1>{done ? (ru ? "Доступ восстановлен" : "Account recovered") : (ru ? "Новый пароль" : "New password")}</h1><p>{ru ? "Используйте отдельный пароль для сайта. Пароль Steam здесь не нужен." : "Use a unique password for this website. Your Steam password is not needed here."}</p></header>
      <section className="account-panel recovery-panel"><span className="panel-icon">{done ? <Check size={23}/> : <KeyRound size={23}/>}</span>
        {checking ? <p role="status">{ru ? "Проверяем ссылку…" : "Checking your link…"}</p> : done ? <div className="recovery-result" role="status"><h2>{ru ? "Пароль изменён" : "Password changed"}</h2><p>{ru ? "Все старые входы закрыты. Теперь войдите с новым паролем; если включена 2FA, она продолжит работать." : "All previous sign-ins were closed. Sign in with your new password. If 2FA was enabled, it remains enabled."}</p><a className="compact-primary" href="/login">{ru ? "Войти в аккаунт" : "Sign in"}<ArrowRight size={17}/></a></div>
          : !valid ? <div className="recovery-result"><h2>{ru ? "Ссылка недоступна" : "Link unavailable"}</h2><p>{error || (ru ? "Откройте полную ссылку из письма. Если срок истёк или ссылка уже использована, запросите новую." : "Open the complete email link. If it expired or was already used, request a new one.")}</p><a className="compact-primary" href="/forgot-password">{ru ? "Получить новую ссылку" : "Request a new link"}</a></div>
          : <form className="recovery-form" onSubmit={submit}><label htmlFor="reset-password">{ru ? "Новый пароль" : "New password"}</label><PasswordInput id="reset-password" ru={ru} autoComplete="new-password" minLength={12} maxLength={128} required value={password} disabled={busy} onChange={event => setPassword(event.target.value)}/><small>{ru ? "От 12 до 128 символов." : "12–128 characters."}</small><label htmlFor="reset-confirmation">{ru ? "Повторите пароль" : "Confirm password"}</label><PasswordInput id="reset-confirmation" ru={ru} autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)}/>{factor && <><label htmlFor="reset-factor">{ru ? "Код приложения или резервный код" : "Authenticator or recovery code"}</label><Input id="reset-factor" autoComplete="one-time-code" maxLength={32} required value={code} disabled={busy} onChange={event => setCode(event.target.value)}/><small>{ru ? "Без этого кода двухфакторная защита не позволит сменить пароль." : "Two-factor protection requires this code to reset your password."}</small></>}{error && <p className="error" role="alert">{error}</p>}<Button className="account-cta" disabled={busy}>{busy ? (ru ? "Сохраняем…" : "Saving…") : (ru ? "Сохранить новый пароль" : "Save new password")}<ArrowRight size={17}/></Button></form>}
      </section><aside className="recovery-notes"><div><strong>{ru ? "Без автоматического входа" : "Sign in again"}</strong><p>{ru ? "Восстановление меняет пароль и закрывает старые сеансы. Для доступа к заказам войдите заново." : "A reset changes the password and ends old sessions. Sign in again to access your orders."}</p></div></aside>
    </div>
  </AccountShell>;
}
