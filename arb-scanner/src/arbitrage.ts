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
 */

import type { GameEvent, MarketKey, Outcome } from "./types.js";
import { impliedProbability } from "./odds.js";

/** Best available price for one outcome, plus which book offers it. */
interface BestPrice {
  name: string;
  point?: number;
  bookmaker: string;
  decimal: number;
}

/** A complete market (every outcome present) assembled from best prices. */
interface MarketCandidate {
  marketKey: MarketKey;
  /** Line, for totals/spreads. */
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
}

export interface ScanOptions {
  totalStake: number;
  /** Only report arbs with at least this return %, e.g. 0.5 for 0.5%. */
  minMarginPct: number;
  /** Round real stakes to this increment (e.g. 1 = whole dollars). */
  stakeIncrement: number;
}

/** Highest decimal price for each distinct outcome name across all books. */
function bestByName(outcomes: { o: Outcome; book: string }[]): Map<string, BestPrice> {
  const best = new Map<string, BestPrice>();
  for (const { o, book } of outcomes) {
    const current = best.get(o.name);
    if (!current || o.price > current.decimal) {
      best.set(o.name, { name: o.name, point: o.point, bookmaker: book, decimal: o.price });
    }
  }
  return best;
}

/** Moneyline: one candidate covering every distinct team/draw outcome. */
function h2hCandidates(event: GameEvent): MarketCandidate[] {
  const all: { o: Outcome; book: string }[] = [];
  for (const b of event.books) {
    if (b.marketKey !== "h2h") continue;
    for (const o of b.outcomes) all.push({ o, book: b.bookmaker });
  }
  if (all.length === 0) return [];
  const best = bestByName(all);
  // A valid moneyline has 2 (most sports) or 3 (soccer w/ draw) outcomes.
  if (best.size < 2) return [];
  return [{ marketKey: "h2h", legs: [...best.values()] }];
}

/** Totals: one candidate per line, requiring both Over and Under at that line. */
function totalsCandidates(event: GameEvent): MarketCandidate[] {
  // point -> best Over / best Under
  const byPoint = new Map<number, { o: Outcome; book: string }[]>();
  for (const b of event.books) {
    if (b.marketKey !== "totals") continue;
    for (const o of b.outcomes) {
      if (o.point === undefined) continue;
      const list = byPoint.get(o.point) ?? [];
      list.push({ o, book: b.bookmaker });
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
 * Spreads: a complete market is the two teams on mirrored lines (+L / -L).
 * Group by absolute line value and require both sides present.
 */
function spreadsCandidates(event: GameEvent): MarketCandidate[] {
  const byAbs = new Map<number, { o: Outcome; book: string }[]>();
  for (const b of event.books) {
    if (b.marketKey !== "spreads") continue;
    for (const o of b.outcomes) {
      if (o.point === undefined) continue;
      const key = Math.abs(o.point);
      const list = byAbs.get(key) ?? [];
      list.push({ o, book: b.bookmaker });
      byAbs.set(key, list);
    }
  }
  const candidates: MarketCandidate[] = [];
  for (const [absLine, list] of byAbs) {
    // Best price per team name at this |line|. The two sides naturally carry
    // opposite signs, so taking best-per-name yields one leg per team.
    const best = bestByName(list);
    if (best.size === 2) {
      candidates.push({ marketKey: "spreads", point: absLine, legs: [...best.values()] });
    }
  }
  return candidates;
}

const MARKET_LABELS: Record<MarketKey, string> = {
  h2h: "Moneyline",
  totals: "Total (Over/Under)",
  spreads: "Spread",
};

function buildOpportunity(
  event: GameEvent,
  candidate: MarketCandidate,
  opts: ScanOptions,
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
    };
  });

  const idealReturn = opts.totalStake / impliedSum;
  const idealProfit = idealReturn - opts.totalStake;

  const totalRounded = legs.reduce((s, l) => s + l.roundedStake, 0);
  const worstPayout = Math.min(...legs.map((l) => l.payout));
  const worstCaseProfit = worstPayout - totalRounded;

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
  };
}

/** Scan every event/market and return arbitrage opportunities, best first. */
export function findArbitrage(events: GameEvent[], opts: ScanOptions): ArbOpportunity[] {
  const out: ArbOpportunity[] = [];
  for (const event of events) {
    const candidates = [
      ...h2hCandidates(event),
      ...totalsCandidates(event),
      ...spreadsCandidates(event),
    ];
    for (const c of candidates) {
      const opp = buildOpportunity(event, c, opts);
      if (opp) out.push(opp);
    }
  }
  return out.sort((a, b) => b.marginPct - a.marginPct);
}
