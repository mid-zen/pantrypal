/**
 * Arbitrage detection and stake allocation.
 *
 * The idea: a market (e.g. moneyline) has a set of mutually exclusive,
 * collectively exhaustive outcomes (Team A wins / Team B wins, or Over / Under).
 * For each outcome we take the BEST (highest) decimal price available across all
 * books. If the sum of implied probabilities of those best prices is < 1, the
 * book's combined margin has gone negative and a guaranteed profit exists.
 *
 *   S = Σ (1 / bestDecimalOdds_i)
 *   arbitrage exists  ⇔  S < 1
 *   return on total stake = (1 / S) - 1
 *
 * Stake split (for total stake T): stake_i = T * (1/d_i) / S.
 * Then every outcome pays back T / S, i.e. the same guaranteed return.
 *
 * "Guaranteed" is only true if the legs really are exhaustive and complementary,
 * so this module is strict about market structure:
 *   • h2h legs must be exactly {home, away} — plus Draw for soccer (a 2-leg
 *     soccer "arb" loses BOTH legs on a draw).
 *   • spreads are paired by SIGNED line (home at L with away at −L). Pairing by
 *     absolute value would sometimes put both teams on the SAME side of the
 *     spread (when books disagree on the favorite), and both legs can lose.
 *   • totals need Over and Under at the exact same line.
 *   • quotes older than `maxStalenessMin` are dropped — a price a book hasn't
 *     touched in a long time is usually suspended, not generous.
 *   • events that have already started are skipped by default (in-play lines
 *     move and get suspended too fast to place two legs safely).
 *   • an opportunity is dropped if stake rounding eats the whole edge
 *     (worst-case profit must stay positive).
 */

import type { GameEvent, MarketKey, Outcome } from "./types.js";
import { impliedProbability } from "./odds.js";

/** Best available price for one outcome, plus which book offers it. */
interface BestPrice {
  name: string;
  point?: number;
  bookmaker: string;
  decimal: number;
  lastUpdate?: string;
}

/** A complete market (every outcome present) assembled from best prices. */
interface MarketCandidate {
  marketKey: MarketKey;
  /** Line, for totals/spreads (spreads: the HOME team's line). */
  point?: number;
  legs: BestPrice[];
}

export interface ArbLeg {
  outcomeName: string;
  point?: number;
  bookmaker: string;
  decimal: number;
  impliedProb: number;
  /** Ideal (fractional) stake. */
  stake: number;
  /** Stake rounded to the configured increment, what you'd actually bet. */
  roundedStake: number;
  /** Payout if this leg wins, using the rounded stake. */
  payout: number;
  /** When the book last refreshed this price (ISO), if known. */
  lastUpdate?: string;
}

export interface ArbOpportunity {
  eventId: string;
  sportTitle: string;
  matchup: string;
  commenceTime: string;
  marketKey: MarketKey;
  marketLabel: string;
  point?: number;
  impliedSum: number;
  /** Return on total stake, as a percentage. */
  marginPct: number;
  totalStake: number;
  legs: ArbLeg[];
  /** Profit using ideal fractional stakes (the theoretical edge). */
  idealProfit: number;
  /** Guaranteed profit in the WORST outcome after integer rounding. */
  worstCaseProfit: number;
  /** Reasons to double-check before staking (stale price, huge edge, …). */
  warnings: string[];
}

export interface ScanOptions {
  totalStake: number;
  /** Only report arbs with at least this return %, e.g. 0.5 for 0.5%. */
  minMarginPct: number;
  /** Round real stakes to this increment (e.g. 1 = whole dollars). */
  stakeIncrement: number;
  /**
   * Drop quotes the book hasn't refreshed within this many minutes (only when
   * the feed provides a timestamp). Default 15. 0 disables the check.
   */
  maxStalenessMin?: number;
  /** Include events that have already started (in-play). Default false. */
  includeLive?: boolean;
  /** "Now" for staleness/live checks; injectable for tests. */
  now?: number;
}

const DEFAULT_MAX_STALENESS_MIN = 15;

/** Edges above this are almost always a stale or erroneous price. */
const TOO_GOOD_MARGIN_PCT = 10;

/** Highest decimal price for each distinct outcome name across all books. */
function bestByName(outcomes: { o: Outcome; book: string; lastUpdate?: string }[]): Map<string, BestPrice> {
  const best = new Map<string, BestPrice>();
  for (const { o, book, lastUpdate } of outcomes) {
    const current = best.get(o.name);
    if (!current || o.price > current.decimal) {
      best.set(o.name, { name: o.name, point: o.point, bookmaker: book, decimal: o.price, lastUpdate });
    }
  }
  return best;
}

/**
 * Moneyline: one candidate covering every outcome of the game.
 *
 * Strict exhaustiveness: legs must be exactly {home, away}, plus "Draw" if this
 * is a 3-way sport (soccer) or any book lists a Draw. Outcomes with any other
 * name are ignored (a naming mismatch must never masquerade as a second side).
 */
function h2hCandidates(event: GameEvent): MarketCandidate[] {
  const all: { o: Outcome; book: string; lastUpdate?: string }[] = [];
  let drawSeen = false;
  for (const b of event.books) {
    if (b.marketKey !== "h2h") continue;
    for (const o of b.outcomes) {
      if (o.name === "Draw") drawSeen = true;
      if (o.name !== event.homeTeam && o.name !== event.awayTeam && o.name !== "Draw") continue;
      all.push({ o, book: b.bookmaker, lastUpdate: b.lastUpdate });
    }
  }
  if (all.length === 0) return [];
  const best = bestByName(all);

  const required = [event.homeTeam, event.awayTeam];
  const threeWay = drawSeen || event.sportKey.startsWith("soccer");
  if (threeWay) required.push("Draw");
  if (!required.every((name) => best.has(name))) return []; // not exhaustive → not an arb

  return [{ marketKey: "h2h", legs: required.map((name) => best.get(name)!) }];
}

/** Totals: one candidate per line, requiring both Over and Under at that line. */
function totalsCandidates(event: GameEvent): MarketCandidate[] {
  // point -> best Over / best Under
  const byPoint = new Map<number, { o: Outcome; book: string; lastUpdate?: string }[]>();
  for (const b of event.books) {
    if (b.marketKey !== "totals") continue;
    for (const o of b.outcomes) {
      if (o.point === undefined) continue;
      const list = byPoint.get(o.point) ?? [];
      list.push({ o, book: b.bookmaker, lastUpdate: b.lastUpdate });
      byPoint.set(o.point, list);
    }
  }
  const candidates: MarketCandidate[] = [];
  for (const [point, list] of byPoint) {
    const best = bestByName(list);
    const over = best.get("Over");
    const under = best.get("Under");
    if (over && under) {
      candidates.push({ marketKey: "totals", point, legs: [over, under] });
    }
  }
  return candidates;
}

/**
 * Spreads: a complete market is home at line L paired with away at line −L —
 * matched by SIGNED value. Books can disagree on which team is favored, so the
 * same |L| can carry home −L at one book and home +L at another; pairing by
 * absolute value could put both teams on the same side of the spread, and then
 * both legs can lose. We group by the home team's signed line instead.
 */
function spreadsCandidates(event: GameEvent): MarketCandidate[] {
  // homeLine -> best home price at that line / best away price at the mirror
  interface Sides { home?: BestPrice; away?: BestPrice }
  const byHomeLine = new Map<number, Sides>();

  const consider = (homeLine: number, side: "home" | "away", price: BestPrice) => {
    const sides = byHomeLine.get(homeLine) ?? {};
    const current = sides[side];
    if (!current || price.decimal > current.decimal) sides[side] = price;
    byHomeLine.set(homeLine, sides);
  };

  for (const b of event.books) {
    if (b.marketKey !== "spreads") continue;
    for (const o of b.outcomes) {
      if (o.point === undefined) continue;
      const price: BestPrice = {
        name: o.name,
        point: o.point,
        bookmaker: b.bookmaker,
        decimal: o.price,
        lastUpdate: b.lastUpdate,
      };
      if (o.name === event.homeTeam) consider(o.point, "home", price);
      else if (o.name === event.awayTeam) consider(-o.point, "away", price);
      // Any other name is a data mismatch — never let it into the math.
    }
  }

  const candidates: MarketCandidate[] = [];
  for (const [homeLine, sides] of byHomeLine) {
    if (sides.home && sides.away) {
      candidates.push({ marketKey: "spreads", point: homeLine, legs: [sides.home, sides.away] });
    }
  }
  return candidates;
}

const MARKET_LABELS: Record<MarketKey, string> = {
  h2h: "Moneyline",
  totals: "Total (Over/Under)",
  spreads: "Spread",
};

function stalenessWarnings(legs: BestPrice[], maxAgeMin: number, now: number): string[] {
  const warnings: string[] = [];
  for (const l of legs) {
    if (!l.lastUpdate) continue;
    const ageMin = (now - Date.parse(l.lastUpdate)) / 60_000;
    if (ageMin > maxAgeMin / 3 && ageMin <= maxAgeMin) {
      warnings.push(`${l.bookmaker}'s price is ${Math.round(ageMin)} min old — re-check it in the app.`);
    }
  }
  return warnings;
}

function buildOpportunity(
  event: GameEvent,
  candidate: MarketCandidate,
  opts: ScanOptions,
  now: number,
  maxStalenessMin: number,
): ArbOpportunity | null {
  const impliedSum = candidate.legs.reduce((s, l) => s + impliedProbability(l.decimal), 0);
  if (impliedSum >= 1) return null; // no edge

  const marginPct = (1 / impliedSum - 1) * 100;
  if (marginPct < opts.minMarginPct) return null;

  const inc = opts.stakeIncrement;
  const legs: ArbLeg[] = candidate.legs.map((l) => {
    const p = impliedProbability(l.decimal);
    const stake = (opts.totalStake * p) / impliedSum;
    const roundedStake = Math.max(inc, Math.round(stake / inc) * inc);
    return {
      outcomeName: l.name,
      point: l.point,
      bookmaker: l.bookmaker,
      decimal: l.decimal,
      impliedProb: p,
      stake,
      roundedStake,
      payout: roundedStake * l.decimal,
      lastUpdate: l.lastUpdate,
    };
  });

  const idealReturn = opts.totalStake / impliedSum;
  const idealProfit = idealReturn - opts.totalStake;

  const totalRounded = legs.reduce((s, l) => s + l.roundedStake, 0);
  const worstPayout = Math.min(...legs.map((l) => l.payout));
  const worstCaseProfit = worstPayout - totalRounded;
  // Rounding ate the edge — "guaranteed profit" would be a loss. Not an arb.
  if (worstCaseProfit <= 0) return null;

  const warnings: string[] = [];
  if (marginPct > TOO_GOOD_MARGIN_PCT) {
    warnings.push(
      `${marginPct.toFixed(1)}% is suspiciously high — usually a stale or wrong price. Verify both apps before staking.`,
    );
  }
  const books = new Set(legs.map((l) => l.bookmaker));
  if (books.size === 1) {
    warnings.push(
      `Both legs are at ${legs[0]!.bookmaker} — a single book rarely arbs itself; the price is likely stale.`,
    );
  }
  warnings.push(...stalenessWarnings(candidate.legs, maxStalenessMin, now));

  const label =
    candidate.point !== undefined
      ? `${MARKET_LABELS[candidate.marketKey]} ${candidate.point}`
      : MARKET_LABELS[candidate.marketKey];

  return {
    eventId: event.id,
    sportTitle: event.sportTitle,
    matchup: `${event.awayTeam} @ ${event.homeTeam}`,
    commenceTime: event.commenceTime,
    marketKey: candidate.marketKey,
    marketLabel: label,
    point: candidate.point,
    impliedSum,
    marginPct,
    totalStake: opts.totalStake,
    legs,
    idealProfit,
    worstCaseProfit,
    warnings,
  };
}

/** Drop markets whose quote is older than the staleness cutoff (when known). */
function dropStaleBooks(event: GameEvent, maxAgeMin: number, now: number): GameEvent {
  if (maxAgeMin <= 0) return event;
  const cutoff = now - maxAgeMin * 60_000;
  return {
    ...event,
    books: event.books.filter((b) => {
      if (!b.lastUpdate) return true; // demo fixtures carry no timestamp
      const t = Date.parse(b.lastUpdate);
      return !Number.isFinite(t) || t >= cutoff;
    }),
  };
}

/** Scan every event/market and return arbitrage opportunities, best first. */
export function findArbitrage(events: GameEvent[], opts: ScanOptions): ArbOpportunity[] {
  const now = opts.now ?? Date.now();
  const maxStalenessMin = opts.maxStalenessMin ?? DEFAULT_MAX_STALENESS_MIN;
  const out: ArbOpportunity[] = [];
  for (const rawEvent of events) {
    // In-play games: lines move and suspend too fast to reliably place 2 legs.
    if (!opts.includeLive && Date.parse(rawEvent.commenceTime) <= now) continue;
    const event = dropStaleBooks(rawEvent, maxStalenessMin, now);
    const candidates = [
      ...h2hCandidates(event),
      ...totalsCandidates(event),
      ...spreadsCandidates(event),
    ];
    for (const c of candidates) {
      const opp = buildOpportunity(event, c, opts, now, maxStalenessMin);
      if (opp) out.push(opp);
    }
  }
  return out.sort((a, b) => b.marginPct - a.marginPct);
}
