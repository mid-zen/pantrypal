import { test } from "node:test";
import assert from "node:assert/strict";
import { computeApp, computeTotals, delta, validateTxn, type App } from "../src/bankroll.js";

function app(startingBalance: number, txns: { type: any; amount: number }[]): App {
  return {
    id: "a", name: "Test", startingBalance, createdAt: "2026-01-01T00:00:00Z",
    txns: txns.map((t, i) => ({ id: String(i), date: "2026-01-01T00:00:00Z", type: t.type, amount: t.amount, note: "" })),
  };
}

test("delta signs each transaction type correctly", () => {
  const mk = (type: any, amount: number) => delta({ id: "x", date: "", type, amount, note: "" });
  assert.equal(mk("deposit", 100), 100);
  assert.equal(mk("withdraw", 100), -100);
  assert.equal(mk("win", 50), 50);
  assert.equal(mk("loss", 30), -30);
  assert.equal(mk("bonus", 25), 25);
  assert.equal(mk("adjust", -10), -10); // adjust is signed
});

test("balance and P/L separate capital from winnings", () => {
  // start 100, deposit 50, lose 30, withdraw 20 -> balance 100; P/L -30.
  const v = computeApp(app(100, [
    { type: "deposit", amount: 50 },
    { type: "loss", amount: 30 },
    { type: "withdraw", amount: 20 },
  ]));
  assert.equal(v.balance, 100);
  assert.equal(v.deposited, 50);
  assert.equal(v.withdrawn, 20);
  assert.equal(v.pnl, -30);
});

test("wins and bonuses count as profit; deposits do not", () => {
  const v = computeApp(app(0, [
    { type: "deposit", amount: 200 },
    { type: "win", amount: 40 },
    { type: "bonus", amount: 25 },
  ]));
  assert.equal(v.balance, 265);
  assert.equal(v.pnl, 65); // 40 + 25, NOT the 200 deposit
});

test("adjust reconciles balance and shows up in P/L", () => {
  // start 100, then adjust +15 (e.g. 'set balance to 115') -> balance 115, pnl 15.
  const v = computeApp(app(100, [{ type: "adjust", amount: 15 }]));
  assert.equal(v.balance, 115);
  assert.equal(v.pnl, 15);
});

test("totals aggregate across apps", () => {
  const a = computeApp(app(100, [{ type: "win", amount: 20 }]));
  const b = computeApp(app(0, [{ type: "deposit", amount: 50 }, { type: "loss", amount: 10 }]));
  const t = computeTotals([a, b]);
  assert.equal(t.balance, 100 + 20 + 50 - 10); // 160
  assert.equal(t.pnl, 20 - 10); // 10
  assert.equal(t.deposited, 50);
  assert.equal(t.apps, 2);
});

test("validateTxn rejects negatives except adjust", () => {
  assert.throws(() => validateTxn("deposit", -5), /zero or positive/);
  assert.throws(() => validateTxn("nope", 5), /Unknown/);
  assert.deepEqual(validateTxn("adjust", -5), { type: "adjust", amount: -5 });
  assert.deepEqual(validateTxn("win", 5), { type: "win", amount: 5 });
});
