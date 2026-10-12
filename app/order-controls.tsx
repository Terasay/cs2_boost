"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { dayMs, discountedAmount, money } from "@/lib/pricing.mjs";
import { OrderActionDialog } from "./order-action-dialog";

export type Order = {
  id: string;
  clientEmail: string;
  platform: string;
  service: string;
  method: string;
  currentRating: number | null;
  targetRating: number | null;
  status: string;
  quotedPrice: number | null;
  quotedCurrency: string | null;
  deadline: string | null;
  updatedAt: number;
  pricingVersion: number;
  redTrust: boolean;
  promoCode: string | null;
  baseAmount: number | null;
  surchargeAmount: number;
  discountAmount: number;
  totalAmount: number | null;
  initialTotalAmount: number | null;
  commissionAmount: number;
  durationDays: number | null;
  standardDays: number | null;
  acceptedAt: number | null;
  paidAt: number | null;
  startedAt: number | null;
  dueAt: number | null;
  completedAt: number | null;
  proposalAmount: number | null;
  proposalDays: number | null;
  proposalReason: string | null;
};
export type OrderEvent = {
  id: string;
  type: string;
  details: {
    reason?: string;
    bonus?: string;
    days?: number;
    totalAmount?: number;
    dueAt?: number;
  };
  createdAt: number;
};
export type AccessInfo = {
  submittedAt: number;
  expiresAt: number;
  receivedAt: number | null;
} | null;

type OrderAction = "propose" | "delay" | "cancel" | "refund" | "complete";

const actionLabels = {
  propose: {
    ru: { title: "Предложение клиенту", confirm: "Отправить предложение" },
    en: { title: "Offer to the client", confirm: "Send offer" },
  },
  delay: {
    ru: { title: "Задержка и бонус", confirm: "Сохранить новый срок" },
    en: { title: "Delay and bonus", confirm: "Save new deadline" },
  },
  cancel: {
    ru: { title: "Отмена заявки", confirm: "Подтвердить отмену" },
    en: { title: "Cancel request", confirm: "Confirm cancellation" },
  },
  refund: {
    ru: { title: "Подтверждение возврата", confirm: "Зафиксировать возврат" },
    en: { title: "Confirm refund", confirm: "Record refund" },
  },
  complete: {
    ru: { title: "Завершение заказа", confirm: "Подтвердить завершение" },
    en: { title: "Complete order", confirm: "Confirm completion" },
  },
} satisfies Record<
  OrderAction,
  Record<"ru" | "en", { title: string; confirm: string }>
>;

export function OrderTimer({ order, ru }: { order: Order; ru: boolean }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!order.startedAt || !order.dueAt || order.status !== "in_progress")
      return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [order.startedAt, order.dueAt, order.status]);
  if (!order.startedAt || !order.dueAt)
    return (
      <p className="inspector-note">
        <Clock3 size={15} />
        {ru
          ? "Срок отсчитывается после оплаты и подтверждения данных администратором."
          : "Delivery time starts after payment and admin confirmation of the details."}
      </p>
    );
  const remaining = order.dueAt - (now || order.startedAt);
  const overdue = remaining < 0 && order.status === "in_progress";
  const days = Math.floor(Math.abs(remaining) / dayMs);
  const hours = Math.floor(Math.abs(remaining) / 3600000) % 24;
  const minutes = Math.floor(Math.abs(remaining) / 60000) % 60;
  const finished = order.status === "completed" || order.status === "cancelled";
  return (
    <div className={`delivery-timer ${overdue ? "overdue" : ""}`}>
      <span>
        <Clock3 size={16} />
        {finished
          ? ru
            ? "Выполнение завершено"
            : "Delivery ended"
          : overdue
            ? ru
              ? "Задержка выполнения"
              : "Delivery overdue"
            : ru
              ? "До завершения"
              : "Time remaining"}
      </span>
      {!finished && (
        <strong>
          {days}
          {ru ? "д" : "d"} {hours}
          {ru ? "ч" : "h"} {minutes}
          {ru ? "м" : "m"}
        </strong>
      )}
      <small>
        {ru ? "Срок:" : "Due:"}{" "}
        {new Date(order.dueAt).toLocaleString(ru ? "ru-RU" : "en-US")}
      </small>
      {overdue && (
        <p>
          {ru
            ? "Напишите администратору в чат для уточнения срока и бонуса."
            : "Contact the admin about the delay and a possible bonus."}
        </p>
      )}
    </div>
  );
}

export function OrderActions({
  order,
  admin,
  ru,
  busy,
  error,
  run,
}: {
  order: Order;
  admin: boolean;
  ru: boolean;
  busy: boolean;
  error: string;
  run: (action: string, values?: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<OrderAction | null>(null);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("");
  const [reason, setReason] = useState("");
  const [bonus, setBonus] = useState("");
  const [version, setVersion] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const lang = ru ? "ru" : "en";
  const currency =
    order.quotedCurrency || (order.pricingVersion ? "RUB" : "KZT");
  const total =
    order.totalAmount ??
    (order.quotedPrice === null ? null : order.quotedPrice * 100);
  const beforePayment = ["new", "quoted", "awaiting_payment"].includes(
    order.status,
  );
  const proposal =
    order.proposalAmount === null
      ? null
      : discountedAmount(order.proposalAmount, order.promoCode);
  const labels = mode ? actionLabels[mode][lang] : null;
  const requiresConfirmation = mode === "refund" || mode === "complete";
  function open(value: OrderAction) {
    setMode(value);
    setAmount(String(((total ?? 0) + order.discountAmount) / 100));
    setDays(String(order.durationDays || 1));
    setReason("");
    setBonus("");
    setVersion(order.updatedAt);
    setConfirmed(false);
    setFailed(false);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!mode || busy || version !== order.updatedAt) return;
    setFailed(false);
    const values =
      mode === "propose"
        ? {
            amount: Math.round(Number(amount) * 100),
            days: Number(days),
            reason,
          }
        : mode === "delay"
          ? { days: Number(days), reason, bonus }
          : { reason, confirmed };
    if (await run(mode, { ...values, updatedAt: version })) setMode(null);
    else setFailed(true);
  }
  return (
    <div className="order-actions-panel">
      {order.status === "new" && (
        <p className="inspector-note">
          {admin
            ? ru
              ? "Проверьте параметры. Принятие откроет клиенту оплату по сохранённой цене."
              : "Review the details. Acceptance opens payment at the saved price."
            : ru
              ? "Администратор проверяет заявку. До принятия оплачивать её не нужно."
              : "An admin is reviewing the request. Wait for acceptance before paying."}
        </p>
      )}
      {order.status === "quoted" && proposal && (
        <div className="pending-proposal">
          <b>
            {ru
              ? "Новые условия на подтверждении"
              : "New terms awaiting acceptance"}
          </b>
          <p>{order.proposalReason}</p>
          <dl>
            <div>
              <dt>{ru ? "Сейчас" : "Current"}</dt>
              <dd>{total === null ? "—" : money(total, lang, currency)}</dd>
            </div>
            <div>
              <dt>{ru ? "Предложено" : "Proposed"}</dt>
              <dd>
                {money(proposal.totalAmount, lang, currency)} ·{" "}
                {order.proposalDays} {ru ? "дн." : "days"}
              </dd>
            </div>
          </dl>
          {order.promoCode && (
            <small>
              {order.promoCode}: −20% {ru ? "уже учтены" : "included"}
            </small>
          )}
          {!admin && (
            <button
              className="compact-primary"
              disabled={busy}
              onClick={() => run("accept")}
            >
              {ru ? "Принять новые условия" : "Accept new terms"}
            </button>
          )}
        </div>
      )}
      <div className="order-action-buttons">
        {admin && order.status === "new" && total !== null && (
          <button
            className="compact-primary"
            disabled={busy}
            onClick={() => run("accept")}
          >
            {ru ? "Принять без изменений" : "Accept as submitted"}
          </button>
        )}
        {admin && beforePayment && (
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() => open("propose")}
          >
            {ru ? "Предложить другие условия" : "Propose different terms"}
          </button>
        )}
        {admin && order.status === "in_progress" && (
          <>
            <button
              className="compact-primary"
              disabled={busy}
              onClick={() => open("complete")}
            >
              {ru ? "Завершить заказ" : "Complete order"}
            </button>
            {order.dueAt && (
              <button
                className="secondary-action"
                disabled={busy}
                onClick={() => open("delay")}
              >
                {ru ? "Сообщить о задержке" : "Report a delay"}
              </button>
            )}
          </>
        )}
        {beforePayment && (
          <button
            className="danger-action"
            disabled={busy}
            onClick={() => open("cancel")}
          >
            {admin
              ? ru
                ? "Отклонить заявку"
                : "Decline request"
              : ru
                ? "Отменить заявку"
                : "Cancel request"}
          </button>
        )}
        {admin && order.paidAt && order.status !== "cancelled" && (
          <button
            className="danger-action"
            disabled={busy}
            onClick={() => open("refund")}
          >
            {ru ? "Зафиксировать полный возврат" : "Record a full refund"}
          </button>
        )}
      </div>
      {mode && labels && (
        <OrderActionDialog
          title={labels.title}
          context={`#${order.id.slice(0, 8).toUpperCase()} · ${order.platform.toUpperCase()}${total === null ? "" : ` · ${money(total, lang, currency)}`}`}
          ru={ru}
          busy={busy}
          disabled={
            version !== order.updatedAt || (requiresConfirmation && !confirmed)
          }
          destructive={mode === "cancel" || mode === "refund"}
          confirmLabel={labels.confirm}
          onClose={() => setMode(null)}
          onSubmit={submit}
        >
          {mode === "cancel" && (
            <p className="order-action-notice">
              {ru
                ? "Заявка будет отменена. Если захотите заказать буст позже, создайте новую заявку."
                : "This request will be cancelled. Create a new request if you want to order later."}
            </p>
          )}
          {mode === "propose" && (
            <>
              <label>
                {ru
                  ? "Цена до скидки по промокоду"
                  : "Price before the promo discount"}{" "}
                · {currency}
                <input
                  data-dialog-focus
                  type="number"
                  min="1"
                  max="100000000"
                  step="0.01"
                  value={amount}
                  required
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <p className="inspector-note">
                {ru
                  ? "Включите все надбавки в эту сумму. Скидка по промокоду применится автоматически."
                  : "Include any surcharges. The promo discount is applied automatically."}
              </p>
            </>
          )}
          {["propose", "delay"].includes(mode) && (
            <label>
              {mode === "delay"
                ? ru
                  ? "Дополнительные дни"
                  : "Additional days"
                : ru
                  ? "Дней на выполнение"
                  : "Delivery days"}
              <input
                data-dialog-focus={mode === "delay" ? "" : undefined}
                type="number"
                min="1"
                max={mode === "delay" ? 30 : 1000}
                step="1"
                value={days}
                required
                onChange={(event) => setDays(event.target.value)}
              />
            </label>
          )}
          {mode !== "complete" && (
            <label>
              {mode === "cancel"
                ? ru
                  ? "Причина отмены"
                  : "Cancellation reason"
                : ru
                  ? "Причина — видна клиенту"
                  : "Reason — visible to the client"}
              <textarea
                data-dialog-focus={
                  mode === "cancel" || mode === "refund" ? "" : undefined
                }
                value={reason}
                minLength={3}
                maxLength={1000}
                required
                rows={3}
                onChange={(event) => setReason(event.target.value)}
              />
              <small>
                {ru ? "От 3 до 1 000 символов." : "3–1,000 characters."}
              </small>
            </label>
          )}
          {mode === "delay" && (
            <label>
              {ru
                ? "Бонус клиенту (если согласован)"
                : "Client bonus (if agreed)"}
              <input
                value={bonus}
                maxLength={500}
                onChange={(event) => setBonus(event.target.value)}
              />
            </label>
          )}
          {requiresConfirmation && (
            <label className="trust-check">
              <input
                data-dialog-focus={mode === "complete" ? "" : undefined}
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                {mode === "refund"
                  ? ru
                    ? "Полная сумма уже возвращена клиенту вне сайта"
                    : "The full amount was refunded outside the site"
                  : ru
                    ? "Согласованный результат достигнут"
                    : "The agreed result has been delivered"}
              </span>
            </label>
          )}
          {failed && error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {version !== order.updatedAt && (
            <p className="error" role="alert">
              {ru
                ? "Заказ изменился. Закройте форму и проверьте условия."
                : "The order changed. Close this form and review its terms."}
            </p>
          )}
        </OrderActionDialog>
      )}
    </div>
  );
}

export { SecureOrderAccess } from "./secure-delivery-details";

export function OrderHistory({
  events,
  order,
  ru,
}: {
  events: OrderEvent[];
  order: Order;
  ru: boolean;
}) {
  if (!events.length) return null;
  const labels: Record<string, string> = ru
    ? {
        accept: "Условия приняты",
        propose: "Предложены новые условия",
        confirm_payment: "Оплата подтверждена",
        reject_payment: "Уведомление об оплате отклонено",
        access_submitted: "Данные переданы на проверку",
        access_received: "Получение данных подтверждено",
        started: "Выполнение началось",
        access_updated: "Данные обновлены",
        access_viewed: "Администратор просмотрел данные",
        delay: "Срок продлён",
        complete: "Заказ завершён",
        cancel: "Заявка отменена",
        refund: "Полный возврат подтверждён",
      }
    : {
        accept: "Terms accepted",
        propose: "New terms proposed",
        confirm_payment: "Payment confirmed",
        reject_payment: "Payment alert rejected",
        access_submitted: "Details submitted for review",
        access_received: "Receipt of details confirmed",
        started: "Delivery started",
        access_updated: "Details updated",
        access_viewed: "An admin viewed the details",
        delay: "Deadline extended",
        complete: "Order completed",
        cancel: "Request cancelled",
        refund: "Full refund confirmed",
      };
  return (
    <details className="order-history">
      <summary>
        {ru ? "История условий и действий" : "Terms and activity history"}
      </summary>
      <ol>
        {events.map((event) => (
          <li key={event.id}>
            <b>{labels[event.type] || event.type}</b>
            <small>
              {new Date(event.createdAt).toLocaleString(ru ? "ru-RU" : "en-US")}
            </small>
            {event.details.totalAmount !== undefined && (
              <span>
                {money(
                  event.details.totalAmount,
                  ru ? "ru" : "en",
                  order.quotedCurrency || "RUB",
                )}
              </span>
            )}
            {event.details.reason && <p>{event.details.reason}</p>}
            {event.details.bonus && (
              <p>
                {ru ? "Бонус:" : "Bonus:"} {event.details.bonus}
              </p>
            )}
            {event.details.dueAt && (
              <p>
                {ru ? "Срок:" : "Due:"}{" "}
                {new Date(event.details.dueAt).toLocaleString(
                  ru ? "ru-RU" : "en-US",
                )}
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
