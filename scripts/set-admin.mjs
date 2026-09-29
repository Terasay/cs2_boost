import { openDatabase } from "../db/connection.mjs";

const [emailArg, extra] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || extra) {
  throw new Error("Usage: npm run admin:set -- email@example.com");
}
const database = openDatabase();
try {
  database.transaction(() => {
    const account = database.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!account) throw new Error("Create the account with this email first");
    database.prepare("UPDATE users SET role = 'admin', session_version = session_version + 1 WHERE id = ?").run(account.id);
    database.prepare("DELETE FROM sessions WHERE user_id = ?").run(account.id);
  })();
  console.log(`${email} is admin. Sign in again.`);
} finally {
  database.close();
}
