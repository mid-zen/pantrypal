import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTwoLeg } from "../src/arbCalc.js";
import { findHedges } from "../src/arbFinder.js";
import type { GameEvent } from "../src/types.js";

const near = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol;

test("total mode splits a budget to equalize payouts", () => {
  const r = computeTwoLeg({ oddsA: 2.1, oddsB: 2.15, mode: "total", amount: 1000 });
  assert.ok(near(r.stakeA + r.stakeB, 1000, 0.05));
  assert.ok(near(r.payoutA, r.payoutB, 0.5)); // equalized
  assert.ok(r.isArb && r.profit > 50); // ~6.2% edge -> ~$62
  assert.ok(near(r.edgePct, 6.24, 0.1));
});

test("even odds at 2.0/2.0 is break-even", () => {
  const r = computeTwoLeg({ oddsA: 2.0, oddsB: 2.0, mode: "total", amount: 100 });
  assert.equal(r.stakeA, 50);
  assert.equal(r.stakeB, 50);
  assert.equal(r.profit, 0);
  assert.ok(!r.isArb); // S = 1 exactly, not < 1
});

test("fixedA mode hedges a stake you've already placed", () => {
  // $50 on A @2.10, hedge at B @2.15 -> stakeB = 50*2.1/2.15 = 48.84
  const r = computeTwoLeg({ oddsA: 2.1, oddsB: 2.15, mode: "fixedA", amount: 50 });
  assert.equal(r.stakeA, 50);
  assert.ok(near(r.stakeB, 48.84));
  assert.ok(near(r.payoutA, r.payoutB, 0.3));
  assert.ok(r.profit > 0);
});

test("non-arb odds report a locked loss, not a profit", () => {
  const r = computeTwoLeg({ oddsA: 1.9, oddsB: 1.9, mode: "total", amount: 1000 });
  assert.ok(!r.isArb);
  assert.ok(r.profit < 0);
  assert.ok(r.edgePct < 0);
});

test("rejects odds <= 1", () => {
  assert.throws(() => computeTwoLeg({ oddsA: 1.0, oddsB: 2.0, mode: "total", amount: 100 }), /Odds A/);
});

const EVENTS: GameEvent[] = [{
  id: "g1", sportKey: "basketball_nba", sportTitle: "NBA",
  commenceTime: new Date(Date.now() + 6 * 3600_000).toISOString(),
  homeTeam: "Celtics", awayTeam: "Lakers",
  books: [
    { bookmakerKey: "fanduel", bookmaker: "FanDuel", marketKey: "h2h", outcomes: [{ name: "Lakers", price: 2.0 }, { name: "Celtics", price: 1.95 }] },
    { bookmakerKey: "betmgm", bookmaker: "BetMGM", marketKey: "h2h", outcomes: [{ name: "Lakers", price: 2.1 }, { name: "Celtics", price: 1.9 }] },
  ],
}];

test("findHedges finds the best opposite price for your side", () => {
  // You hold Lakers at 2.20. Best hedge is Celtics (best 1.95 at FanDuel).
  const res = findHedges(EVENTS, { yourOdds: 2.2, totalStake: 1000, topN: 10 });
  assert.ok(res.length > 0);
  const lakers = res.find((r) => r.yourSide === "Lakers");
  assert.ok(lakers);
  assert.equal(lakers!.hedgeSide, "Celtics");
  assert.equal(lakers!.hedgeBook, "FanDuel");
  assert.ok(near(lakers!.hedgeOdds, 1.95));
  // 1/2.2 + 1/1.95 = 0.4545 + 0.5128 = 0.9673 < 1 -> profitable
  assert.ok(lakers!.result.profit > 0);
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1]!.result.profit >= res[i]!.result.profit);
});
