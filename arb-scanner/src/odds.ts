/**
 * Odds-format conversions and implied-probability math.
 *
 * Decimal odds are the canonical internal format because the arbitrage math is
 * cleanest there: the payout on a winning stake is simply stake * decimalOdds,
 * and the implied probability is 1 / decimalOdds.
 */

/** American (moneyline) odds -> decimal odds. +150 -> 2.5, -150 -> 1.667 */
export function americanToDecimal(american: number): number {
  if (american === 0) throw new Error("American odds cannot be 0");
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/** Decimal odds -> American odds. 2.5 -> +150, 1.667 -> -150 */
export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) throw new Error("Decimal odds must be > 1");
  return decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
}

/** Implied probability of an outcome priced at the given decimal odds. */
export function impliedProbability(decimal: number): number {
  return 1 / decimal;
}

/** Pretty-print decimal odds as a signed American line, e.g. "+150" / "-150". */
export function formatAmerican(decimal: number): string {
  const a = decimalToAmerican(decimal);
  return a > 0 ? `+${a}` : `${a}`;
}
