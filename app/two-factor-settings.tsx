"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "./account-ui";

type Status = { enabled: boolean; recoveryRemaining: number };
type Setup = { secret: string; qr: string; expiresIn: number };
type Result = { enabled: boolean; recoveryCodes: string[] };

export function TwoFactorSettings({ lang, onChange, revision }: { lang: "ru" | "en"; onChange: (enabled: boolean) => void; revision: number }) {
  const t = (ru: string, en: string) => lang === "ru" ? ru : en;
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<"" | "setup" | "disable" | "recovery">("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    api<Status>("/api/auth/two-factor", { signal: abort.signal }).then(setStatus).catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Error"); });
    return () => abort.abort();
  }, [revision]);

  function open(next: typeof mode) { setMode(next); setPassword(""); setCode(""); setSetup(null); setError(""); setNote(""); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (mode === "setup" && !setup) {
        setSetup(await api<Setup>("/api/auth/two-factor-setup", { method: "POST", body: JSON.stringify({ password }) }));
      } else {
        const action = mode === "setup" ? "enable" : mode;
        const result = await api<Result>(`/api/auth/two-factor-${action}`, { method: "POST", body: JSON.stringify({ password, code }) });
        setStatus({ enabled: result.enabled, recoveryRemaining: result.recoveryCodes.length });
        onChange(result.enabled);
        setCodes(result.recoveryCodes); setSaved(false); setSetup(null); setMode(""); setPassword(""); setCode("");
        setNote(action === "recovery" ? t("Новые резервные коды созданы. Другие устройства вышли из аккаунта.", "New recovery codes created. Other devices have been signed out.") : result.enabled ? t("Защита включена. Другие устройства вышли из аккаунта.", "Protection is enabled. Other devices have been signed out.") : t("Двухфакторная защита отключена. Другие устройства вышли из аккаунта.", "Two-factor protection is disabled. Other devices have been signed out."));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { setBusy(false); }
  }

  function download() {
    const blob = new Blob([`CS2 BOOST — ${t("резервные коды", "recovery codes")}\n\n${codes.join("\n")}\n\n${t("Каждый код используется один раз. Храните отдельно от пароля.", "Each code can be used once. Keep these separate from your password.")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "cs2-boost-recovery-codes.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="account-panel two-factor-panel"><div className="two-factor-title"><ShieldCheck className="security-icon" size={27}/><span className={status?.enabled ? "mfa-badge enabled" : "mfa-badge"}>{status ? (status.enabled ? t("Включена", "Enabled") : t("Выключена", "Disabled")) : t("Загрузка…", "Loading…")}</span></div><h2>{t("Двухфакторная защита", "Two-factor protection")}</h2><p>{t("Подтверждайте вход кодом из приложения на телефоне. Подойдут Google Authenticator и другие приложения с поддержкой TOTP.", "Confirm sign-ins with a code from an authenticator app. Google Authenticator and other TOTP apps are supported.")}</p>
    {status?.enabled && <p className="mfa-remaining">{t("Осталось резервных кодов:", "Recovery codes remaining:")} <strong>{status.recoveryRemaining}</strong></p>}
    {note && <p className="success-note" role="status">{note}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {codes.length > 0 ? <div className="mfa-recovery"><h3>{t("Сохраните резервные коды", "Save your recovery codes")}</h3><p>{t("Они помогут войти, если телефон недоступен. Каждый работает один раз. Эти коды показываются только сейчас; предыдущий набор больше не действует.", "Use these when your phone is unavailable. Each works once. These are shown only now; any previous set is invalid.")}</p><div className="mfa-code-grid">{codes.map(value => <code key={value}>{value}</code>)}</div><Button type="button" variant="secondary" className="account-cta" onClick={download}><Download size={16}/>{t("Скачать коды", "Download codes")}</Button><label className="mfa-check"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)}/>{t("Я сохранил резервные коды в безопасном месте", "I saved the recovery codes somewhere safe")}</label><Button type="button" className="account-cta" disabled={!saved} onClick={() => { setCodes([]); setSaved(false); }}>{t("Готово", "Done")}</Button></div> : mode ? <form className="mfa-form" onSubmit={submit}>
      <h3>{mode === "setup" ? t("Подключение приложения", "Connect an app") : mode === "disable" ? t("Отключение защиты", "Disable protection") : t("Новый набор резервных кодов", "New recovery codes")}</h3>
      {!setup && <><label htmlFor="mfa-password">{t("Текущий пароль", "Current password")}</label><Input id="mfa-password" type="password" autoComplete="current-password" maxLength={128} required value={password} onChange={event => setPassword(event.target.value)}/></>}
      {setup && <><ol className="mfa-steps"><li>{t("Установите Google Authenticator на телефон.", "Install Google Authenticator on your phone.")}</li><li>{t("В приложении нажмите «+» → «Сканировать QR-код».", "In the app, tap + → Scan a QR code.")}</li><li>{t("Отсканируйте код ниже и введите шесть цифр из приложения.", "Scan the QR below and enter the six digits from the app.")}</li></ol><div className="mfa-qr"><Image src={setup.qr} alt={t("QR-код подключения двухфакторной защиты", "QR code to connect an authenticator")} width={260} height={260} unoptimized/></div><details className="mfa-manual"><summary>{t("Не получается отсканировать?", "Cannot scan the QR?")}</summary><p>{t("Добавьте ключ вручную: имя CS2 BOOST, тип — по времени.", "Enter the key manually: name CS2 BOOST, type — time based.")}</p><code>{setup.secret}</code></details><p className="mfa-hint">{t("Подключение действует 10 минут. QR-код и ключ предназначены только для вас.", "Setup expires in 10 minutes. Keep the QR code and key private.")}</p></>}
      {(setup || mode !== "setup") && <><label htmlFor="mfa-code">{mode === "setup" ? t("Код из приложения", "Authenticator code") : t("Код приложения или резервный код", "Authenticator or recovery code")}</label><Input id="mfa-code" type="text" inputMode={mode === "setup" ? "numeric" : "text"} autoComplete="one-time-code" maxLength={mode === "setup" ? 6 : 32} pattern={mode === "setup" ? "[0-9]{6}" : undefined} required value={code} onChange={event => setCode(event.target.value)}/><small>{t("Уже использованный код не принимается. Дождитесь следующих цифр в приложении.", "A used code is not accepted again. Wait for the next code in the app.")}</small></>}
      {mode === "recovery" && <p>{t("Предыдущие резервные коды перестанут работать.", "Your previous recovery codes will stop working.")}</p>}
      <Button className="account-cta" disabled={busy}>{busy ? "…" : mode === "setup" ? (setup ? t("Включить защиту", "Enable protection") : t("Показать QR-код", "Show QR code")) : mode === "disable" ? t("Отключить защиту", "Disable protection") : t("Создать новые коды", "Generate new codes")}</Button><Button type="button" variant="ghost" className="account-cta" disabled={busy} onClick={() => open("")}>{t("Отмена", "Cancel")}</Button>
    </form> : status && <div className="mfa-actions">{status.enabled ? <><Button type="button" variant="secondary" className="account-cta" onClick={() => open("recovery")}>{t("Обновить резервные коды", "Replace recovery codes")}</Button><Button type="button" variant="ghost" className="account-cta" onClick={() => open("disable")}>{t("Отключить защиту", "Disable protection")}</Button></> : <Button type="button" className="account-cta" onClick={() => open("setup")}>{t("Подключить приложение", "Connect an app")}</Button>}</div>}
  </section>;
}
