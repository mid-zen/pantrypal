/** A single price offered on one outcome by one bookmaker. */
export interface Outcome {
  /** Outcome label: a team name, "Over", "Under", or "Draw". */
  name: string;
  /** Odds in DECIMAL format (e.g. 2.10). Always normalized to decimal internally. */
  price: number;
  /** Line for spreads/totals (e.g. -3.5, 220.5). Undefined for moneyline. */
  point?: number;
}

/** One market (h2h / spreads / totals) as priced by one bookmaker. */
export interface BookmakerMarket {
  /** The Odds API bookmaker key (stable id, e.g. "fanduel"). Used for filtering. */
  bookmakerKey: string;
  /** Human-readable bookmaker name (e.g. "FanDuel"). Used for display. */
  bookmaker: string;
  marketKey: MarketKey;
  outcomes: Outcome[];
  /**
   * ISO timestamp of when the book last refreshed this market (from the API).
   * A price that hasn't moved in a long time is the classic fake-arb trap: the
   * book has suspended or forgotten the market. Undefined for demo fixtures.
   */
  lastUpdate?: string;
}

export type MarketKey = "h2h" | "spreads" | "totals";

/** A single game with every book's prices attached. */
export interface GameEvent {
  id: string;
  sportKey: string;
  sportTitle: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  books: BookmakerMarket[];
}
