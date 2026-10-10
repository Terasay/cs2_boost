import { and, eq, gt, lt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/db";
import { emailVerifications, users } from "@/db/schema";
import { cleanAttribution } from "@/lib/attribution.mjs";
import { ratingValue } from "@/lib/order-validation";
import { normalizePromo, validateRatings } from "@/lib/pricing.mjs";
import { publicOrigin } from "@/lib/server-config.mjs";
import { mailConfig, sendEmail, verificationLetter } from "@/lib/mail.mjs";
import { jsonInput, privateJson } from "../request-security";
import { createSession, deleteSession, hashPassword } from "./auth-lib";
import { chargeAttempt, rateKey } from "./rate-limit";

const fail = (error: string, status = 400, retry?: number) => privateJson({ error }, status, retry ? { "Retry-After": String(retry) } : undefined);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function registrationDraft(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const draft = input as Record<string, unknown>;
  if ((draft.platform !== "premier" && draft.platform !== "faceit") || (draft.method !== "duo" && draft.method !== "piloted") || (draft.service !== "rating" && draft.service !== "calibration")) return null;
  const current = draft.service === "rating" ? ratingValue(draft.current) : null;
  const target = draft.service === "rating" ? ratingValue(draft.target) : null;
  if (draft.service === "rating") {
    try { validateRatings(draft.platform, current, target); } catch { return null; }
  }
  let promoCode: string | null;
  try { promoCode = normalizePromo(draft.promoCode); } catch { return null; }
  return { platform: draft.platform, service: draft.service, method: draft.method, current, target, redTrust: draft.platform === "premier" && draft.redTrust === true, promoCode };
}

export async function requestRegistration(request: Request) {
  const retry = await chargeAttempt(await rateKey("register", request), 5, 60 * 60_000);
  if (retry) return fail("Too many attempts. Try again later", 429, retry);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email");
  try { mailConfig(); } catch { return fail("Registration email unavailable. Try again later", 503); }
  const cooldown = await chargeAttempt(await rateKey("registration-email-cooldown", null, email), 1, 60_000);
  if (cooldown) return fail("Wait before requesting another email", 429, cooldown);
  const emailLimit = await chargeAttempt(await rateKey("registration-email", null, email), 5, 60 * 60_000);
  if (emailLimit) return fail("Too many attempts. Try again later", 429, emailLimit);
  const db = getDb();
  const [existing] = db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1).all();
  const accepted = () => privateJson({ verificationRequired: true, retryAfter: 60 }, 202);
  if (existing) return accepted();
  const quota = await chargeAttempt(await rateKey("registration-mail-day", null, new Date().toISOString().slice(0, 10)), 90, 86400_000);
  if (quota) return fail("Registration email unavailable. Try again later", 503);
  const token = randomBytes(32).toString("hex");
  const id = digest(token);
  const now = Date.now();
  db.delete(emailVerifications).where(lt(emailVerifications.expiresAt, now)).run();
  const draft = registrationDraft(input.draft);
  db.insert(emailVerifications).values({ id, email, createdAt: now, expiresAt: now + 30 * 60_000, draft: draft ? JSON.stringify({ draft, attribution: cleanAttribution(input.attribution) }) : null }).run();
  const lang = input.lang === "en" ? "en" : "ru";
  const url = `${publicOrigin(request)}/verify-email#token=${token}&lang=${lang}`;
  try {
    await sendEmail({ to: email, ...verificationLetter(url, lang), idempotencyKey: `registration-${id}` });
  } catch (reason) {
    console.error("Registration email failed", { code: reason instanceof Error ? reason.message : "Delivery failed" });
    return fail("Registration email unavailable. Try again later", 503);
  }
  return accepted();
}

export async function verifyRegistration(request: Request) {
  const retry = await chargeAttempt(await rateKey("verify-registration", request), 20, 15 * 60_000);
  if (retry) return fail("Too many attempts. Try again later", 429, retry);
  const input = await jsonInput(request);
  if (!input) return fail("Invalid request");
  const token = typeof input.token === "string" ? input.token : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!/^[0-9a-f]{64}$/.test(token)) return fail("Verification link is invalid or expired");
  if (password.length < 12 || password.length > 128) return fail("Password must be 12–128 characters");
  const db = getDb();
  const tokenId = digest(token);
  const [pending] = db.select().from(emailVerifications).where(and(eq(emailVerifications.id, tokenId), gt(emailVerifications.expiresAt, Date.now()))).limit(1).all();
  if (!pending) return fail("Verification link is invalid or expired");
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  const registered = db.transaction(tx => {
    const [valid] = tx.select().from(emailVerifications).where(and(eq(emailVerifications.id, tokenId), gt(emailVerifications.expiresAt, Date.now()))).limit(1).all();
    if (!valid) return false;
    const [user] = tx.insert(users).values({ id, email: valid.email, passwordHash, role: "client", emailVerifiedAt: Date.now(), createdAt: Date.now() }).onConflictDoNothing().returning({ id: users.id }).all();
    tx.delete(emailVerifications).where(eq(emailVerifications.email, valid.email)).run();
    return Boolean(user);
  });
  if (!registered) return fail("Verification link is invalid or expired");
  await deleteSession(request);
  const cookie = await createSession(id, 0, request);
  const saved = pending.draft ? JSON.parse(pending.draft) : {};
  return privateJson({ user: { id, email: pending.email, role: "client" }, ...saved }, 200, { "Set-Cookie": cookie });
}
