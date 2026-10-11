/**
 * Two-leg arbitrage / hedge calculator (pure math).
 *
 * Given decimal odds on both sides of a 2-outcome market, work out the stakes
 * that equalize the payout:
 *
 *   mode "total"  — split a total budget T across both sides
 *   mode "fixedA" — you've staked `amount` on A; how much on B to equalize
 *   mode "fixedB" — you've staked `amount` on B; how much on A to equalize
 *
 * It's an arbitrage (guaranteed profit) when 1/oddsA + 1/oddsB < 1. Otherwise the
 * calculator still locks a KNOWN result (usually a small loss) — useful for
 * hedging out of a position.
 */

export type TwoLegMode = "total" | "fixedA" | "fixedB";

export interface TwoLegInput {
  oddsA: number; // decimal, > 1
  oddsB: number; // decimal, > 1
  mode: TwoLegMode;
  amount: number; // budget (total) or stake on the fixed side
  increment?: number; // rounding, default 0.01 (cents)
}

export interface TwoLegResult {
  stakeA: number;
  stakeB: number;
  totalStake: number;
  payoutA: number;
  payoutB: number;
  /** Worst-case profit after rounding (what you keep no matter the result). */
  profit: number;
  /** Ideal return on total stake, as a percentage (negative = a locked loss). */
  edgePct: number;
  impliedSum: number; // 1/oddsA + 1/oddsB
  isArb: boolean;
}

export function computeTwoLeg(input: TwoLegInput): TwoLegResult {
  const { oddsA, oddsB } = input;
  if (!(oddsA > 1)) throw new Error("Odds A must be greater than 1.0 (decimal).");
  if (!(oddsB > 1)) throw new Error("Odds B must be greater than 1.0 (decimal).");
  if (!(input.amount > 0)) throw new Error("Amount must be positive.");
  const inc = input.increment && input.increment > 0 ? input.increment : 0.01;

  const impliedSum = 1 / oddsA + 1 / oddsB;
  let stakeA: number;
  let stakeB: number;
  if (input.mode === "total") {
    stakeA = (input.amount * (1 / oddsA)) / impliedSum;
    stakeB = (input.amount * (1 / oddsB)) / impliedSum;
  } else if (input.mode === "fixedA") {
    stakeA = input.amount;
    stakeB = (stakeA * oddsA) / oddsB;
  } else {
    stakeB = input.amount;
    stakeA = (stakeB * oddsB) / oddsA;
  }

  const round = (x: number) => Math.round(x / inc) * inc;
  stakeA = round(stakeA);
  stakeB = round(stakeB);
  const totalStake = round(stakeA + stakeB);
  const payoutA = round(stakeA * oddsA);
  const payoutB = round(stakeB * oddsB);
  const profit = round(Math.min(payoutA, payoutB) - totalStake);

  return {
    stakeA,
    stakeB,
    totalStake,
    payoutA,
    payoutB,
    profit,
    edgePct: (1 / impliedSum - 1) * 100,
    impliedSum,
    isArb: impliedSum < 1,
  };
}
