/**
 * Promo bet finder.
 *
 * Given a promo (e.g. a $100 free bet at BetMGM), scan the live odds and find the
 * game + market that MAXIMIZES the locked-in profit. The back leg is placed at
 * the promo app; the hedge leg goes to whichever OTHER book offers the best price
 * on the opposite outcome.
 *
 * It reuses the arbitrage engine's market-pairing rules (2-outcome markets only —
 * a single hedge can't cover a 3-way market) and the promo math (`calcPromo`).
 */

import type { GameEvent, MarketKey } from "./types.js";
import { calcPromo, type PromoCalcInput, type PromoLeg } from "./promos.js";

export interface FinderOptions {
  /** Odds API key of the app the promo is at (the back leg must be here). */
  promoBookKey: string;
  stakeIncrement?: number;
  topN?: number;
  includeLive?: boolean;
  now?: number;
}

export interface FinderResult {
  eventId: string;
  sportTitle: string;
  matchup: string;
  commenceTime: string;
  marketLabel: string;
  guaranteedProfit: number;
  conversionPct?: number;
  cashAtRisk: number;
  legs: PromoLeg[];
  summary: string;
  /** The concrete promo input used — lets the UI prefill the calculator / save it. */
  input: PromoCalcInput;
}

interface Side {
  name: string;
  point?: number;
  /** Best price on this side at the promo book. */
  promo?: number;
  /** Best price on this side among OTHER books, with the book's title. */
  best?: { decimal: number; book: string };
}

const MARKET_LABELS: Record<MarketKey, string> = {
  h2h: "Moneyline",
  totals: "Total",
  spreads: "Spread",
};

/** Gather the promo-book price and best other-book price for one outcome. */
function priceForSide(
  event: GameEvent,
  marketKey: MarketKey,
  name: string,
  point: number | undefined,
  promoBookKey: string,
): Side {
  const side: Side = { name, point };
  for (const b of event.books) {
    if (b.marketKey !== marketKey) continue;
    for (const o of b.outcomes) {
      if (o.name !== name || o.point !== point) continue;
      if (b.bookmakerKey === promoBookKey) {
        if (side.promo === undefined || o.price > side.promo) side.promo = o.price;
      } else if (!side.best || o.price > side.best.decimal) {
        side.best = { decimal: o.price, book: b.bookmaker };
      }
    }
  }
  return side;
}

/** All valid 2-outcome market instances for an event, as {sideX, sideY}. */
function enumerateInstances(event: GameEvent, promoBookKey: string): { label: string; x: Side; y: Side }[] {
  const out: { label: string; x: Side; y: Side }[] = [];

  // Moneyline — 2-way only. A free bet can't be hedged on a 3-way (soccer/draw).
  const hasDraw = event.books.some((b) => b.marketKey === "h2h" && b.outcomes.some((o) => o.name === "Draw"));
  if (!hasDraw && !event.sportKey.startsWith("soccer")) {
    out.push({
      label: MARKET_LABELS.h2h,
      x: priceForSide(event, "h2h", event.homeTeam, undefined, promoBookKey),
      y: priceForSide(event, "h2h", event.awayTeam, undefined, promoBookKey),
    });
  }

  // Totals — one instance per line.
  const totalPoints = new Set<number>();
  for (const b of event.books) if (b.marketKey === "totals") for (const o of b.outcomes) if (o.point !== undefined) totalPoints.add(o.point);
  for (const point of totalPoints) {
    out.push({
      label: `${MARKET_LABELS.totals} ${point}`,
      x: priceForSide(event, "totals", "Over", point, promoBookKey),
      y: priceForSide(event, "totals", "Under", point, promoBookKey),
    });
  }

  // Spreads — pair home@L with away@−L (signed), matching the arb engine.
  const homeLines = new Set<number>();
  for (const b of event.books) if (b.marketKey === "spreads") for (const o of b.outcomes) if (o.name === event.homeTeam && o.point !== undefined) homeLines.add(o.point);
  for (const L of homeLines) {
    out.push({
      label: `${MARKET_LABELS.spreads} ${L > 0 ? "+" : ""}${L}`,
      x: priceForSide(event, "spreads", event.homeTeam, L, promoBookKey),
      y: priceForSide(event, "spreads", event.awayTeam, -L, promoBookKey),
    });
  }
  return out;
}

const sideLabel = (s: Side) =>
  s.point !== undefined && (s.name === "Over" || s.name === "Under")
    ? `${s.name} ${s.point}`
    : s.point !== undefined
      ? `${s.name} ${s.point > 0 ? "+" : ""}${s.point}`
      : s.name;

/** Find the promo bets that maximize locked-in profit, best first. */
export function findBestPromoBets(
  events: GameEvent[],
  promo: PromoCalcInput,
  opts: FinderOptions,
): FinderResult[] {
  const now = opts.now ?? Date.now();
  const inc = opts.stakeIncrement ?? 0.01;
  const results: FinderResult[] = [];

  for (const event of events) {
    if (!opts.includeLive && Date.parse(event.commenceTime) <= now) continue;
    // The promo book must actually be in this event.
    const promoBook = event.books.find((b) => b.bookmakerKey === opts.promoBookKey);
    if (!promoBook) continue;
    const promoBookTitle = promoBook.bookmaker;

    for (const inst of enumerateInstances(event, opts.promoBookKey)) {
      for (const [back, hedge] of [[inst.x, inst.y], [inst.y, inst.x]] as [Side, Side][]) {
        if (back.promo === undefined || !hedge.best) continue; // need promo price + a hedge elsewhere
        const input: PromoCalcInput = {
          ...promo,
          backOdds: back.promo,
          hedgeOdds: hedge.best.decimal,
          stakeIncrement: inc,
          bookA: promoBookTitle,
          bookB: hedge.best.book,
          outcomeX: sideLabel(back),
          outcomeY: sideLabel(hedge),
        };
        let r;
        try {
          r = calcPromo(input);
        } catch {
          continue; // invalid combo (e.g. odds ≤ 1)
        }
        results.push({
          eventId: event.id,
          sportTitle: event.sportTitle,
          matchup: `${event.awayTeam} @ ${event.homeTeam}`,
          commenceTime: event.commenceTime,
          marketLabel: inst.label,
          guaranteedProfit: r.guaranteedProfit,
          conversionPct: r.conversionPct,
          cashAtRisk: r.cashAtRisk,
          legs: r.legs,
          summary: r.summary,
          input,
        });
      }
    }
  }

  results.sort((a, b) => b.guaranteedProfit - a.guaranteedProfit);
  return results.slice(0, opts.topN ?? 20);
}
