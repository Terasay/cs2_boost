import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "../db/connection.mjs";
import { encryptExistingChats } from "../lib/chat-vault.mjs";

const database = openDatabase({ mustExist: false });
try {
  migrate(drizzle(database), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  if (database.pragma("foreign_key_check").length) throw new Error("Database foreign key check failed");
  const encrypted = encryptExistingChats(database);
  if (encrypted) console.log(`Encrypted ${encrypted} existing chat messages`);
  console.log("Database migrations complete");
} finally {
  database.close();
}
