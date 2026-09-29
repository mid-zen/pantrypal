import { test } from "node:test";
import assert from "node:assert/strict";
import { findBestPromoBets } from "../src/promoFinder.js";
import type { GameEvent } from "../src/types.js";

const future = () => new Date(Date.now() + 6 * 3600_000).toISOString();

// Two books on one game. Promo book = BetMGM. FanDuel is the hedge option.
const EVENTS: GameEvent[] = [
  {
    id: "g1", sportKey: "basketball_nba", sportTitle: "NBA", commenceTime: future(),
    homeTeam: "Celtics", awayTeam: "Lakers",
    books: [
      { bookmakerKey: "betmgm", bookmaker: "BetMGM", marketKey: "h2h", outcomes: [
        { name: "Lakers", price: 4.0 }, { name: "Celtics", price: 1.28 },
      ] },
      { bookmakerKey: "fanduel", bookmaker: "FanDuel", marketKey: "h2h", outcomes: [
        { name: "Lakers", price: 3.7 }, { name: "Celtics", price: 1.30 },
      ] },
    ],
  },
];

test("finds the best free-bet play with back leg at the promo book", () => {
  const res = findBestPromoBets(EVENTS, { type: "free_bet", freeBetAmount: 100, backOdds: 2, hedgeOdds: 2 }, {
    promoBookKey: "betmgm", topN: 10,
  });
  assert.ok(res.length > 0);
  const best = res[0]!;
  // Best free-bet play backs the long shot (Lakers 4.0) at BetMGM, hedges Celtics elsewhere.
  assert.equal(best.input.bookA, "BetMGM");
  assert.equal(best.input.backOdds, 4.0);
  assert.equal(best.legs[0]!.book, "BetMGM"); // back leg at promo book
  assert.equal(best.legs[1]!.book, "FanDuel"); // hedge at the other book
  assert.ok(best.guaranteedProfit > 0);
  // Results are sorted by profit, descending.
  for (let i = 1; i < res.length; i++) assert.ok(res[i - 1]!.guaranteedProfit >= res[i]!.guaranteedProfit);
});

test("returns nothing when the promo book isn't in the feed", () => {
  const res = findBestPromoBets(EVENTS, { type: "free_bet", freeBetAmount: 100, backOdds: 2, hedgeOdds: 2 }, {
    promoBookKey: "bet365", // not in the sample
  });
  assert.equal(res.length, 0);
});

test("needs a DIFFERENT book to hedge at", () => {
  // Only BetMGM present -> no hedge option -> no results.
  const solo: GameEvent[] = [{ ...EVENTS[0]!, books: [EVENTS[0]!.books[0]!] }];
  const res = findBestPromoBets(solo, { type: "free_bet", freeBetAmount: 100, backOdds: 2, hedgeOdds: 2 }, {
    promoBookKey: "betmgm",
  });
  assert.equal(res.length, 0);
});

test("skips games that have already started", () => {
  const started: GameEvent[] = [{ ...EVENTS[0]!, commenceTime: new Date(Date.now() - 3600_000).toISOString() }];
  const res = findBestPromoBets(started, { type: "free_bet", freeBetAmount: 100, backOdds: 2, hedgeOdds: 2 }, {
    promoBookKey: "betmgm",
  });
  assert.equal(res.length, 0);
});
