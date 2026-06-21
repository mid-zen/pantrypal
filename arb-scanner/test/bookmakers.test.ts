import { test } from "node:test";
import assert from "node:assert/strict";
import { findArbitrage } from "../src/arbitrage.js";
import { SAMPLE_EVENTS } from "../src/sampleData.js";
import {
  ONTARIO_BOOKMAKER_KEYS,
  filterEventsToBooks,
  isOntarioBook,
} from "../src/bookmakers.js";

const scanOpts = { totalStake: 1000, minMarginPct: 0, stakeIncrement: 1 };
const allBookKeys = (events: ReturnType<typeof filterEventsToBooks>) =>
  events.flatMap((e) => e.books.map((b) => b.bookmakerKey));

test("isOntarioBook recognizes licensed vs offshore books", () => {
  assert.ok(isOntarioBook("fanduel"));
  assert.ok(isOntarioBook("bet365"));
  assert.ok(!isOntarioBook("bovada")); // offshore, not licensed in Ontario
  assert.ok(!isOntarioBook("pinnacle"));
});

test("Ontario filter strips out non-licensed books (Bovada)", () => {
  const allowed = new Set(ONTARIO_BOOKMAKER_KEYS);
  const filtered = filterEventsToBooks(SAMPLE_EVENTS, allowed);
  assert.ok(!allBookKeys(filtered).includes("bovada"));
  // Every remaining book must be on the Ontario allowlist.
  for (const key of allBookKeys(filtered)) assert.ok(allowed.has(key));
});

test("filtering changes the arb: offshore price is excluded from the math", () => {
  const allowed = new Set(ONTARIO_BOOKMAKER_KEYS);

  const ontarioOnly = findArbitrage(filterEventsToBooks(SAMPLE_EVENTS, allowed), scanOpts);
  const ontarioMl = ontarioOnly.find((o) => o.marketKey === "h2h");
  assert.ok(ontarioMl, "expected an Ontario-only moneyline arb");
  // Best legal Lakers price is 2.10 -> ~6.24% edge, and no Bovada leg.
  assert.ok(ontarioMl!.marginPct > 6 && ontarioMl!.marginPct < 7);
  assert.ok(!ontarioMl!.legs.some((l) => l.bookmaker === "Bovada"));

  const unfiltered = findArbitrage(filterEventsToBooks(SAMPLE_EVENTS, null), scanOpts);
  const unfilteredMl = unfiltered.find((o) => o.marketKey === "h2h");
  // With Bovada's 2.30 Lakers price, the (illegal-in-Ontario) edge looks bigger.
  assert.ok(unfilteredMl!.marginPct > ontarioMl!.marginPct);
  assert.ok(unfilteredMl!.legs.some((l) => l.bookmaker === "Bovada"));
});

test("null filter (--books all) keeps every book", () => {
  const all = filterEventsToBooks(SAMPLE_EVENTS, null);
  assert.ok(allBookKeys(all).includes("bovada"));
});
