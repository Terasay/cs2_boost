import { publicOrigin } from "../lib/server-config.mjs";
import { openDatabase } from "../db/connection.mjs";
import { mailConfig } from "../lib/mail.mjs";
import { accessKey } from "../lib/order-access.mjs";
import { openSecret, twoFactorKey } from "../lib/two-factor.mjs";

publicOrigin(new Request("http://127.0.0.1:3000"));
if (process.env.TRUST_PROXY !== "1") throw new Error("The VPS service requires TRUST_PROXY=1 and Nginx on the same server");
const database = openDatabase();
try {
  database.prepare("SELECT session_version FROM users LIMIT 1").get();
  database.prepare("SELECT id FROM email_verifications LIMIT 1").get();
  database.prepare("SELECT total_amount FROM orders LIMIT 1").get();
  accessKey();
  twoFactorKey();
  database.prepare("SELECT two_factor_verified FROM sessions LIMIT 1").get();
  for (const factor of database.prepare("SELECT user_id, secret FROM two_factors WHERE enabled_at IS NOT NULL").all()) openSecret(factor.user_id, factor.secret);
  if (process.env.RESEND_API_KEY || process.env.MAIL_FROM) {
    mailConfig();
    console.log("Registration email configuration is present (delivery not tested)");
  } else console.log("Registration email is not configured; new registrations are unavailable");
  console.log("Server configuration is valid");
} finally {
  database.close();
}
