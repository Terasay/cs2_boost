"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Crosshair } from "lucide-react";
import { readStorage } from "@/lib/browser-storage";
import { ratingValue } from "@/lib/order-validation";

export type User = { id: string; email: string; role: "client" | "admin" };
export type Draft = { platform: "premier" | "faceit"; service: "rating" | "calibration"; method: "duo" | "piloted"; current: number | null; target: number | null };

export function readDraft(): Draft | null {
  try {
    const value = JSON.parse(readStorage("sessionStorage", "cs2-draft") ?? "null");
    if (!value || !["premier", "faceit"].includes(value.platform) || !["rating", "calibration"].includes(value.service) || !["duo", "piloted"].includes(value.method)) return null;
    if (value.service === "rating" && (ratingValue(value.current) === null || ratingValue(value.target) === null || value.target <= value.current)) return null;
    return value as Draft;
  } catch { return null; }
}

export function useLanguage() {
  const [lang, setLang] = useState<"ru" | "en">("ru");
  useEffect(() => { const timer = setTimeout(() => { const saved = readStorage("localStorage", "cs2-lang"); if (saved === "en") setLang("en"); document.documentElement.lang = saved === "en" ? "en" : "ru"; }, 0); return () => clearTimeout(timer); }, []);
  return lang;
}

export function AccountShell({ children, back, backLabel, workspace = false }: { children: React.ReactNode; back?: string; backLabel?: string; workspace?: boolean }) {
  const lang = useLanguage();
  return <div className={workspace ? "account-page workspace-shell" : "account-page"}><header className="account-header wrap"><a href={`/${lang}`} className="brand"><span className="brand-mark"><Crosshair size={22}/></span>CS2<span>BOOST</span></a><a href={back ?? `/${lang}`} className="account-back"><ArrowLeft size={17}/>{backLabel ?? (lang === "ru" ? "На главную" : "Home")}</a></header><main className="account-main wrap">{children}</main></div>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const errorMessages: Record<string, string> = {
  "Sign in required": "Войдите в аккаунт, чтобы продолжить.",
  "Incorrect email or password": "Неверный email или пароль.",
  "Incorrect current password": "Текущий пароль указан неверно.",
  "This email is already registered": "Этот email уже зарегистрирован. Войдите в аккаунт.",
  "Enter a valid email": "Укажите корректный email.",
  "Password must be 12–128 characters": "Пароль должен содержать от 12 до 128 символов.",
  "New password must be 12–128 characters": "Новый пароль должен содержать от 12 до 128 символов.",
  "Choose a different password": "Придумайте пароль, отличающийся от текущего.",
  "Order not found": "Заказ не найден или недоступен этому аккаунту.",
  "Conversation not found": "Переписка не найдена или недоступна этому аккаунту.",
  "Order changed. Refresh and review the latest terms": "Условия заказа изменились. Обновите их и проверьте перед подтверждением.",
  "Order cannot be accepted": "Предложение уже изменено или принято. Обновите страницу.",
  "Send a new quote to change accepted terms": "Для изменения согласованной цены или срока выберите статус «Предложение готово». Клиент должен подтвердить новые условия.",
  "Price and deadline are required for a quote": "Для предложения укажите цену и дату завершения.",
  "Invalid price": "Укажите целую сумму от 0 до 100 000 000 ₸.",
  "Invalid deadline": "Укажите существующую дату завершения.",
  "Enter valid ratings": "Укажите целый рейтинг от 0 до 100 000. Цель должна быть выше текущего.",
  "Message must be 1–2000 characters": "Сообщение должно содержать от 1 до 2000 символов.",
};

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const ru = readStorage("localStorage", "cs2-lang") !== "en";
  let response: Response;
  try { response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...options?.headers } }); }
  catch { throw new ApiError(ru ? "Нет связи с сервером. Проверьте подключение и повторите попытку." : "Cannot reach the server. Check your connection and try again.", 0); }
  const data = await response.json().catch(() => null) as ({ error?: string } & T) | null;
  if (!response.ok || !data) {
    const message = typeof data?.error === "string" ? data.error : "Request failed";
    const fallback = response.status === 429 ? "Слишком много попыток. Попробуйте немного позже." : response.status === 403 ? "У этого аккаунта нет доступа к действию." : "Не удалось выполнить запрос. Попробуйте ещё раз.";
    throw new ApiError(ru ? errorMessages[message] ?? fallback : message, response.status);
  }
  return data;
}

export const statusLabels: Record<string, { ru: string; en: string }> = {
  new: { ru: "Новая заявка", en: "New request" },
  quoted: { ru: "Предложение готово", en: "Quote ready" },
  awaiting_payment: { ru: "Ожидает оплаты", en: "Awaiting payment" },
  in_progress: { ru: "В работе", en: "In progress" },
  completed: { ru: "Завершён", en: "Completed" },
  cancelled: { ru: "Отменён", en: "Cancelled" },
};

export function describeOrder(order: { platform: string; service: string; method: string; currentRating?: number | null; targetRating?: number | null }, lang: "ru" | "en") {
  const service = order.service === "rating" ? (lang === "ru" ? "Буст рейтинга" : "Rating boost") : (lang === "ru" ? "Калибровка" : "Calibration");
  const method = order.method === "duo" ? (lang === "ru" ? "игра вместе" : "play together") : (lang === "ru" ? "на аккаунте" : "piloted");
  const rating = order.service === "rating" ? ` · ${order.currentRating ?? "—"} → ${order.targetRating ?? "—"}` : "";
  return `${order.platform.toUpperCase()} · ${service} · ${method}${rating}`;
}
