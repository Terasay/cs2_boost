import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

test("fresh migrations, admin promotion, and consistent database backup", () => {
  mkdirSync("work", { recursive: true });
  const directory = mkdtempSync(resolve("work/vps-test-"));
  const databasePath = join(directory, "database.sqlite");
  const backups = join(directory, "backups");
  const env = { ...process.env, NODE_ENV: "production", DATABASE_PATH: databasePath, BACKUP_DIR: backups, APP_ORIGIN: "https://boost.example", TRUST_PROXY: "1", ORDER_ACCESS_KEY: "ab".repeat(32), TWO_FACTOR_KEY: "cd".repeat(32) };
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
      assert.equal(restored.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get().n, 9);
    } finally { restored.close(); }
  } finally { database.close(); }
});

test("existing orders retain historical currency, amount and deadline during migration", () => {
  const directory = mkdtempSync(resolve("work/upgrade-test-"));
  const previous = join(directory, "previous"); mkdirSync(join(previous,"meta"),{recursive:true});
  const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));journal.entries=journal.entries.slice(0,7);
  writeFileSync(join(previous,"meta/_journal.json"),JSON.stringify(journal));
  for(const entry of journal.entries)copyFileSync(`drizzle/${entry.tag}.sql`,join(previous,`${entry.tag}.sql`));
  const database = new Database(join(directory,"database.sqlite"));
  try {
    migrate(drizzle(database),{migrationsFolder:previous});
    const now=Date.now();const userId=crypto.randomUUID();
    database.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)").run(userId,"existing@example.test","test-only",now);
    const ids=[];
    for(const status of ["new","quoted","awaiting_payment","in_progress","completed","cancelled"]) {
      const id=crypto.randomUUID();ids.push(id);
      database.prepare("INSERT INTO orders(id,user_id,platform,service,method,current_rating,target_rating,status,quoted_price,quoted_currency,deadline,risk_accepted_at,created_at,updated_at) VALUES(?,?,'premier','rating','duo',4000,6000,?,5000,'KZT','2026-10-15',?,?,?)").run(id,userId,status,now,now,now);
    }
    migrate(drizzle(database),{migrationsFolder:resolve("drizzle")});
    for(const id of ids) {
      const order=database.prepare("SELECT * FROM orders WHERE id=?").get(id);
      assert.equal(order.quoted_price,5000);assert.equal(order.quoted_currency,"KZT");assert.equal(order.deadline,"2026-10-15");
      assert.equal(order.total_amount,500000);assert.equal(order.duration_days,2);assert.equal(order.paid_at,null);assert.equal(order.started_at,null);
      if(order.status === "quoted"){assert.equal(order.proposal_amount,500000);assert.equal(order.proposal_days,2);}
    }
    assert.equal(database.pragma("foreign_key_check").length,0);
  } finally {database.close();}
});
