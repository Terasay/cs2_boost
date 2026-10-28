import Database from "better-sqlite3";
import { resolve } from "node:path";
import { databasePath } from "../db/connection.mjs";
import { verifySnapshot, writeVerifiedSnapshot } from "../db/backup.mjs";

const args = process.argv.slice(2);
if (!(args.length === 1 || (args.length === 3 && args[1] === "--restore-to"))) {
  throw new Error("Usage: node scripts/verify-backup.mjs BACKUP.sqlite [--restore-to NEW.sqlite]");
}
const source = resolve(args[0]);
const result = verifySnapshot(source);
if (args.length === 3) {
  const target = resolve(args[2]);
  if (target === databasePath() || target === source) throw new Error("Restore to a separate, unused file; the live database cannot be replaced by this command");
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try { await writeVerifiedSnapshot(database, target); }
  finally { database.close(); }
  console.log(JSON.stringify({ ...result, restoredTo: target }));
} else console.log(JSON.stringify(result));
