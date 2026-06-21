/**
 * Ontario bookmaker allowlist.
 *
 * The scanner will ONLY consider odds from books on this list, so it never
 * suggests a bet at a sportsbook that isn't legal/licensed for Ontario players.
 * Anything not listed here — including offshore books (Bovada, BetOnline,
 * MyBookie, Pinnacle, etc.) which are NOT licensed in Ontario — is dropped.
 *
 * IMPORTANT — keep this in sync with reality:
 *   • Source of truth for who is licensed: iGaming Ontario's official registry
 *     https://igamingontario.ca/en/player/regulated-igaming-market
 *   • `key` must match The Odds API's bookmaker key exactly, or that book's
 *     prices won't be fetched. See https://the-odds-api.com (bookmaker list).
 *
 * NOTE ON PRICES: The Odds API has no dedicated Ontario region; for these brands
 * it serves their US/UK feed. The brand is Ontario-licensed, but the exact line
 * can differ from the operator's Ontario (.ca) app — always confirm in-app
 * before staking.
 *
 * To add a book: confirm it's on the iGO registry AND find its Odds API key,
 * then add a line below. To exclude one, delete its line.
 */

import type { GameEvent } from "./types.js";

export interface Bookmaker {
  /** The Odds API bookmaker key. */
  key: string;
  /** Display name. */
  title: string;
}

/** Confirmed: Ontario-licensed brands that The Odds API also covers. */
export const ONTARIO_BOOKMAKERS: Bookmaker[] = [
  { key: "bet365", title: "bet365" },
  { key: "fanduel", title: "FanDuel" },
  { key: "draftkings", title: "DraftKings" },
  { key: "betmgm", title: "BetMGM" },
  { key: "caesars", title: "Caesars" },
  { key: "betrivers", title: "BetRivers" },
];

/*
 * Candidates to add once you've confirmed (a) current Ontario license on the iGO
 * registry and (b) the exact Odds API bookmaker key:
 *   PointsBet, theScore Bet, Bally Bet, Betway, 888sport, BetVictor, Unibet,
 *   LeoVegas, bet99, Hard Rock Bet.
 */

export const ONTARIO_BOOKMAKER_KEYS: string[] = ONTARIO_BOOKMAKERS.map((b) => b.key);

const ONTARIO_KEY_SET = new Set(ONTARIO_BOOKMAKER_KEYS);

export function isOntarioBook(key: string): boolean {
  return ONTARIO_KEY_SET.has(key);
}

/** Comma-separated keys, for The Odds API `bookmakers` query parameter. */
export function ontarioBookmakersParam(): string {
  return ONTARIO_BOOKMAKER_KEYS.join(",");
}

export interface BookSelection {
  /** Client-side filter set; null means "allow all books". */
  allowedKeys: Set<string> | null;
  /** Value for The Odds API `bookmakers` param; undefined means use regions. */
  requestBooks?: string;
  /** Display titles of the selected books, or null for "all". */
  titles: string[] | null;
  label: string;
}

/**
 * Turn a `--books` value ("ontario" | "all" | "key1,key2") into a concrete
 * selection used by both the CLI and the web server.
 */
export function resolveBooks(mode: string): BookSelection {
  const m = (mode || "ontario").trim().toLowerCase();
  if (m === "all") {
    return {
      allowedKeys: null,
      requestBooks: undefined,
      titles: null,
      label: "All books (NOT Ontario-filtered)",
    };
  }
  if (m === "ontario") {
    return {
      allowedKeys: new Set(ONTARIO_BOOKMAKER_KEYS),
      requestBooks: ontarioBookmakersParam(),
      titles: ONTARIO_BOOKMAKERS.map((b) => b.title),
      label: "Ontario-licensed books",
    };
  }
  const keys = m.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    allowedKeys: new Set(keys),
    requestBooks: keys.join(","),
    titles: keys,
    label: "Custom book set",
  };
}

/**
 * Drop every book whose key isn't in `allowed` (a Set of Odds API keys).
 * Pass `null` to disable filtering (allow all books). This is the safety net
 * that guarantees no non-Ontario book ever reaches the arbitrage math.
 */
export function filterEventsToBooks(
  events: GameEvent[],
  allowed: Set<string> | null,
): GameEvent[] {
  if (allowed === null) return events;
  return events.map((e) => ({
    ...e,
    books: e.books.filter((b) => allowed.has(b.bookmakerKey)),
  }));
}
