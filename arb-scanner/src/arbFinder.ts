/**
 * "Find the other half" — you have one side of a bet at a known price; scan the
 * feed for the best price on the OPPOSITE outcome and compute the stake split.
 *
 * For each 2-outcome market, each outcome is treated in turn as "your side"
 * (priced at your entered odds), and the hedge is the best available price on the
 * opposite outcome across the Ontario books. Ranked by profit.
 */

import type { GameEvent, MarketKey } from "./types.js";
import { computeTwoLeg, type TwoLegResult } from "./arbCalc.js";

export interface HedgeFinderOptions {
  /** Your odds on the side you hold, as decimal. */
  yourOdds: number;
  totalStake: number;
  topN?: number;
  includeLive?: boolean;
  now?: number;
}

export interface HedgeResult {
  eventId: string;
  sportTitle: string;
  matchup: string;
  commenceTime: string;
  marketLabel: string;
  yourSide: string;
  hedgeSide: string;
  hedgeBook: string;
  hedgeOdds: number; // decimal
  result: TwoLegResult;
}

interface Side { name: string; point?: number; best?: { decimal: number; book: string }; }

const MARKET_LABELS: Record<MarketKey, string> = { h2h: "Moneyline", totals: "Total", spreads: "Spread" };

/** Best price on one outcome across all books in the event. */
function bestForSide(event: GameEvent, marketKey: MarketKey, name: string, point: number | undefined): Side {
  const side: Side = { name, point };
  for (const b of event.books) {
    if (b.marketKey !== marketKey) continue;
    for (const o of b.outcomes) {
      if (o.name !== name || o.point !== point) continue;
      if (!side.best || o.price > side.best.decimal) side.best = { decimal: o.price, book: b.bookmaker };
    }
  }
  return side;
}

function instances(event: GameEvent): { label: string; x: Side; y: Side }[] {
  const out: { label: string; x: Side; y: Side }[] = [];
  const hasDraw = event.books.some((b) => b.marketKey === "h2h" && b.outcomes.some((o) => o.name === "Draw"));
  if (!hasDraw && !event.sportKey.startsWith("soccer")) {
    out.push({ label: MARKET_LABELS.h2h, x: bestForSide(event, "h2h", event.homeTeam, undefined), y: bestForSide(event, "h2h", event.awayTeam, undefined) });
  }
  const totalPoints = new Set<number>();
  for (const b of event.books) if (b.marketKey === "totals") for (const o of b.outcomes) if (o.point !== undefined) totalPoints.add(o.point);
  for (const p of totalPoints) {
    out.push({ label: `${MARKET_LABELS.totals} ${p}`, x: bestForSide(event, "totals", "Over", p), y: bestForSide(event, "totals", "Under", p) });
  }
  const homeLines = new Set<number>();
  for (const b of event.books) if (b.marketKey === "spreads") for (const o of b.outcomes) if (o.name === event.homeTeam && o.point !== undefined) homeLines.add(o.point);
  for (const L of homeLines) {
    out.push({ label: `${MARKET_LABELS.spreads} ${L > 0 ? "+" : ""}${L}`, x: bestForSide(event, "spreads", event.homeTeam, L), y: bestForSide(event, "spreads", event.awayTeam, -L) });
  }
  return out;
}

const sideLabel = (s: Side) =>
  s.point !== undefined && (s.name === "Over" || s.name === "Under") ? `${s.name} ${s.point}`
    : s.point !== undefined ? `${s.name} ${s.point > 0 ? "+" : ""}${s.point}` : s.name;

export function findHedges(events: GameEvent[], opts: HedgeFinderOptions): HedgeResult[] {
  const now = opts.now ?? Date.now();
  const results: HedgeResult[] = [];
  for (const event of events) {
    if (!opts.includeLive && Date.parse(event.commenceTime) <= now) continue;
    for (const inst of instances(event)) {
      for (const [your, hedge] of [[inst.x, inst.y], [inst.y, inst.x]] as [Side, Side][]) {
        if (!hedge.best) continue;
        let result: TwoLegResult;
        try {
          result = computeTwoLeg({ oddsA: opts.yourOdds, oddsB: hedge.best.decimal, mode: "total", amount: opts.totalStake });
        } catch {
          continue;
        }
        results.push({
          eventId: event.id,
          sportTitle: event.sportTitle,
          matchup: `${event.awayTeam} @ ${event.homeTeam}`,
          commenceTime: event.commenceTime,
          marketLabel: inst.label,
          yourSide: sideLabel(your),
          hedgeSide: sideLabel(hedge),
          hedgeBook: hedge.best.book,
          hedgeOdds: hedge.best.decimal,
          result,
        });
      }
    }
  }
  results.sort((a, b) => b.result.profit - a.result.profit);
  return results.slice(0, opts.topN ?? 20);
}
