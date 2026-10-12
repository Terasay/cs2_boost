import { appendFileSync, mkdirSync } from "node:fs";
import { resolve, sep } from "node:path";

const work = resolve("work") + sep;
const outbox = resolve(process.env.SITE_MAIL_OUTBOX || ".");
const database = resolve(process.env.DATABASE_PATH || ".");
if (!outbox.startsWith(work) || !database.startsWith(work) || process.env.RESEND_API_KEY !== "re_local_test_only") throw new Error("Mail stub requires an isolated local test database");
mkdirSync(outbox, { recursive: true });
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (process.env.SITE_HEALTH_RESULT && /^http:\/\/127\.0\.0\.1:\d+\/api\/health$/.test(String(input))) return Response.json({ ok: process.env.SITE_HEALTH_RESULT === "up" }, { status: process.env.SITE_HEALTH_RESULT === "up" ? 200 : 503 });
  if (String(input) !== "https://api.resend.com/emails") return original(input, options);
  const payload = JSON.parse(options.body);
  if (payload.to.some(email => !email.endsWith("@example.test"))) throw new Error("Only synthetic recipients are allowed");
  if (payload.to[0].startsWith("failure-")) return Response.json({ message: "secret provider failure" }, { status: 503 });
  appendFileSync(resolve(outbox, "messages.jsonl"), JSON.stringify(payload) + "\n", { mode: 0o600 });
  return Response.json({ id: crypto.randomUUID() });
};
