"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountShell, api, type User, useLanguage } from "../account-ui";
import { TwoFactorSettings } from "../two-factor-settings";

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
    api<{ user: User | null }>("/api/auth/me").then(result => {
      if (!result.user) window.location.assign("/login");
      else setUser(result.user);
    }).catch(reason => setError(reason instanceof Error ? reason.message : "Error"));
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

  return <AccountShell back="/dashboard" backLabel={t("К заказам", "Back to orders")}><div className="account-intro"><span className="kicker">CS2 BOOST / {t("АККАУНТ", "ACCOUNT")}</span><h1>{t("Безопасность аккаунта", "Account security")}</h1><p>{user?.email || t("Загружаем данные…", "Loading account…")}</p></div><div className="account-grid"><form className="account-panel" onSubmit={changePassword}><KeyRound className="security-icon" size={27}/><h2>{t("Сменить пароль", "Change password")}</h2><label htmlFor="current-password">{t("Текущий пароль", "Current password")}</label><Input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)}/><label htmlFor="new-password">{t("Новый пароль", "New password")}</label><Input id="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)}/><small>{t("Не менее 12 символов.", "At least 12 characters.")}</small><label htmlFor="confirm-password">{t("Повторите новый пароль", "Confirm new password")}</label><Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)}/>{user?.twoFactorEnabled && <><label htmlFor="password-factor">{t("Код приложения или резервный код", "Authenticator or recovery code")}</label><Input id="password-factor" type="text" autoComplete="one-time-code" maxLength={32} required value={factorCode} onChange={event => setFactorCode(event.target.value)}/><small>{t("Введите новый код, который ещё не использовали.", "Enter a fresh code that has not been used.")}</small></>}{error && <p className="error" role="alert">{error}</p>}{success && <p className="success-note" role="status">{success}</p>}<Button className="account-cta" disabled={busy||!user}>{t("Сохранить пароль", "Save password")}</Button></form><section className="account-panel security-panel"><ShieldCheck className="security-icon" size={27}/><h2>{t("Активные входы", "Active sessions")}</h2><p>{t("Вы можете завершить все входы на других устройствах. Текущая сессия тоже закроется.", "You can end all sign-ins on other devices. This session will close too.")}</p><Button type="button" variant="secondary" className="account-cta" disabled={busy || !user} onClick={signOutEverywhere}><LogOut size={17}/>{t("Выйти везде", "Sign out everywhere")}</Button></section>{user?.role === "admin" && <TwoFactorSettings lang={lang} revision={revision} onChange={enabled => { setUser(previous => previous ? { ...previous, twoFactorEnabled: enabled } : previous); setFactorCode(""); }} />}</div></AccountShell>;
}
