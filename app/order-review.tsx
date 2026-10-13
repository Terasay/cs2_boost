"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { BadgeCheck, Pencil, Star } from "lucide-react";
import { api } from "./account-ui";
import { ReviewCard } from "./review-cards";
import type { OrderReview } from "@/lib/reviews";
import type { Order } from "./order-controls";

export function OrderReviewPanel({ id, order, review, admin, ru, onSaved }: { id: string; order: Order; review: OrderReview | null; admin: boolean; ru: boolean; onSaved: (review: OrderReview) => void }) {
  const ratingId = useId();
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [authorName, setAuthorName] = useState(review?.authorName ?? "");
  const [body, setBody] = useState(review?.body ?? "");
  const [version, setVersion] = useState(review?.updatedAt ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  if (order.status !== "completed") return null;
  const lang = ru ? "ru" : "en";
  const endpoint = `/api/orders/${order.id}/review`;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const result = await api<{ review: OrderReview }>(endpoint, { method: "POST", signal: AbortSignal.timeout(15000), body: JSON.stringify({ rating, authorName, body, updatedAt: version }) });
      onSaved(result.review); setVersion(result.review.updatedAt); setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setBusy(false); }
  }
  async function visibility() {
    if (!review || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { const result = await api<{ review: OrderReview }>(endpoint, { method: "PATCH", signal: AbortSignal.timeout(15000), body: JSON.stringify({ published: !review.published, updatedAt: review.updatedAt }) }); onSaved(result.review); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Error"); }
    finally { pending.current = false; setBusy(false); }
  }
  function edit() { if (!review) return; setRating(review.rating); setAuthorName(review.authorName); setBody(review.body); setVersion(review.updatedAt); setError(""); setEditing(true); }
  return <section className="order-review" id={id} aria-label={ru ? "Отзыв о заказе" : "Order review"}>
    <div className="order-review-heading"><BadgeCheck size={20}/><h2>{admin ? (ru ? "Отзыв клиента" : "Client review") : review ? (ru ? "Ваш отзыв" : "Your review") : (ru ? "Как всё прошло?" : "How did it go?")}</h2></div>
    {error && <p className="error" role="alert">{error}</p>}
    {review && (admin || !editing) && <><ReviewCard review={{ ...review, platform: order.platform, service: order.service }} lang={lang}/><p className="review-public-state">{review.published ? (ru ? "Опубликован на сайте" : "Published on the website") : (ru ? "Отзыв сохранён, но скрыт на сайте администратором." : "Saved, but hidden on the website by an admin.")}</p>{admin ? <button className="secondary-action" type="button" disabled={busy} onClick={visibility}>{review.published ? (ru ? "Скрыть на сайте" : "Hide on the website") : (ru ? "Показать на сайте" : "Show on the website")}</button> : <button className="secondary-action" type="button" onClick={edit}><Pencil size={14}/>{ru ? "Изменить отзыв" : "Edit review"}</button>}</>}
    {admin && !review && <p className="inspector-note">{ru ? "Клиент может оставить отзыв из этого заказа." : "The client can leave a review from this order."}</p>}
    {!admin && editing && <form className="review-form" onSubmit={save}>
      <fieldset className="review-rating"><legend>{ru ? "Ваша оценка" : "Your rating"}</legend><div>{[1, 2, 3, 4, 5].map(value => <label key={value} title={ru ? `${value} из 5` : `${value} out of 5`}><input type="radio" name={ratingId} value={value} checked={rating === value} disabled={busy} onChange={() => setRating(value)} aria-label={ru ? `${value} из 5` : `${value} out of 5`}/><Star size={23} aria-hidden="true" className={value <= rating ? "filled" : ""}/></label>)}</div></fieldset>
      <label>{ru ? "Публичный ник" : "Public nickname"}<input type="text" autoComplete="nickname" required minLength={2} maxLength={40} value={authorName} disabled={busy} onChange={event => setAuthorName(event.target.value)}/></label>
      <label>{ru ? "Ваш отзыв" : "Your review"}<textarea required minLength={10} maxLength={1500} rows={5} value={body} disabled={busy} onChange={event => setBody(event.target.value)} placeholder={ru ? "Что понравилось и что можно улучшить?" : "What worked well, and what could be improved?"}/></label>
      <small>{body.length} / 1500 · {ru ? "Отзыв публикуется на сайте. Не указывайте пароли, контакты и платёжные данные." : "Your review is published on the website. Do not include passwords, contact or payment details."}</small>
      <div className="review-form-actions"><button className="compact-primary" type="submit" disabled={busy || authorName.trim().length < 2 || body.trim().length < 10}>{busy ? (ru ? "Сохраняем…" : "Saving…") : review ? (ru ? "Сохранить отзыв" : "Save review") : (ru ? "Опубликовать отзыв" : "Publish review")}</button>{review && <button className="secondary-action" type="button" disabled={busy} onClick={() => setEditing(false)}>{ru ? "Отмена" : "Cancel"}</button>}</div>
    </form>}
  </section>;
}
