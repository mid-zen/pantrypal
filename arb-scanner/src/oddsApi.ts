/**
 * Client for The Odds API (https://the-odds-api.com), a legal aggregator that
 * serves live odds from ~40 US sportsbooks. We request DECIMAL odds so no
 * conversion is needed before the arbitrage math.
 */

import type { BookmakerMarket, GameEvent, MarketKey, Outcome } from "./types.js";

const BASE = "https://api.the-odds-api.com/v4";

// ---- Raw response shapes from the API ----
interface RawOutcome {
  name: string;
  price: number;
  point?: number;
}
interface RawMarket {
  key: string;
  outcomes: RawOutcome[];
}
interface RawBookmaker {
  key: string;
  title: string;
  markets: RawMarket[];
}
interface RawEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBookmaker[];
}

export interface SportInfo {
  key: string;
  title: string;
  group: string;
  active: boolean;
}

const SUPPORTED_MARKETS: ReadonlySet<string> = new Set(["h2h", "spreads", "totals"]);

function normalize(raw: RawEvent[]): GameEvent[] {
  return raw.map((e) => {
    const books: BookmakerMarket[] = [];
    for (const bm of e.bookmakers ?? []) {
      for (const m of bm.markets ?? []) {
        if (!SUPPORTED_MARKETS.has(m.key)) continue;
        const outcomes: Outcome[] = m.outcomes.map((o) => ({
          name: o.name,
          price: o.price,
          point: o.point,
        }));
        books.push({
          bookmakerKey: bm.key,
          bookmaker: bm.title,
          marketKey: m.key as MarketKey,
          outcomes,
        });
      }
    }
    return {
      id: e.id,
      sportKey: e.sport_key,
      sportTitle: e.sport_title,
      commenceTime: e.commence_time,
      homeTeam: e.home_team,
      awayTeam: e.away_team,
      books,
    };
  });
}

async function apiGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Odds API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  const remaining = res.headers.get("x-requests-remaining");
  if (remaining) process.stderr.write(`  (Odds API requests remaining this month: ${remaining})\n`);
  return (await res.json()) as T;
}

/** List the sports the API currently has odds for. */
export async function listSports(apiKey: string): Promise<SportInfo[]> {
  return apiGet<SportInfo[]>("/sports", { apiKey });
}

export interface FetchOddsArgs {
  apiKey: string;
  sport: string;
  markets: string;
  /** Comma-separated regions (used only when `bookmakers` is not set). */
  regions?: string;
  /**
   * Comma-separated Odds API bookmaker keys. When set, the API returns only
   * these books (across any region) and `regions` is ignored. This is how we
   * restrict the live feed to Ontario-licensed books.
   */
  bookmakers?: string;
}

/** Fetch and normalize odds for one sport. */
export async function fetchOdds(args: FetchOddsArgs): Promise<GameEvent[]> {
  const params: Record<string, string> = {
    apiKey: args.apiKey,
    markets: args.markets,
    oddsFormat: "decimal",
    dateFormat: "iso",
  };
  // Targeting specific bookmakers takes precedence over regions.
  if (args.bookmakers) params.bookmakers = args.bookmakers;
  else params.regions = args.regions ?? "us";

  const raw = await apiGet<RawEvent[]>(`/sports/${args.sport}/odds`, params);
  return normalize(raw);
}
