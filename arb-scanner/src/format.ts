/** Human-readable rendering of arbitrage opportunities for the terminal. */
import type { ArbOpportunity } from "./arbitrage.js";
import { formatAmerican } from "./odds.js";

const money = (n: number) => `$${n.toFixed(2)}`;

export function renderOpportunity(opp: ArbOpportunity, index: number): string {
  const lines: string[] = [];
  const when = new Date(opp.commenceTime).toLocaleString();

  lines.push(
    `${"═".repeat(64)}\n` +
      `#${index + 1}  ${opp.sportTitle}: ${opp.matchup}\n` +
      `     Market: ${opp.marketLabel}   |   Starts: ${when}\n` +
      `     Edge: ${opp.marginPct.toFixed(2)}% return  ` +
      `(books' implied total = ${(opp.impliedSum * 100).toFixed(2)}%, under 100% = arb)`,
  );

  lines.push(`     ${"─".repeat(58)}`);
  lines.push(`     PLACE THESE BETS (total staked ${money(opp.totalStake)}):`);
  for (const leg of opp.legs) {
    const pointStr = leg.point !== undefined ? ` ${leg.point}` : "";
    lines.push(
      `       • ${money(leg.roundedStake).padStart(9)} on ${leg.outcomeName}${pointStr}\n` +
        `             @ ${leg.bookmaker}  ` +
        `(${leg.decimal.toFixed(2)} / ${formatAmerican(leg.decimal)})  ` +
        `→ returns ${money(leg.payout)} if it wins`,
    );
  }

  lines.push(`     ${"─".repeat(58)}`);
  lines.push(
    `     Guaranteed profit (after whole-dollar rounding): ${money(opp.worstCaseProfit)}\n` +
      `     Theoretical edge (exact stakes): ${money(opp.idealProfit)}`,
  );
  for (const w of opp.warnings) {
    lines.push(`     ⚠ ${w}`);
  }
  return lines.join("\n");
}

export function renderSummary(opps: ArbOpportunity[]): string {
  if (opps.length === 0) {
    return (
      "\nNo arbitrage opportunities found in the scanned markets.\n" +
      "This is normal — true arbs are rare and short-lived. Try more sports/regions,\n" +
      "lower --min-margin, or scan again shortly.\n"
    );
  }
  const best = opps[0]!;
  return (
    `\nFound ${opps.length} arbitrage opportunit${opps.length === 1 ? "y" : "ies"}. ` +
    `Best edge: ${best.marginPct.toFixed(2)}%.\n` +
    "Remember: lines move fast — confirm prices in each app before staking.\n"
  );
}
