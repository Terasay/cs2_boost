"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Crosshair } from "lucide-react";

export type User = { id: string; email: string; role: "client" | "admin" };
export type Draft = { platform: "premier" | "faceit"; service: "rating" | "calibration"; method: "duo" | "piloted"; current: number | null; target: number | null };

export function useLanguage() {
  const [lang, setLang] = useState<"ru" | "en">("ru");
  useEffect(() => { const timer = setTimeout(() => { const saved = localStorage.getItem("cs2-lang"); if (saved === "en") setLang("en"); }, 0); return () => clearTimeout(timer); }, []);
  return lang;
}

export function AccountShell({ children, back = "/", backLabel }: { children: React.ReactNode; back?: string; backLabel?: string }) {
  const lang = useLanguage();
  return <div className="account-page"><header className="account-header wrap"><a href="/" className="brand"><span className="brand-mark"><Crosshair size={22}/></span>CS2<span>BOOST</span></a><a href={back} className="account-back"><ArrowLeft size={17}/>{backLabel ?? (lang === "ru" ? "На главную" : "Home")}</a></header><main className="account-main wrap">{children}</main></div>;
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const data = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
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
