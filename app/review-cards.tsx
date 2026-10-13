import { BadgeCheck, Quote, Star } from "lucide-react";
import type { PublicReview, ReviewPage } from "@/lib/reviews";

export function ReviewStars({ rating, ru }: { rating: number; ru: boolean }) {
  return <span className="review-stars" aria-label={ru ? `${rating} из 5` : `${rating} out of 5`}>{[1, 2, 3, 4, 5].map(value => <Star key={value} size={16} aria-hidden="true" className={value <= rating ? "filled" : ""}/>)}</span>;
}

export function ReviewCard({ review, lang }: { review: PublicReview; lang: "ru" | "en" }) {
  const ru = lang === "ru";
  return <article className="review-card">
    <header><div className="review-author"><span className="review-avatar" aria-hidden="true">{Array.from(review.authorName)[0]?.toUpperCase()}</span><div><strong>{review.authorName}</strong><small>{review.platform.toUpperCase()} · {review.service === "calibration" ? (ru ? "Калибровка" : "Calibration") : (ru ? "Буст рейтинга" : "Rating boost")}</small></div></div><ReviewStars rating={review.rating} ru={ru}/></header>
    <p className="review-body">{review.body.length > 300 ? review.body.slice(0, 260) + "…" : review.body}</p>
    {review.body.length > 300 && <details className="review-full"><summary>{ru ? "Читать полностью" : "Read full review"}</summary><p className="review-body">{review.body}</p></details>}
    <footer><span><BadgeCheck size={14}/>{ru ? "Заказ выполнен" : "Completed order"}</span><time dateTime={new Date(review.createdAt).toISOString()}>{new Intl.DateTimeFormat(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Qyzylorda" }).format(review.createdAt)}</time></footer>
  </article>;
}

export function ReviewsSection({ report, lang, full = false }: { report: ReviewPage; lang: "ru" | "en"; full?: boolean }) {
  const ru = lang === "ru";
  return <section className="tactical-section reviews-section" id="reviews"><div className="wrap">
    <div className="section-heading"><div><span className="kicker">CS2 BOOST / REVIEWS</span>{full ? <h1>{ru ? "Отзывы игроков" : "Player reviews"}</h1> : <h2>{ru ? "После последнего матча." : "After the final match."}</h2>}<p>{ru ? "Отзывы клиентов по выполненным заказам Premier, FACEIT и калибровке." : "Client feedback on completed Premier, FACEIT and calibration orders."}</p></div>
      {report.total > 0 && <div className="reviews-score"><strong>{report.average?.toLocaleString(ru ? "ru-RU" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>/ 5</small></strong><span>{ru ? "Всего отзывов" : "Total reviews"}: {report.total}</span></div>}
    </div>
    {report.reviews.length ? <div className="reviews-grid">{report.reviews.map(review => <ReviewCard key={review.id} review={review} lang={lang}/>)}</div> : <div className="reviews-empty"><Quote size={28}/><div><strong>{ru ? "Свой опыт — своими словами." : "Your experience, in your words."}</strong><p>{ru ? "После выполнения заказа в кабинете можно оставить оценку и отзыв. Они появятся здесь." : "After your order is completed, leave a rating and review in your account. They will appear here."}</p></div></div>}
    <div className="reviews-footer"><span><BadgeCheck size={15}/>{ru ? "Оставить отзыв может клиент выполненного заказа." : "Only the client of a completed order can post a review."}</span>{!full && <a className="module-link" href={`/${lang}/reviews`}>{ru ? "Все отзывы" : "All reviews"} →</a>}</div>
    {full && report.pages > 1 && <nav className="reviews-pagination" aria-label={ru ? "Страницы отзывов" : "Review pages"}>{report.page > 1 && <a href={`/${lang}/reviews?page=${report.page - 1}`}>← {ru ? "Назад" : "Previous"}</a>}<span>{report.page} / {report.pages}</span>{report.page < report.pages && <a href={`/${lang}/reviews?page=${report.page + 1}`}>{ru ? "Дальше" : "Next"} →</a>}</nav>}
  </div></section>;
}
