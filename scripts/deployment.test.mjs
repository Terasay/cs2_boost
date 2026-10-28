import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { verifySnapshot } from "../db/backup.mjs";

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
    const backupPath = join(backups, files[0]);
    run("verify-backup.mjs", [backupPath]);
    const restoredPath = join(directory, "restored.sqlite");
    run("verify-backup.mjs", [backupPath, "--restore-to", restoredPath]);
    assert(verifySnapshot(restoredPath).ok);
    for (const target of [databasePath, restoredPath, backupPath]) {
      const result = spawnSync(process.execPath, ["scripts/verify-backup.mjs", backupPath, "--restore-to", target], {env,encoding:"utf8"});
      assert.notEqual(result.status, 0, "Restores must never replace existing files");
    }
    const restored = new Database(join(backups, files[0]), { readonly: true });
    try {
      assert.equal(restored.pragma("integrity_check", { simple: true }), "ok");
      assert.equal(restored.prepare("SELECT role FROM users WHERE id = ?").get(id).role, "admin");
      assert.equal(restored.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get().n, JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8")).entries.length);
    } finally { restored.close(); }
  } finally { database.close(); }
});

test("invalid backups are not published and do not rotate good backups", () => {
  const directory = mkdtempSync(resolve("work/backup-integrity-test-"));
  const databasePath = join(directory,"database.sqlite"), backups = join(directory,"backups");
  const database = new Database(databasePath);
  try {
    migrate(drizzle(database),{migrationsFolder:resolve("drizzle")});
    database.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES('user','backup@example.test','test-only',?)").run(Date.now());
    database.exec("INSERT INTO wallet_accounts(user_id,balance) VALUES('user',0)");
    const env = {...process.env,DATABASE_PATH:databasePath,BACKUP_DIR:backups};
    const run = () => spawnSync(process.execPath,["scripts/backup.mjs"],{env,encoding:"utf8"});
    assert.equal(run().status,0);
    const goodFiles = readdirSync(backups);
    database.exec("UPDATE wallet_accounts SET balance = 100");
    const failed = run();
    assert.notEqual(failed.status,0);
    assert.match(failed.stderr,/balances do not match/);
    assert.deepEqual(readdirSync(backups),goodFiles);
    const corrupt = join(directory,"corrupt.sqlite"); writeFileSync(corrupt,"not a database");
    assert.throws(()=>verifySnapshot(corrupt));
  } finally {database.close();}
});

test("registration queue migration preserves outstanding notifications and permits unregistered recipients", () => {
  const directory = mkdtempSync(resolve("work/mail-migration-test-"));
  const previous = join(directory,"previous"); mkdirSync(join(previous,"meta"),{recursive:true});
  const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8")); journal.entries=journal.entries.slice(0,14);
  writeFileSync(join(previous,"meta/_journal.json"),JSON.stringify(journal));
  for(const entry of journal.entries)copyFileSync(`drizzle/${entry.tag}.sql`,join(previous,`${entry.tag}.sql`));
  const database = new Database(":memory:");
  try {
    database.pragma("foreign_keys = ON");
    migrate(drizzle(database),{migrationsFolder:previous});
    database.exec("INSERT INTO users(id,email,password_hash,created_at) VALUES('u','queue@example.test','test-only',1)");
    database.exec("INSERT INTO mail_outbox(id,user_id,recipient,kind,payload,next_attempt_at,created_at,expires_at) VALUES('old','u','queue@example.test','order','sealed',1,1,9000)");
    migrate(drizzle(database),{migrationsFolder:resolve("drizzle")});
    assert.deepEqual(database.prepare("SELECT user_id,payload,status FROM mail_outbox WHERE id='old'").get(),{user_id:"u",payload:"sealed",status:"pending"});
    database.exec("INSERT INTO mail_outbox(id,recipient,kind,next_attempt_at,created_at,expires_at) VALUES('new','new@example.test','registration',1,1,9000)");
    assert.equal(database.pragma("foreign_key_check").length,0);
    database.exec("DELETE FROM users WHERE id='u'");
    assert.equal(database.prepare("SELECT count(*) n FROM mail_outbox").get().n,1);
  } finally {database.close();}
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
