"use client";

import { Check, TicketPercent } from "lucide-react";
import { money, normalizePromo, type Price } from "@/lib/pricing.mjs";

export function PromoInput({ value, onChange, ru }: { value: string; onChange: (value: string) => void; ru: boolean }) {
  let valid = false;
  try { valid = Boolean(normalizePromo(value)); } catch {}
  return <div className="promo-field"><label><span><TicketPercent size={16}/>{ru ? "Промокод" : "Promo code"}</span><input value={value} maxLength={32} autoComplete="off" placeholder={ru ? "Введите промокод" : "Enter a code"} onChange={event => onChange(event.target.value)}/></label>{value.trim() && <small className={valid ? "promo-valid" : "promo-invalid"}>{valid ? <><Check size={13}/>{ru ? "Скидка 20% применена" : "20% discount applied"}</> : (ru ? "Промокод не найден" : "Code not found")}</small>}</div>;
}

export function PriceSummary({ price, ru, problem }: { price: Price | null; ru: boolean; problem?: string }) {
  const lang = ru ? "ru" : "en";
  return <div className="price-summary" aria-live="polite">{price?.totalAmount !== null && price?.totalAmount !== undefined ? <><dl><div><dt>{ru ? "Буст рейтинга" : "Rating boost"}</dt><dd>{money(price.baseAmount!, lang)}</dd></div>{price.surchargeAmount > 0 && <div><dt>{ru ? "Красный траст · +10%" : "Red trust · +10%"}</dt><dd>+{money(price.surchargeAmount, lang)}</dd></div>}{price.promoCode && <div className="price-discount"><dt>{price.promoCode} · −20%</dt><dd>−{money(price.discountAmount, lang)}</dd></div>}</dl><div className="price-total"><span>{ru ? "Итого" : "Total"}</span><strong>{money(price.totalAmount, lang)}</strong></div><div className="price-duration"><span>{ru ? "Срок выполнения" : "Delivery time"}</span><b>{price.durationDays} {ru ? "дн." : "days"}</b></div><p>{ru ? "Таймер начнётся после подтверждения оплаты и передачи данных." : "The timer starts after payment is confirmed and account details are submitted."}</p></> : <><div className="price-total"><span>{ru ? "Стоимость" : "Price"}</span><strong>{price ? (ru ? "По согласованию" : "By agreement") : "—"}</strong></div><p className={problem ? "price-problem" : undefined}>{problem || (price ? (ru ? "Для калибровки администратор предложит цену и срок. Подтвердите их до оплаты. Промокод даст скидку 20% на предложение." : "For calibration, an admin proposes a price and duration for you to accept before paying. A promo code takes 20% off the offer.") : (ru ? "Введите рейтинг и цель, чтобы увидеть цену и срок." : "Enter your current and target rating to see the price and duration."))}</p></>}</div>;
}
