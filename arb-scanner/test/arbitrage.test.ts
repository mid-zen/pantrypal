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

const FUTURE = new Date(Date.now() + 6 * 3_600_000).toISOString();

function twoBookEvent(aPrice: number, bPrice: number): GameEvent {
  return {
    id: "t1",
    sportKey: "test",
    sportTitle: "Test",
    commenceTime: FUTURE,
    homeTeam: "B",
    awayTeam: "A",
    books: [
      { bookmakerKey: "book1", bookmaker: "Book1", marketKey: "h2h", outcomes: [{ name: "A", price: aPrice }, { name: "B", price: 1.5 }] },
      { bookmakerKey: "book2", bookmaker: "Book2", marketKey: "h2h", outcomes: [{ name: "A", price: 1.5 }, { name: "B", price: bPrice }] },
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

const baseOpts = { totalStake: 1000, minMarginPct: 0, stakeIncrement: 1 };

// ---- spreads must pair by SIGNED line, not |line| ------------------------

function spreadsEvent(books: GameEvent["books"]): GameEvent {
  return {
    id: "sp1",
    sportKey: "basketball_nba",
    sportTitle: "NBA",
    commenceTime: FUTURE,
    homeTeam: "Home",
    awayTeam: "Away",
    books,
  };
}

test("spreads: books disagreeing on the favorite must NOT create a fake arb", () => {
  // Book1 favors Home (-3.5); Book2 favors Away (Home +3.5). Pairing by |3.5|
  // would combine Home -3.5 with Away -3.5 — two bets that can BOTH lose.
  const opps = findArbitrage(
    [
      spreadsEvent([
        {
          bookmakerKey: "book1", bookmaker: "Book1", marketKey: "spreads",
          outcomes: [{ name: "Home", price: 2.1, point: -3.5 }, { name: "Away", price: 1.8, point: 3.5 }],
        },
        {
          bookmakerKey: "book2", bookmaker: "Book2", marketKey: "spreads",
          outcomes: [{ name: "Home", price: 1.8, point: 3.5 }, { name: "Away", price: 2.1, point: -3.5 }],
        },
      ]),
    ],
    baseOpts,
  );
  // The only true pairings are Home -3.5/Away +3.5 (2.1 + 1.8) and
  // Home +3.5/Away -3.5 (1.8 + 2.1); both sum to > 100% implied. No arb.
  assert.equal(opps.length, 0);
});

test("spreads: a real mirrored-line arb is still found", () => {
  const opps = findArbitrage(
    [
      spreadsEvent([
        {
          bookmakerKey: "book1", bookmaker: "Book1", marketKey: "spreads",
          outcomes: [{ name: "Home", price: 2.10, point: -3.5 }, { name: "Away", price: 1.75, point: 3.5 }],
        },
        {
          bookmakerKey: "book2", bookmaker: "Book2", marketKey: "spreads",
          outcomes: [{ name: "Home", price: 1.75, point: -3.5 }, { name: "Away", price: 2.10, point: 3.5 }],
        },
      ]),
    ],
    baseOpts,
  );
  assert.equal(opps.length, 1);
  const legs = opps[0]!.legs;
  assert.deepEqual(legs.map((l) => l.point).sort((a, b) => a! - b!), [-3.5, 3.5]);
  assert.equal(legs.find((l) => l.outcomeName === "Home")!.point, -3.5);
  assert.equal(legs.find((l) => l.outcomeName === "Away")!.point, 3.5);
});

// ---- soccer: two "arb-looking" legs are NOT an arb if the draw can hit ----

test("soccer h2h without a Draw leg is rejected (draw would lose both bets)", () => {
  const event: GameEvent = {
    id: "soc1",
    sportKey: "soccer_epl",
    sportTitle: "EPL",
    commenceTime: FUTURE,
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    books: [
      {
        bookmakerKey: "book1", bookmaker: "Book1", marketKey: "h2h",
        outcomes: [{ name: "Home FC", price: 2.2 }, { name: "Away FC", price: 2.2 }], // no Draw priced
      },
    ],
  };
  assert.equal(findArbitrage([event], baseOpts).length, 0);
});

test("soccer h2h with all three outcomes can arb across books", () => {
  const event: GameEvent = {
    id: "soc2",
    sportKey: "soccer_epl",
    sportTitle: "EPL",
    commenceTime: FUTURE,
    homeTeam: "Home FC",
    awayTeam: "Away FC",
    books: [
      {
        bookmakerKey: "book1", bookmaker: "Book1", marketKey: "h2h",
        outcomes: [{ name: "Home FC", price: 3.4 }, { name: "Draw", price: 3.1 }, { name: "Away FC", price: 2.4 }],
      },
      {
        bookmakerKey: "book2", bookmaker: "Book2", marketKey: "h2h",
        outcomes: [{ name: "Home FC", price: 3.1 }, { name: "Draw", price: 3.6 }, { name: "Away FC", price: 3.4 }],
      },
    ],
  };
  const opps = findArbitrage([event], baseOpts);
  assert.equal(opps.length, 1);
  assert.equal(opps[0]!.legs.length, 3);
  assert.ok(opps[0]!.legs.some((l) => l.outcomeName === "Draw"));
});

// ---- fool-proofing filters ------------------------------------------------

test("games that already started are excluded by default", () => {
  const started = { ...twoBookEvent(2.10, 2.15), commenceTime: new Date(Date.now() - 60_000).toISOString() };
  assert.equal(findArbitrage([started], baseOpts).length, 0);
  assert.equal(findArbitrage([started], { ...baseOpts, includeLive: true }).length, 1);
});

test("stale quotes are dropped from the math", () => {
  const now = Date.now();
  const event = twoBookEvent(2.10, 2.15);
  event.books[0]!.lastUpdate = new Date(now - 60 * 60_000).toISOString(); // 60 min old
  event.books[1]!.lastUpdate = new Date(now - 60_000).toISOString(); // fresh
  // With the stale book gone, only book2's normally-vigged prices remain: no arb.
  assert.equal(findArbitrage([event], { ...baseOpts, now }).length, 0);
  // Disabling the staleness check (0) restores the arb.
  assert.equal(findArbitrage([event], { ...baseOpts, now, maxStalenessMin: 0 }).length, 1);
});

test("an arb whose profit is eaten by stake rounding is dropped", () => {
  // ~1.9% edge, but $5 increments on a $10 stake force a 5/5 split; if the
  // short-priced leg (1.72) wins, payout is $8.60 on $10 staked — a loss. It
  // must not be reported as "guaranteed profit".
  const opps = findArbitrage([twoBookEvent(2.5, 1.72)], {
    totalStake: 10,
    minMarginPct: 0,
    stakeIncrement: 5,
  });
  assert.equal(opps.length, 0);
});

test("suspiciously high edges carry a warning", () => {
  const opps = findArbitrage([twoBookEvent(2.6, 2.6)], baseOpts); // ~30% "edge"
  assert.equal(opps.length, 1);
  assert.ok(opps[0]!.warnings.some((w) => w.includes("suspiciously high")));
});
