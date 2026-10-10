import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { orderAccess, orderEvents, orders, users } from "@/db/schema";
import { openAccess, sealAccess } from "@/lib/order-access.mjs";
import { dayMs } from "@/lib/pricing.mjs";
import { getCurrentUser, verifyPassword } from "../../../auth/auth-lib";
import { chargeAttempt, clearAttempts, rateKey } from "../../../auth/rate-limit";
import { jsonInput, privateJson, safeApi, sameOriginMutation } from "../../../request-security";

const fail = (error: string, status = 400) => privateJson({ error }, status);

async function POSTHandler(request: Request) {
  if (!sameOriginMutation(request)) return fail("Invalid origin", 403);
  const user = await getCurrentUser(request);
  if (!user) return fail("Sign in required", 401);
  const id = new URL(request.url).pathname.split("/").at(-2)!;
  const input = await jsonInput(request, 4096);
  if (!input) return fail("Invalid request");
  const db = getDb();
  const order = db.select().from(orders).where(eq(orders.id, id)).get();
  if (!order || (user.role !== "admin" && order.userId !== user.id)) return fail("Order not found", 404);
  const now = Date.now();
  db.delete(orderAccess).where(lt(orderAccess.expiresAt, now)).run();
  if (!order.paidAt || !["awaiting_access", "in_progress"].includes(order.status)) return fail("Payment must be confirmed first", 409);
  const retry = await chargeAttempt(await rateKey("order-access", null, user.id), 60, 60 * 60_000);
  if (retry) return fail("Too many requests. Try again later", 429);
  if (input.action === "reveal" || input.action === "receive") {
    if (user.role !== "admin") return fail("Admin account required", 403);
    const access = db.select().from(orderAccess).where(and(eq(orderAccess.orderId, id), gt(orderAccess.expiresAt, now))).get();
    if (!access) return fail("Access data unavailable", 404);
    if (input.action === "reveal") {
      const reauthKey = await rateKey("access-reauth", null, user.id);
      if (await chargeAttempt(reauthKey, 10, 15 * 60000)) return fail("Too many requests. Try again later", 429);
      const password = typeof input.adminPassword === "string" ? input.adminPassword : "";
      const account = db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id)).get();
      if (!password || password.length > 256 || !account || !await verifyPassword(password, account.hash)) return fail("Incorrect password", 403);
      await clearAttempts(reauthKey);
      const authenticated = await getCurrentUser(request);
      if (!authenticated || authenticated.role !== "admin") return fail("Sign in required", 401);
      const activeOrder = db.select().from(orders).where(eq(orders.id, id)).get();
      const activeAccess = db.select().from(orderAccess).where(and(eq(orderAccess.orderId, id), gt(orderAccess.expiresAt, Date.now()))).get();
      if (!activeOrder?.paidAt || !["awaiting_access", "in_progress"].includes(activeOrder.status) || activeAccess?.payload !== access.payload) return fail("Order changed. Refresh and review the latest terms", 409);
    }
    if (input.action === "receive") {
      if (input.confirmed !== true) return fail("Confirm access is ready");
      return db.transaction(tx => {
        const fresh = tx.select().from(orders).where(eq(orders.id, id)).get();
        const current = tx.select().from(orderAccess).where(and(eq(orderAccess.orderId, id), gt(orderAccess.expiresAt, now))).get();
        if (!fresh || fresh.updatedAt !== input.updatedAt || !fresh.paidAt || !["awaiting_access", "in_progress"].includes(fresh.status) || !current || current.receivedAt) return fail("Order changed. Refresh and review the latest terms", 409);
        openAccess(id, current.payload);
        const startedAt = fresh.startedAt ?? now;
        const dueAt = fresh.dueAt ?? startedAt + fresh.durationDays! * dayMs;
        tx.update(orderAccess).set({ receivedAt: now, receivedBy: user.id }).where(eq(orderAccess.orderId, id)).run();
        tx.update(orders).set({ status: "in_progress", startedAt, dueAt, updatedAt: Math.max(now, fresh.updatedAt + 1) }).where(eq(orders.id, id)).run();
        tx.insert(orderEvents).values({ id: crypto.randomUUID(), orderId: id, actorId: user.id, type: fresh.startedAt ? "access_received" : "started", details: JSON.stringify({ startedAt, dueAt }), createdAt: now }).run();
        return privateJson({ ok: true, startedAt, dueAt });
      });
    }
    const value = openAccess(id, access.payload);
    db.insert(orderEvents).values({ id: crypto.randomUUID(), orderId: id, actorId: user.id, type: "access_viewed", details: "{}", createdAt: now }).run();
    return privateJson({ access: value });
  }
  if (user.role !== "client" || order.userId !== user.id || input.action !== "submit") return fail("Client account required", 403);
  if (input.confirmed !== true) return fail("Confirm access is ready");
  const profile = typeof input.profile === "string" ? input.profile.trim() : "";
  const login = typeof input.login === "string" ? input.login.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const friendCode = typeof input.friendCode === "string" ? input.friendCode.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (profile.length > 500 || note.length > 1000 || login.length > 254 || password.length > 256) return fail("Invalid access details");
  if (order.method === "piloted" && (!login || !password)) return fail("Enter the account login and password");
  if (order.method === "duo" && !/^\d{1,12}$/.test(friendCode)) return fail("Enter a valid Steam friend code");
  const payload = sealAccess(id, order.method === "duo" ? { friendCode, profile, note } : { login, password, profile, note });
  return db.transaction(tx => {
    const fresh = tx.select().from(orders).where(eq(orders.id, id)).get();
    if (!fresh || fresh.updatedAt !== input.updatedAt || !fresh.paidAt || !["awaiting_access", "in_progress"].includes(fresh.status)) return fail("Order changed. Refresh and review the latest terms", 409);
    const expiresAt = Math.min(now + 30 * dayMs, Math.max(now + dayMs, (fresh.dueAt ?? now + (fresh.durationDays! * dayMs)) + 7 * dayMs));
    const values = { payload, createdAt: now, expiresAt, receivedAt: null, receivedBy: null };
    tx.insert(orderAccess).values({ orderId: id, ...values }).onConflictDoUpdate({ target: orderAccess.orderId, set: values }).run();
    tx.update(orders).set({ updatedAt: Math.max(now, fresh.updatedAt + 1) }).where(eq(orders.id, id)).run();
    tx.insert(orderEvents).values({ id: crypto.randomUUID(), orderId: id, actorId: user.id, type: "access_submitted", details: "{}", createdAt: now }).run();
    return privateJson({ ok: true });
  });
}

export const POST = safeApi(POSTHandler);
