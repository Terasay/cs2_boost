import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, linkSync, openSync, unlinkSync } from "node:fs";

export function verifySnapshot(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true, timeout: 5000 });
  try {
    const integrity = database.pragma("integrity_check");
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("Backup failed SQLite integrity check");
    if (database.pragma("foreign_key_check").length) throw new Error("Backup contains broken foreign keys");
    for (const name of ["users", "orders", "__drizzle_migrations"]) {
      if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)) throw new Error(`Backup is missing table: ${name}`);
    }
    const migrations = database.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get().count;
    if (!migrations) throw new Error("Backup has no recorded migrations");
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wallet_accounts'").get()) {
      const mismatch = database.prepare("SELECT 1 FROM wallet_accounts a LEFT JOIN wallet_entries e ON e.user_id = a.user_id GROUP BY a.user_id HAVING a.balance != coalesce(sum(e.amount), 0) LIMIT 1").get();
      const missing = database.prepare("SELECT 1 FROM wallet_entries e LEFT JOIN wallet_accounts a ON a.user_id = e.user_id WHERE a.user_id IS NULL LIMIT 1").get();
      if (mismatch || missing) throw new Error("Backup wallet balances do not match the ledger");
    }
    return { ok: true, migrations };
  } finally { database.close(); }
}

export async function writeVerifiedSnapshot(database, destination) {
  if ([destination, `${destination}-wal`, `${destination}-shm`].some(existsSync)) throw new Error("Snapshot destination already exists");
  const temporary = `${destination}.${randomUUID()}.partial`;
  closeSync(openSync(temporary, "wx", 0o600));
  try {
    await database.backup(temporary);
    const snapshot = new Database(temporary, { fileMustExist: true });
    try { snapshot.pragma("journal_mode = DELETE"); }
    finally { snapshot.close(); }
    const result = verifySnapshot(temporary);
    linkSync(temporary, destination);
    return result;
  } finally {
    for (const path of [temporary, `${temporary}-wal`, `${temporary}-shm`]) if (existsSync(path)) unlinkSync(path);
  }
}
