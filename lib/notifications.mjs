import { createHash } from "node:crypto";
import { mailConfig, sendEmail } from "./mail.mjs";
import { brandedLetter } from "./mail-template.mjs";
import { openAccess, sealAccess } from "./order-access.mjs";

const minute = 60_000;
const hash = value => createHash("sha256").update(value).digest("hex");
const labels = {
  new: ["Новая заявка", "New request"],
  accept: ["Условия заказа приняты", "Order terms accepted"],
  propose: ["Предложены новые условия", "New order terms proposed"],
  confirm_payment: ["Оплата подтверждена", "Payment confirmed"],
  payment_review: ["Платёж заказа ожидает проверки", "Order payment needs verification"],
  reject_payment: ["Поступление требует уточнения", "Payment needs clarification"],
  access_submitted: ["Данные переданы на проверку", "Details submitted for review"],
  started: ["Выполнение заказа началось", "Order delivery started"],
  access_received: ["Получение данных подтверждено", "Receipt of details confirmed"],
  delay: ["Срок заказа продлён", "Order deadline extended"],
  complete: ["Заказ завершён", "Order completed"],
  cancel: ["Заявка отменена", "Request cancelled"],
  refund: ["Возврат отмечен в заказе", "Refund recorded in the order"],
};

export function emailConfigured() {
  try { mailConfig(); return true; } catch { return false; }
}

export function notificationsEnabled() {
  return process.env.EMAIL_NOTIFICATIONS !== "0" && emailConfigured();
}

export function preferences(database, userId) {
  const row = database.prepare("SELECT * FROM notification_preferences WHERE user_id = ?").get(userId);
  return { language: row?.language === "en" ? "en" : "ru", orderUpdates: row ? Boolean(row.order_updates) : true, chatReminders: row ? Boolean(row.chat_reminders) : true };
}

export function reserveMailSlot(database, essential = false, now = Date.now()) {
  const configured = Number(process.env.MAIL_DAILY_LIMIT || 90);
  if (!Number.isInteger(configured) || configured < 10 || configured > 10000) throw new Error("Invalid daily email limit");
  const limit = essential ? configured : configured - 10;
  const day = new Date(now).toISOString().slice(0, 10);
  return database.transaction(() => {
    database.prepare("DELETE FROM mail_usage WHERE day < ?").run(new Date(now - 7 * 86400_000).toISOString().slice(0, 10));
    const current = database.prepare("SELECT count FROM mail_usage WHERE day = ?").get(day)?.count ?? 0;
    if (current >= limit) return false;
    database.prepare("INSERT INTO mail_usage (day, count) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET count = count + 1").run(day);
    return true;
  })();
}

export function enqueueEmail(database, { key, userId, kind, parentId = null, letter, availableAt = Date.now(), expiresAt = Date.now() + 23 * 60 * minute, now = Date.now() }) {
  const user = database.prepare("SELECT email, email_verified_at FROM users WHERE id = ?").get(userId);
  if (!user?.email_verified_at) return false;
  const id = hash(key);
  const payload = sealAccess(`mail:${id}`, letter);
  return database.prepare("INSERT OR IGNORE INTO mail_outbox (id, user_id, recipient, kind, parent_id, payload, next_attempt_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, userId, user.email, kind, parentId, payload, availableAt, now, expiresAt).changes > 0;
}

export function enqueuePasswordChanged(database, { userId, eventId, origin }) {
  if (!emailConfigured()) return;
  const ru = preferences(database, userId).language === "ru";
  enqueueEmail(database, { key: `password-changed:${eventId}`, userId, kind: "password-changed",
    letter: brandedLetter({ lang: ru ? "ru" : "en", kicker: ru ? "БЕЗОПАСНОСТЬ АККАУНТА" : "ACCOUNT SECURITY", title: ru ? "Пароль изменён" : "Your password changed",
      paragraphs: [ru ? "Пароль аккаунта изменён. Старые входы на других устройствах закрыты. Двухфакторная защита сохранена, если была включена." : "Your password changed. Previous sign-ins on other devices were closed. Two-factor protection remains enabled if previously configured."],
      notice: ru ? "Если это были не вы, сразу восстановите пароль и обратитесь в поддержку на сайте." : "If this was not you, reset your password immediately and contact support on the website.",
      action: { text: ru ? "Восстановить доступ" : "Recover access", url: `${origin}/forgot-password` },
      subject: ru ? "Пароль CS2 Boost изменён" : "Your CS2 Boost password changed", text: `${ru ? "Пароль аккаунта изменён. Старые входы на других устройствах закрыты. Двухфакторная защита сохранена, если была включена." : "Your password changed. Previous sign-ins on other devices were closed. Two-factor protection remains enabled if previously configured."}\n\n${ru ? "Если это были не вы, восстановите пароль и обратитесь в поддержку:" : "If this was not you, reset your password and contact support:"}\n${origin}/forgot-password\n${origin}/support\n\nCS2 Boost` }) });
}

function recipients(database, ownerId, actorId, automatic = false) {
  if (automatic) return database.prepare("SELECT id FROM users WHERE id = ? OR (role = 'admin' AND email_verified_at IS NOT NULL)").all(ownerId);
  const actor = database.prepare("SELECT role FROM users WHERE id = ?").get(actorId);
  return actor?.role === "admin" ? database.prepare("SELECT id FROM users WHERE id = ?").all(ownerId) : database.prepare("SELECT id FROM users WHERE role = 'admin' AND id != ? AND email_verified_at IS NOT NULL").all(actorId);
}

export function enqueueOrderEvent(database, { orderId, actorId, type, eventId, origin, automatic = false }) {
  if (!notificationsEnabled() || !labels[type]) return;
  const order = database.prepare("SELECT user_id FROM orders WHERE id = ?").get(orderId);
  if (!order) return;
  for (const recipient of recipients(database, order.user_id, actorId, automatic)) {
    const pref = preferences(database, recipient.id);
    if (!pref.orderUpdates) continue;
    const ru = pref.language === "ru";
    const title = labels[type][ru ? 0 : 1];
    const number = orderId.slice(0, 8).toUpperCase();
    enqueueEmail(database, { key: `order:${eventId}:${recipient.id}`, userId: recipient.id, kind: "order", parentId: orderId,
      letter: brandedLetter({ lang: pref.language, title, kicker: `${ru ? "ЗАКАЗ" : "ORDER"} / #${number}`,
        paragraphs: [type === "complete" ? (ru ? "Спасибо, что выбрали CS2 Boost. Заказ и переписка остаются в вашем кабинете — теперь можно оценить работу и оставить отзыв." : "Thank you for choosing CS2 Boost. Your order and conversation remain in your account. You can now rate the service and leave a review.") : (ru ? "В вашем заказе есть обновление. Условия, текущий статус и переписка доступны в личном кабинете." : "There is an update to your order. View the terms, current status and conversation in your account.")],
        action: { text: ru ? "Открыть заказ" : "View order", url: `${origin}/orders/${orderId}` }, settingsUrl: `${origin}/account`,
        subject: `${title} · #${number} · CS2 Boost`, text: `${title}.\n\n${ru ? "Заказ" : "Order"} #${number}\n${ru ? "Условия, статус и переписка доступны в кабинете:" : "View the terms, status and conversation in your account:"}\n${origin}/orders/${orderId}\n\n${ru ? "Настройки уведомлений:" : "Notification settings:"}\n${origin}/account\n\nCS2 Boost` }) });
  }
}

export function markChatRead(database, kind, parentId, userId, readAt) {
  database.prepare("INSERT INTO chat_reads (id, user_id, kind, parent_id, read_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET read_at = max(read_at, excluded.read_at)")
    .run(hash(`${kind}:${parentId}:${userId}`), userId, kind, parentId, readAt);
}

export function enqueueChatReminder(database, { kind, parentId, senderId, origin, now = Date.now() }) {
  if (!notificationsEnabled()) return;
  const owner = kind === "order" ? database.prepare("SELECT user_id FROM orders WHERE id = ?").get(parentId) : database.prepare("SELECT user_id FROM support_threads WHERE id = ?").get(parentId);
  if (!owner) return;
  for (const recipient of recipients(database, owner.user_id, senderId)) {
    const pref = preferences(database, recipient.id);
    if (!pref.chatReminders) continue;
    const readAt = database.prepare("SELECT read_at FROM chat_reads WHERE id = ?").get(hash(`${kind}:${parentId}:${recipient.id}`))?.read_at ?? 0;
    const ru = pref.language === "ru";
    const title = ru ? "Вам ответили в чате" : "New reply in your conversation";
    const path = kind === "order" ? `/orders/${parentId}` : `/support/${parentId}`;
    enqueueEmail(database, { key: `chat:${kind}:${parentId}:${recipient.id}:${readAt}`, userId: recipient.id, kind: `chat-${kind}`, parentId,
      availableAt: now + 5 * minute, now,
      letter: brandedLetter({ lang: pref.language, title, kicker: ru ? (kind === "order" ? "ЧАТ ЗАКАЗА" : "ПОДДЕРЖКА") : (kind === "order" ? "ORDER CHAT" : "SUPPORT"),
        paragraphs: [ru ? "В вашей переписке есть новое сообщение. Откройте кабинет, чтобы прочитать его и продолжить разговор." : "There is a new message in your conversation. Open your account to read it and continue the conversation."],
        action: { text: ru ? "Открыть переписку" : "Open conversation", url: `${origin}${path}` }, notice: ru ? "Текст переписки и данные аккаунта не включены в письмо." : "Conversation content and account details are not included in this email.", settingsUrl: `${origin}/account`,
        subject: `${title} · CS2 Boost`, text: `${title}.\n\n${ru ? "Откройте кабинет, чтобы прочитать сообщения:" : "Open your account to read the messages:"}\n${origin}${path}\n\n${ru ? "Текст переписки и данные аккаунта не включены в письмо." : "Conversation content and account details are not included in this email."}\n${ru ? "Настройки уведомлений:" : "Notification settings:"}\n${origin}/account\n\nCS2 Boost` }) });
  }
}

function shouldDeliver(database, job, letter, now) {
  const user = database.prepare("SELECT email, email_verified_at, role FROM users WHERE id = ?").get(job.user_id);
  if (!user?.email_verified_at || user.email !== job.recipient) return false;
  if (job.kind === "password-reset") return Boolean(database.prepare("SELECT 1 FROM password_resets r JOIN users u ON u.id = r.user_id AND u.session_version = r.version WHERE r.id = ? AND r.user_id = ? AND r.expires_at > ?").get(letter.tokenId, job.user_id, now));
  if (job.kind === "password-changed") return true;
  if (job.kind === "service") return user.role === "admin";
  const pref = preferences(database, job.user_id);
  if (!notificationsEnabled() || (job.kind === "order" ? !pref.orderUpdates : !pref.chatReminders)) return false;
  const kind = job.kind.slice(5);
  if (job.kind !== "order" && !["order", "support"].includes(kind)) return false;
  if (job.kind === "order") {
    const order = database.prepare("SELECT user_id FROM orders WHERE id = ?").get(job.parent_id);
    return Boolean(order && (user.role === "admin" || order.user_id === job.user_id));
  }
  const table = kind === "order" ? "messages" : "support_messages";
  const owner = kind === "order" ? database.prepare("SELECT user_id FROM orders WHERE id = ?").get(job.parent_id) : database.prepare("SELECT user_id FROM support_threads WHERE id = ?").get(job.parent_id);
  if (!owner || (user.role !== "admin" && owner.user_id !== job.user_id)) return false;
  const parent = kind === "order" ? "order_id" : "thread_id";
  const latest = database.prepare(`SELECT m.created_at, u.role FROM ${table} m JOIN users u ON u.id = m.sender_id WHERE m.${parent} = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 1`).get(job.parent_id);
  const readAt = database.prepare("SELECT read_at FROM chat_reads WHERE id = ?").get(hash(`${kind}:${job.parent_id}:${job.user_id}`))?.read_at ?? 0;
  return Boolean(latest && latest.role !== user.role && latest.created_at > readAt);
}

export async function processMailQueue(database, { now = Date.now(), limit = 8, send = sendEmail } = {}) {
  database.prepare("UPDATE mail_outbox SET status = 'skipped', payload = NULL, lease_until = 0 WHERE status = 'pending' AND expires_at <= ?").run(now);
  database.prepare("DELETE FROM mail_outbox WHERE status != 'pending' AND created_at < ?").run(now - 7 * 86400_000);
  database.prepare("DELETE FROM password_resets WHERE expires_at <= ?").run(now);
  if (!emailConfigured()) return { configured: false, sent: 0, retried: 0, skipped: 0 };
  const result = { configured: true, sent: 0, retried: 0, skipped: 0 };
  for (let index = 0; index < limit; index++) {
    const job = database.prepare("UPDATE mail_outbox SET lease_until = ? WHERE id = (SELECT id FROM mail_outbox WHERE status = 'pending' AND next_attempt_at <= ? AND expires_at > ? AND lease_until <= ? ORDER BY CASE WHEN kind = 'password-reset' THEN 0 WHEN kind = 'password-changed' THEN 1 ELSE 2 END, created_at LIMIT 1) RETURNING *")
      .get(now + 2 * minute, now, now, now);
    if (!job) break;
    const finish = status => database.prepare("UPDATE mail_outbox SET status = ?, payload = NULL, lease_until = 0 WHERE id = ? AND lease_until = ?").run(status, job.id, job.lease_until);
    try {
      const letter = openAccess(`mail:${job.id}`, job.payload);
      if (!shouldDeliver(database, job, letter, now)) { finish("skipped"); result.skipped++; continue; }
      const essential = ["password-reset", "password-changed", "service"].includes(job.kind);
      if (!reserveMailSlot(database, essential, now)) {
        const tomorrow = Date.parse(`${new Date(now + 86400_000).toISOString().slice(0, 10)}T00:00:00Z`);
        database.prepare("UPDATE mail_outbox SET next_attempt_at = ?, lease_until = 0, last_error = 'Daily email limit reached' WHERE id = ? AND lease_until = ?").run(tomorrow, job.id, job.lease_until);
        continue;
      }
      await send({ to: job.recipient, subject: letter.subject, text: letter.text, html: letter.html, idempotencyKey: `mail-${job.id}` });
      database.transaction(() => {
        database.prepare("UPDATE mail_outbox SET status = 'sent', payload = NULL, sent_at = ?, attempts = attempts + 1, lease_until = 0, last_error = NULL WHERE id = ? AND lease_until = ?").run(now, job.id, job.lease_until);
        if (job.kind.startsWith("chat-")) database.prepare("UPDATE mail_outbox SET status = 'skipped', payload = NULL WHERE status = 'pending' AND kind = ? AND parent_id = ? AND user_id = ? AND lease_until <= ?").run(job.kind, job.parent_id, job.user_id, now);
      })();
      result.sent++;
    } catch (error) {
      const attempts = job.attempts + 1;
      const permanent = error?.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status);
      const failed = permanent || attempts >= 6;
      const retry = Math.max(minute * 2 ** Math.min(attempts - 1, 5), Math.min(Number(error?.retryAfter || 0) * 1000, 60 * minute));
      database.prepare("UPDATE mail_outbox SET status = ?, payload = CASE WHEN ? THEN NULL ELSE payload END, attempts = ?, next_attempt_at = ?, lease_until = 0, last_error = ? WHERE id = ? AND lease_until = ?")
        .run(failed ? "failed" : "pending", Number(failed), attempts, now + retry, error?.status ? `Email delivery HTTP ${error.status}` : "Email delivery failed", job.id, job.lease_until);
      result.retried++;
    }
  }
  return result;
}
