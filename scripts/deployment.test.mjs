import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

test("fresh migrations, admin promotion, and consistent database backup", () => {
  mkdirSync("work", { recursive: true });
  const directory = mkdtempSync(resolve("work/vps-test-"));
  const databasePath = join(directory, "database.sqlite");
  const backups = join(directory, "backups");
  const env = { ...process.env, NODE_ENV: "production", DATABASE_PATH: databasePath, BACKUP_DIR: backups, APP_ORIGIN: "https://boost.example", TRUST_PROXY: "1" };
  const run = (script, args = []) => {
    const result = spawnSync(process.execPath, [resolve("scripts", script), ...args], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  run("migrate.mjs");
  run("migrate.mjs");
  const database = new Database(databasePath);
  try {
    const id = crypto.randomUUID();
    database.prepare("INSERT INTO users (id,email,password_hash,created_at) VALUES (?, ?, ?, ?)").run(id, "deployment@example.test", "test-only", Date.now());
    database.prepare("INSERT INTO sessions (id,user_id,expires_at,version) VALUES (?, ?, ?, 0)").run("test-session", id, Date.now() + 60000);
    run("set-admin.mjs", ["deployment@example.test"]);
    assert.deepEqual(database.prepare("SELECT role, session_version FROM users WHERE id = ?").get(id), { role: "admin", session_version: 1 });
    assert.equal(database.prepare("SELECT count(*) AS n FROM sessions").get().n, 0);
    run("check-config.mjs");
    run("backup.mjs");
    const files = readdirSync(backups);
    assert.equal(files.length, 1);
    const restored = new Database(join(backups, files[0]), { readonly: true });
    try {
      assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(restored.prepare("SELECT role FROM users WHERE id = ?").get(id).role, "admin");
      assert.equal(restored.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get().n, 6);
    } finally { restored.close(); }
  } finally { database.close(); }
});
