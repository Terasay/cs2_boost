import { getDb } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { notificationsEnabled, preferences } from "@/lib/notifications.mjs";
import { getCurrentUser } from "../auth/auth-lib";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../request-security";

export const GET = safeApi(async request => {
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  return privateJson({ ...preferences(getDb().$client, user.id), enabled: notificationsEnabled() });
});

export const PATCH = safeApi(async request => {
  if (!sameOriginMutation(request)) return privateJson({ error: "Invalid origin" }, 403);
  const user = await getCurrentUser(request);
  if (!user) return privateJson({ error: "Sign in required" }, 401);
  const input = await jsonInput(request);
  if (!input || !["ru", "en"].includes(String(input.language)) || typeof input.orderUpdates !== "boolean" || typeof input.chatReminders !== "boolean") return privateJson({ error: "Invalid notification settings" }, 400);
  const values = { language: input.language as "ru" | "en", orderUpdates: input.orderUpdates, chatReminders: input.chatReminders };
  getDb().insert(notificationPreferences).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: notificationPreferences.userId, set: values }).run();
  if (!values.orderUpdates) getDb().$client.prepare("UPDATE mail_outbox SET status = 'skipped', payload = NULL WHERE user_id = ? AND kind = 'order' AND status = 'pending' AND lease_until <= ?").run(user.id, Date.now());
  if (!values.chatReminders) getDb().$client.prepare("UPDATE mail_outbox SET status = 'skipped', payload = NULL WHERE user_id = ? AND kind LIKE 'chat-%' AND status = 'pending' AND lease_until <= ?").run(user.id, Date.now());
  return privateJson({ ok: true });
});
