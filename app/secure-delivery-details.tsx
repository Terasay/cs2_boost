"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { api } from "./account-ui";
import type { AccessInfo, Order } from "./order-controls";

export function SecureOrderAccess({ order, admin, info, ru, onSaved }: { order: Order; admin: boolean; info: AccessInfo; ru: boolean; onSaved: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [friendCode, setFriendCode] = useState("");
  const [profile, setProfile] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const lifecycle = generation;
    const hide = () => { generation.current++; setRevealed(null); setShowPassword(false); setAdminPassword(""); };
    const visibility = () => { if (document.visibilityState !== "visible") hide(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { lifecycle.current++; document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => { setRevealed(null); setShowPassword(false); }, 60000);
    return () => clearTimeout(timer);
  }, [revealed]);
  useEffect(() => {
    const timer = setTimeout(() => { generation.current++; setRevealed(null); setShowPassword(false); setConfirmed(false); }, 0);
    return () => clearTimeout(timer);
  }, [info?.submittedAt, order.status]);
  if (!order.paidAt || !["awaiting_access", "in_progress"].includes(order.status)) return null;
  async function send(action: "submit" | "reveal" | "receive") {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    const current = generation.current;
    try {
      const values = action === "submit" ? { login, password, friendCode, profile, note } : {};
      const result = await api<{ access?: Record<string, string> }>(`/api/orders/${order.id}/access`, {
        method: "POST", signal: AbortSignal.timeout(15000), body: JSON.stringify({ action, ...values, ...(action === "reveal" ? { adminPassword } : {}), confirmed, updatedAt: order.updatedAt }),
      });
      if (action === "reveal") {
        if (generation.current === current && document.visibilityState === "visible") setRevealed(result.access || null);
      } else {
        setLogin(""); setPassword(""); setFriendCode(""); setProfile(""); setNote(""); setConfirmed(false); setEditing(false); setRevealed(null); setShowPassword(false);
        onSaved();
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setBusy(false); if (action === "reveal") setAdminPassword(""); }
  }
  const received = Boolean(info?.receivedAt);
  return <section className="secure-access"><h2><LockKeyhole size={17}/>{ru ? "Защищённая передача данных" : "Secure delivery details"}</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {info && <p className="saved-feedback"><Check size={14}/>{received ? (ru ? "Администратор подтвердил получение" : "Admin confirmed receipt") : (ru ? "Отправлено · ждём подтверждения администратора" : "Submitted · awaiting admin confirmation")}</p>}
    {admin ? info ? <>
      {revealed ? <><dl className="revealed-access">{Object.entries(revealed).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{({ login: ru ? "Логин Steam" : "Steam login", password: ru ? "Пароль Steam" : "Steam password", friendCode: ru ? "Код дружбы Steam" : "Steam friend code", profile: ru ? "Профиль" : "Profile", note: ru ? "Примечание" : "Note" } as Record<string, string>)[key] || key}</dt><dd>{key === "password" ? <div className="secret-value"><input type={showPassword ? "text" : "password"} readOnly value={value} autoComplete="off" aria-label={ru ? "Пароль Steam" : "Steam password"}/><button className="icon-button" type="button" aria-label={ru ? "Показать / скрыть пароль" : "Show / hide password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div> : value}</dd></div>)}</dl><button type="button" className="secondary-action" onClick={() => { generation.current++; setRevealed(null); setShowPassword(false); }}>{ru ? "Скрыть данные" : "Hide details"}</button></> : <form className="order-editor" onSubmit={event=>{event.preventDefault();void send("reveal");}}><label>{ru ? "Ваш пароль администратора" : "Your admin account password"}<input type="password" autoComplete="current-password" maxLength={256} value={adminPassword} required onChange={event=>setAdminPassword(event.target.value)}/></label><button type="submit" className="secondary-action" disabled={busy || !adminPassword}>{ru ? "Открыть данные на 60 секунд" : "Reveal details for 60 seconds"}</button></form>}
      {!received && <div className="access-receipt"><label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{ru ? "Данные проверены, можно начать выполнение" : "Details checked; delivery can begin"}</span></label><button type="button" className="compact-primary" disabled={busy || !confirmed} onClick={() => send("receive")}>{ru ? "Подтвердить получение" : "Confirm receipt"}</button><p className="inspector-note">{order.startedAt ? (ru ? "Обновление данных сохранит текущий срок." : "Updated details keep the existing deadline.") : (ru ? "Подтверждение запустит таймер выполнения." : "Confirmation starts the delivery timer.")}</p></div>}
    </> : <p className="inspector-note">{ru ? "Клиент ещё не передал данные либо срок их хранения истёк." : "Client details have not been submitted or their storage period has expired."}</p> : info && !editing ? <button type="button" className="secondary-action" onClick={() => { setEditing(true); setConfirmed(false); }}>{ru ? "Обновить данные" : "Update details"}</button> : <form className="order-editor" onSubmit={event => { event.preventDefault(); void send("submit"); }}>
      {order.method === "piloted" ? <><label>{ru ? "Логин Steam" : "Steam login"}<input autoComplete="off" maxLength={254} value={login} required onChange={event => setLogin(event.target.value)}/></label><label>{ru ? "Пароль Steam" : "Steam password"}<input type="password" autoComplete="new-password" maxLength={256} value={password} required onChange={event => setPassword(event.target.value)}/></label></> : <label>{ru ? "Код дружбы Steam" : "Steam friend code"}<input inputMode="numeric" pattern="[0-9]{1,12}" maxLength={12} autoComplete="off" value={friendCode} required onChange={event => setFriendCode(event.target.value)}/><small>{ru ? "Steam → Друзья → Добавить друга → Ваш код друга" : "Steam → Friends → Add a friend → Your friend code"}</small></label>}
      <label>{ru ? "Ссылка на профиль — необязательно" : "Profile link — optional"}<input value={profile} maxLength={500} onChange={event => setProfile(event.target.value)}/></label>
      <label>{order.method === "duo" ? (ru ? "Регион и удобное время — необязательно" : "Region and available times — optional") : (ru ? "Примечание — без кодов Steam Guard" : "Note — no Steam Guard codes")}<textarea value={note} rows={2} maxLength={1000} onChange={event => setNote(event.target.value)}/></label>
      <p className="inspector-note">{ru ? "Данные шифруются в базе и открываются только администрации. Не отправляйте пароль и коды Steam Guard в чат. После окончания заказа данные удаляются." : "Details are encrypted in the database and only admins can reveal them. Keep passwords and Steam Guard codes out of chat. Details are deleted when the order ends."}</p>
      <label className="trust-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{ru ? "Подтверждаю передачу этих данных исполнителю" : "I confirm sharing these details with the booster"}</span></label>
      <button className="compact-primary" type="submit" disabled={busy || !confirmed}>{busy ? (ru ? "Передаём…" : "Submitting…") : (ru ? "Передать на проверку" : "Submit for review")}</button>
      {editing && <button type="button" className="editor-discard" onClick={() => { setEditing(false); setPassword(""); setLogin(""); setFriendCode(""); setProfile(""); setNote(""); setConfirmed(false); }}>{ru ? "Отмена" : "Cancel"}</button>}
    </form>}
  </section>;
}
