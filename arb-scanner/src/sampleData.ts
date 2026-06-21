/**
 * Offline sample data so the scanner runs with `npm run demo` before you have
 * an API key. Prices are hand-built: event #1 has a real moneyline arb (each
 * book is high on a different side); event #2 has a totals arb; the rest are
 * priced normally (no edge) to show that most markets do NOT arb.
 */
import type { GameEvent } from "./types.js";

export const SAMPLE_EVENTS: GameEvent[] = [
  {
    id: "demo-nba-1",
    sportKey: "basketball_nba",
    sportTitle: "NBA",
    commenceTime: "2026-06-21T23:30:00Z",
    homeTeam: "Boston Celtics",
    awayTeam: "Los Angeles Lakers",
    books: [
      {
        bookmaker: "DraftKings",
        marketKey: "h2h",
        outcomes: [
          { name: "Los Angeles Lakers", price: 2.10 },
          { name: "Boston Celtics", price: 1.80 },
        ],
      },
      {
        bookmaker: "FanDuel",
        marketKey: "h2h",
        outcomes: [
          { name: "Los Angeles Lakers", price: 1.75 },
          { name: "Boston Celtics", price: 2.15 },
        ],
      },
      {
        bookmaker: "DraftKings",
        marketKey: "totals",
        outcomes: [
          { name: "Over", price: 1.95, point: 220.5 },
          { name: "Under", price: 1.95, point: 220.5 },
        ],
      },
      {
        bookmaker: "FanDuel",
        marketKey: "totals",
        outcomes: [
          { name: "Over", price: 2.05, point: 220.5 },
          { name: "Under", price: 1.85, point: 220.5 },
        ],
      },
    ],
  },
  {
    id: "demo-mlb-1",
    sportKey: "baseball_mlb",
    sportTitle: "MLB",
    commenceTime: "2026-06-22T00:05:00Z",
    homeTeam: "New York Yankees",
    awayTeam: "Houston Astros",
    books: [
      {
        bookmaker: "BetMGM",
        marketKey: "totals",
        outcomes: [
          { name: "Over", price: 2.08, point: 8.5 },
          { name: "Under", price: 1.83, point: 8.5 },
        ],
      },
      {
        bookmaker: "Caesars",
        marketKey: "totals",
        outcomes: [
          { name: "Over", price: 1.80, point: 8.5 },
          { name: "Under", price: 2.10, point: 8.5 },
        ],
      },
      {
        bookmaker: "BetMGM",
        marketKey: "h2h",
        outcomes: [
          { name: "Houston Astros", price: 1.90 },
          { name: "New York Yankees", price: 1.95 },
        ],
      },
      {
        bookmaker: "Caesars",
        marketKey: "h2h",
        outcomes: [
          { name: "Houston Astros", price: 1.92 },
          { name: "New York Yankees", price: 1.93 },
        ],
      },
    ],
  },
];
