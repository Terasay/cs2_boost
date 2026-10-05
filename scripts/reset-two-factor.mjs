import { openDatabase } from "../db/connection.mjs";
import { tokenHash } from "../lib/two-factor.mjs";

const [emailInput, confirmation] = process.argv.slice(2);
const email = emailInput?.trim().toLowerCase();
if (!email || confirmation !== "--confirm" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Usage: node scripts/reset-two-factor.mjs admin@example.com --confirm");
const db = openDatabase();
try {
  db.transaction(() => {
    const user = db.prepare("SELECT id, role FROM users WHERE email=?").get(email);
    if (!user || user.role !== "admin") throw new Error("Administrator account not found");
    db.prepare("DELETE FROM two_factors WHERE user_id=?").run(user.id);
    db.prepare("DELETE FROM recovery_codes WHERE user_id=?").run(user.id);
    db.prepare("DELETE FROM auth_challenges WHERE user_id=?").run(user.id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    db.prepare("UPDATE users SET session_version=session_version+1 WHERE id=?").run(user.id);
    for (const [scope,value] of [["mfa-account",user.id],["login-account",email],["password",user.id]]) db.prepare("DELETE FROM auth_attempts WHERE key=?").run(tokenHash(`${scope}:account:${value}`));
  })();
  console.log("Two-factor protection reset. All sessions revoked. Sign in and connect an authenticator again.");
} finally { db.close(); }
