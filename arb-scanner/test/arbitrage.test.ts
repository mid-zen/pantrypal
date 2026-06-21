import { test } from "node:test";
import assert from "node:assert/strict";
import { americanToDecimal, decimalToAmerican, impliedProbability } from "../src/odds.js";
import { findArbitrage } from "../src/arbitrage.js";
import type { GameEvent } from "../src/types.js";

test("american <-> decimal conversions", () => {
  assert.equal(americanToDecimal(150), 2.5);
  assert.ok(Math.abs(americanToDecimal(-150) - 1.6667) < 0.001);
  assert.equal(decimalToAmerican(2.5), 150);
  assert.equal(decimalToAmerican(1.6667), -150);
});

test("implied probability is 1/decimal", () => {
  assert.equal(impliedProbability(2.0), 0.5);
  assert.ok(Math.abs(impliedProbability(4.0) - 0.25) < 1e-9);
});

function twoBookEvent(aPrice: number, bPrice: number): GameEvent {
  return {
    id: "t1",
    sportKey: "test",
    sportTitle: "Test",
    commenceTime: "2026-06-21T00:00:00Z",
    homeTeam: "B",
    awayTeam: "A",
    books: [
      { bookmaker: "Book1", marketKey: "h2h", outcomes: [{ name: "A", price: aPrice }, { name: "B", price: 1.5 }] },
      { bookmaker: "Book2", marketKey: "h2h", outcomes: [{ name: "A", price: 1.5 }, { name: "B", price: bPrice }] },
    ],
  };
}

test("detects a moneyline arbitrage and equalizes payouts", () => {
  // Best A=2.10, Best B=2.15 -> implied sum ~0.941 < 1 -> arb
  const opps = findArbitrage([twoBookEvent(2.10, 2.15)], {
    totalStake: 1000,
    minMarginPct: 0,
    stakeIncrement: 1,
  });
  assert.equal(opps.length, 1);
  const opp = opps[0]!;
  assert.ok(opp.marginPct > 6 && opp.marginPct < 7);
  // Ideal payouts on each leg should be equal (true hedge).
  const payouts = opp.legs.map((l) => l.stake * l.decimal);
  assert.ok(Math.abs(payouts[0]! - payouts[1]!) < 1e-6);
  assert.ok(opp.idealProfit > 0);
});

test("does not flag a normal vig'd market as arbitrage", () => {
  // Best A=1.95, Best B=1.95 -> implied sum ~1.026 > 1 -> no arb
  const opps = findArbitrage([twoBookEvent(1.95, 1.95)], {
    totalStake: 1000,
    minMarginPct: 0,
    stakeIncrement: 1,
  });
  assert.equal(opps.length, 0);
});

test("respects the minimum margin filter", () => {
  const opps = findArbitrage([twoBookEvent(2.10, 2.15)], {
    totalStake: 1000,
    minMarginPct: 10, // edge is ~6.2%, so this filters it out
    stakeIncrement: 1,
  });
  assert.equal(opps.length, 0);
});
