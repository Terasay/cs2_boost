import Database from "better-sqlite3";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export function databasePath() {
  const configured = process.env.DATABASE_PATH;
  if (process.env.NODE_ENV === "production" && (!configured || !isAbsolute(configured))) {
    throw new Error("DATABASE_PATH must be an absolute path in production");
  }
  return resolve(configured || "data/cs2.sqlite");
}

export function openDatabase({ mustExist = true } = {}) {
  const path = databasePath();
  if (!mustExist) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const database = new Database(path, { fileMustExist: mustExist, timeout: 5000 });
  try {
    if (process.platform !== "win32") chmodSync(path, 0o600);
    database.pragma("foreign_keys = ON");
    database.pragma("journal_mode = WAL");
    database.pragma("synchronous = FULL");
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
