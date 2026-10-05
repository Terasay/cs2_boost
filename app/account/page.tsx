"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LogOut, Monitor, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountShell, api, type User, useLanguage } from "../account-ui";
import { TwoFactorSettings } from "../two-factor-settings";
import { WorkspaceNav } from "../workspace-ui";
import { PasswordInput } from "../password-input";

export default function Account() {
  const lang = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [factorCode, setFactorCode] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;

  useEffect(() => {
    const abort = new AbortController();
    api<{ user: User | null }>("/api/auth/me", { signal: abort.signal }).then(result => {
      if (!result.user) window.location.assign("/login");
      else setUser(result.user);
    }).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Error"); });
    return () => abort.abort();
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(busy||!user)return;
    setError("");
    setSuccess("");
    if (newPassword !== confirmPassword) { setError(t("Новые пароли не совпадают.", "New passwords do not match.")); return; }
    setBusy(true);
    try {
      await api("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, code: factorCode }) });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFactorCode("");
      setRevision(value => value + 1);
      setSuccess(t("Пароль изменён. Все другие устройства вышли из аккаунта.", "Password changed. Other devices have been signed out."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function signOutEverywhere() {
    if(busy)return;
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/logout-all", { method: "POST" });
      window.location.assign("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Error");
      setBusy(false);
    }
  }

  return <AccountShell workspace back="/dashboard" backLabel={t("К заказам", "Back to orders")}>
    {user && <WorkspaceNav active="account" ru={lang === "ru"} admin={user.role === "admin"}/>}
    <header className="board-heading"><div><span className="kicker">CS2 BOOST / {t("АККАУНТ", "ACCOUNT")}</span><h1>{t("Безопасность аккаунта", "Account security")}</h1><p>{user?.email || t("Загружаем данные…", "Loading account…")}</p></div><span className="profile-role"><ShieldCheck size={16}/>{user ? (user.role === "admin" ? t("Администратор", "Administrator") : t("Клиент", "Client")) : "…"}</span></header>
    <div className={user?.role === "admin" ? "security-layout" : "security-layout compact-security"}>
      <form className="account-panel password-panel" onSubmit={changePassword}>
        <div className="panel-heading"><span className="panel-icon"><KeyRound size={21}/></span><div><h2>{t("Сменить пароль", "Change password")}</h2><p>{t("Используйте отдельный пароль для этого аккаунта.", "Use a unique password for this account.")}</p></div></div>
        <div className="security-fields">
          <div className="security-field full"><label htmlFor="current-password">{t("Текущий пароль", "Current password")}</label><PasswordInput ru={lang === "ru"} id="current-password" autoComplete="current-password" maxLength={128} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/></div>
          <div className="security-field"><label htmlFor="new-password">{t("Новый пароль", "New password")}</label><PasswordInput ru={lang === "ru"} id="new-password" autoComplete="new-password" aria-describedby="password-hint" minLength={12} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)}/><small id="password-hint">{t("От 12 до 128 символов.", "12 to 128 characters.")}</small></div>
          <div className="security-field"><label htmlFor="confirm-password">{t("Повторите пароль", "Confirm password")}</label><PasswordInput ru={lang === "ru"} id="confirm-password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/></div>
          {user?.twoFactorEnabled && <div className="security-field full"><label htmlFor="password-factor">{t("Код приложения или резервный код", "Authenticator or recovery code")}</label><Input id="password-factor" autoComplete="one-time-code" aria-describedby="factor-hint" maxLength={32} required value={factorCode} onChange={event => setFactorCode(event.target.value)}/><small id="factor-hint">{t("Введите новый код, который ещё не использовали.", "Enter a fresh code that has not been used.")}</small></div>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}{success && <p className="success-note" role="status">{success}</p>}
        <div className="security-form-footer"><small><ShieldCheck size={15}/>{t("Другие устройства выйдут из аккаунта после смены пароля.", "Other devices are signed out after a password change.")}</small><Button className="account-cta" disabled={busy || !user}>{busy ? t("Сохраняем…", "Saving…") : t("Сохранить пароль", "Save password")}<ArrowRight size={16}/></Button></div>
      </form>
      <div className="security-side">
        {user?.role === "admin" && <TwoFactorSettings lang={lang} revision={revision} onChange={enabled => { setUser(previous => previous ? { ...previous, twoFactorEnabled: enabled } : previous); setFactorCode(""); }}/>}
        <section className="account-panel security-panel"><div className="panel-heading"><span className="panel-icon"><Monitor size={21}/></span><div><h2>{t("Входы на устройствах", "Device sign-ins")}</h2><p>{t("Завершите все сессии, если входили с чужого устройства. Текущая сессия тоже закроется.", "End all sessions if you used another person's device. This session will close too.")}</p></div></div><Button type="button" variant="secondary" className="account-cta" disabled={busy || !user} onClick={signOutEverywhere}><LogOut size={17}/>{t("Выйти на всех устройствах", "Sign out on every device")}</Button></section>
      </div>
    </div>
  </AccountShell>;
}
