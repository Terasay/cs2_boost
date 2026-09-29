import { chmodSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { openDatabase, databasePath } from "../db/connection.mjs";

const directory = resolve(process.env.BACKUP_DIR || "backups");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const destination = join(directory, `cs2-${new Date().toISOString().replaceAll(":", "-")}.sqlite`);
if (destination === databasePath()) throw new Error("Backup must be separate from the database");
const database = openDatabase();
try {
  await database.backup(destination);
  if (process.platform !== "win32") chmodSync(destination, 0o600);
  const backups = readdirSync(directory).filter(name => /^cs2-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.sqlite$/.test(name)).sort().reverse();
  for (const name of backups.slice(14)) unlinkSync(join(directory, name));
  console.log(`Backup created: ${destination}`);
} finally {
  database.close();
}
