import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { changeWallet, claimPersonalPromo, creditReferral, resolvePromo, reverseOrderWallet, walletBalance } from "../lib/wallet.mjs";
import { calculatePrice } from "../lib/pricing.mjs";

function fixture() {
  const db = new Database(":memory:"); db.pragma("foreign_keys=ON");
  migrate(drizzle(db), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  for (const id of ["owner", "buyer"]) db.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)").run(id, `${id}@example.test`, "unused", 1);
  return db;
}

test("wallet entries are atomic, idempotent and never allow spending an unavailable balance", () => {
  const db = fixture();
  try {
    const deposit = { userId: "owner", reference: "topup:one", kind: "topup", amount: 10000 };
    assert.equal(changeWallet(db, deposit), true); assert.equal(changeWallet(db, deposit), false);
    assert.throws(() => changeWallet(db, { ...deposit, amount: 1 }), /conflict/);
    assert.throws(() => changeWallet(db, { userId: "owner", reference: "order:one", kind: "order", amount: -10001 }), /Insufficient/);
    assert.equal(walletBalance(db, "owner"), 10000);
    assert.throws(() => db.transaction(() => { changeWallet(db, { userId: "owner", reference: "order:rollback", kind: "order", amount: -5000 }); throw new Error("rollback"); })(), /rollback/);
    assert.equal(walletBalance(db, "owner"), 10000);
    assert.equal(db.prepare("SELECT count(*) AS n FROM wallet_entries").get().n, 1);
    for (const amount of [0, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER]) assert.throws(() => changeWallet(db, { ...deposit, reference: "invalid", amount }), /Invalid/);
  } finally { db.close(); }
});

test("a refund reverses an already-spent referral reward and subsequent top-ups cover the adjustment", () => {
  const db = fixture();
  try {
    db.prepare("INSERT INTO orders(id,user_id,platform,service,method,status,total_amount,paid_at,risk_accepted_at,created_at,updated_at) VALUES('order','buyer','premier','rating','duo','in_progress',47500,1,1,1,1)").run();
    db.prepare("INSERT INTO promo_earnings(order_id,promo_code,owner_id,paid_amount,amount,created_at) VALUES('order','PLAYER-ABC','owner',47500,2375,1)").run();
    assert.equal(creditReferral(db, "order"), false);
    db.prepare("UPDATE orders SET status='completed' WHERE id='order'").run();
    assert.equal(creditReferral(db, "order"), true); assert.equal(creditReferral(db, "order"), false);
    changeWallet(db, { userId: "owner", reference: "spend:reward", kind: "order", amount: -2375 });
    reverseOrderWallet(db, "order"); reverseOrderWallet(db, "order");
    assert.equal(walletBalance(db, "owner"), -2375);
    assert.throws(() => changeWallet(db, { userId: "owner", reference: "spend:negative", kind: "order", amount: -1 }), /Insufficient/);
    changeWallet(db, { userId: "owner", reference: "topup:partial", kind: "topup", amount: 1000 });
    assert.equal(walletBalance(db, "owner"), -1375);
    changeWallet(db, { userId: "owner", reference: "topup:rest", kind: "topup", amount: 2000 });
    assert.equal(walletBalance(db, "owner"), 625);
    assert.equal(creditReferral(db, "order"), false);
    assert.equal(db.prepare("SELECT sum(amount) AS n FROM wallet_entries WHERE user_id='owner'").get().n, 625);
  } finally { db.close(); }
});

test("personal codes require a completed paid order and any review; self-use earns only a discount", () => {
  const db = fixture();
  try {
    assert.throws(() => claimPersonalPromo(db, "owner"), /Complete a paid order/);
    db.prepare("INSERT INTO orders(id,user_id,platform,service,method,status,paid_at,risk_accepted_at,created_at,updated_at) VALUES('first','owner','premier','rating','duo','completed',1,1,1,1)").run();
    assert.throws(() => claimPersonalPromo(db, "owner"), /leave a review/);
    db.prepare("INSERT INTO order_reviews(id,order_id,rating,author_name,body,published,created_at,updated_at) VALUES('review','first',1,'Player','Honest low rating review',0,1,1)").run();
    const code = claimPersonalPromo(db, "owner"); assert.equal(claimPersonalPromo(db, "owner"), code);
    const input = { platform: "premier", service: "rating", current: 4500, target: 5500, promoCode: code.toLowerCase() };
    assert.throws(() => calculatePrice(input), /Unknown/);
    const friend = calculatePrice(input, resolvePromo(db, code.toLowerCase(), "buyer"));
    const self = calculatePrice(input, resolvePromo(db, code, "owner"));
    assert.equal(friend.totalAmount, 47500); assert.equal(friend.commissionAmount, 2375);
    assert.equal(self.totalAmount, 47500); assert.equal(self.commissionAmount, 0);
    assert.equal(calculatePrice({ ...input, promoCode: "cherep" }, resolvePromo(db, "cherep")).totalAmount, 40000);
    for (const code of ["PLAYER-unknown", true, {}, "a".repeat(33)]) assert.throws(() => resolvePromo(db, code), /Unknown/);
  } finally { db.close(); }
});
