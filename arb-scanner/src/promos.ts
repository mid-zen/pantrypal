/**
 * Matched-betting / promo-extraction math.
 *
 * Ontario reality: there is no betting exchange (no Betfair lay), so we hedge a
 * promo bet by backing the OPPOSITE outcome at a second Ontario book. This only
 * works on 2-outcome markets, and it reuses the same equalize-the-payout idea as
 * the arbitrage engine.
 *
 * Everything reduces to one solver. You back outcome X at Book A (possibly with
 * a promo) and cover outcome Y at Book B. Describe the A side with three numbers:
 *
 *   stakeA      real cash you risk at A            (0 for a free bet)
 *   winReturnA  total you receive at A if X wins   (free bet SNR: F*(odds-1))
 *   loseExtraA  extra value you get at A if X LOSES (risk-free refund value; else 0)
 *
 * Solve the hedge stake so both outcomes net the same:
 *
 *   hedgeStake = (winReturnA - loseExtraA) / hedgeOdds
 *
 *   if X wins : winReturnA - stakeA - hedgeStake
 *   if Y wins : hedgeStake*(hedgeOdds-1) - stakeA + loseExtraA
 *
 * Those two are equal by construction; after rounding the hedge to a real stake
 * increment we report the worst of the two as the guaranteed result.
 */

export type PromoType = "free_bet" | "risk_free" | "odds_boost" | "qualifying";

export interface HedgeInput {
  stakeA: number;
  winReturnA: number;
  loseExtraA: number;
  hedgeOdds: number;
  stakeIncrement: number;
}

export interface HedgeResult {
  hedgeStake: number; // exact, unrounded
  hedgeStakeRounded: number; // what you'd actually place at Book B
  netIfBackWins: number; // using the rounded hedge stake
  netIfHedgeWins: number;
  guaranteedProfit: number; // min of the two = worst case
}

/** The core solver — pure, promo-agnostic. */
export function computeHedge(input: HedgeInput): HedgeResult {
  const { stakeA, winReturnA, loseExtraA, hedgeOdds } = input;
  const inc = input.stakeIncrement > 0 ? input.stakeIncrement : 1;

  const exact = (winReturnA - loseExtraA) / hedgeOdds;
  const hedgeStake = Math.max(0, exact);
  const rounded = Math.max(0, Math.round(hedgeStake / inc) * inc);

  const netIfBackWins = winReturnA - stakeA - rounded;
  const netIfHedgeWins = rounded * (hedgeOdds - 1) - stakeA + loseExtraA;

  return {
    hedgeStake,
    hedgeStakeRounded: rounded,
    netIfBackWins,
    netIfHedgeWins,
    guaranteedProfit: Math.min(netIfBackWins, netIfHedgeWins),
  };
}

// --- Promo calculator ----------------------------------------------------

export interface PromoCalcInput {
  type: PromoType;
  /** Decimal odds on your backed side (X) at Book A. For odds boosts this is the base, pre-boost price. */
  backOdds: number;
  /** Decimal odds on the opposite side (Y) at Book B (the hedge). */
  hedgeOdds: number;
  stakeIncrement?: number;

  // free_bet
  freeBetAmount?: number;
  /** If true, the free bet returns the stake too (rare). Default false (SNR). */
  stakeReturned?: boolean;

  // qualifying / risk_free / odds_boost
  stake?: number;

  // risk_free
  refundAmount?: number;
  /** Refund paid as cash (100% value) vs as another free bet. Default false (free bet). */
  refundIsCash?: boolean;
  /** When the refund is a free bet, how much of its face value you expect to extract. Default 70. */
  refundRetentionPct?: number;

  // odds_boost
  boostMode?: "profit_pct" | "to_odds";
  /** boostMode "profit_pct": e.g. 50 means +50% profit. */
  boostPct?: number;
  /** boostMode "to_odds": the enhanced decimal odds you get at Book A. */
  boostedOdds?: number;

  // display only
  bookA?: string;
  bookB?: string;
  outcomeX?: string;
  outcomeY?: string;
}

export interface PromoLeg {
  book: string;
  side: string;
  /** Amount to place. For a free bet this is the free-bet face value. */
  stake: number;
  odds: number;
  kind: "free-bet" | "cash";
  note?: string;
}

export interface PromoResult {
  type: PromoType;
  /** The odds actually used on the A side (after any boost). */
  effectiveBackOdds: number;
  legs: PromoLeg[];
  hedge: HedgeResult;
  guaranteedProfit: number;
  /** Real out-of-pocket cash right now (excludes free-bet face value). */
  cashAtRisk: number;
  /** For free bets: guaranteed value extracted as a % of the free-bet face value. */
  conversionPct?: number;
  summary: string;
  warnings: string[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

function req(value: number | undefined, name: string): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error(`${name} is required.`);
  return value;
}

/** Validate + compute a promo's optimal hedge and bet plan. */
export function calcPromo(input: PromoCalcInput): PromoResult {
  const inc = input.stakeIncrement && input.stakeIncrement > 0 ? input.stakeIncrement : 1;
  if (!Number.isFinite(input.backOdds) || input.backOdds <= 1) {
    throw new Error("Back odds must be greater than 1.0 (decimal).");
  }
  if (!Number.isFinite(input.hedgeOdds) || input.hedgeOdds <= 1) {
    throw new Error("Hedge odds must be greater than 1.0 (decimal).");
  }

  const bookA = input.bookA?.trim() || "Book A (promo)";
  const bookB = input.bookB?.trim() || "Book B (hedge)";
  const sideX = input.outcomeX?.trim() || "your pick";
  const sideY = input.outcomeY?.trim() || "the other side";

  let effectiveBackOdds = input.backOdds;
  let stakeA: number;
  let winReturnA: number;
  let loseExtraA = 0;
  let backLeg: PromoLeg;
  const warnings: string[] = [];

  switch (input.type) {
    case "free_bet": {
      const F = req(input.freeBetAmount, "Free bet amount");
      if (F <= 0) throw new Error("Free bet amount must be positive.");
      stakeA = 0; // the free bet costs no real cash
      winReturnA = input.stakeReturned ? F * input.backOdds : F * (input.backOdds - 1);
      backLeg = {
        book: bookA,
        side: sideX,
        stake: F,
        odds: input.backOdds,
        kind: "free-bet",
        note: input.stakeReturned ? "stake-returned free bet" : "free bet — stake not returned",
      };
      break;
    }
    case "risk_free": {
      const S = req(input.stake, "Stake");
      if (S <= 0) throw new Error("Stake must be positive.");
      const R = req(input.refundAmount, "Refund amount");
      const retention = input.refundIsCash ? 100 : input.refundRetentionPct ?? 70;
      loseExtraA = R * (retention / 100);
      stakeA = S;
      winReturnA = S * input.backOdds;
      backLeg = {
        book: bookA,
        side: sideX,
        stake: S,
        odds: input.backOdds,
        kind: "cash",
        note: input.refundIsCash
          ? `insured: ${money(R)} cash back if it loses`
          : `insured: ${money(R)} free bet if it loses (valued at ${retention}% = ${money(loseExtraA)})`,
      };
      break;
    }
    case "odds_boost": {
      const S = req(input.stake, "Stake");
      if (S <= 0) throw new Error("Stake must be positive.");
      if (input.boostMode === "to_odds") {
        effectiveBackOdds = req(input.boostedOdds, "Boosted odds");
        if (effectiveBackOdds <= 1) throw new Error("Boosted odds must be greater than 1.0.");
      } else {
        const pct = req(input.boostPct, "Boost %");
        effectiveBackOdds = 1 + (input.backOdds - 1) * (1 + pct / 100);
      }
      stakeA = S;
      winReturnA = S * effectiveBackOdds;
      backLeg = {
        book: bookA,
        side: sideX,
        stake: S,
        odds: effectiveBackOdds,
        kind: "cash",
        note: `boosted odds ${effectiveBackOdds.toFixed(2)}`,
      };
      break;
    }
    case "qualifying": {
      const S = req(input.stake, "Stake");
      if (S <= 0) throw new Error("Stake must be positive.");
      stakeA = S;
      winReturnA = S * input.backOdds;
      backLeg = { book: bookA, side: sideX, stake: S, odds: input.backOdds, kind: "cash" };
      break;
    }
    default:
      throw new Error(`Unknown promo type: ${input.type}`);
  }

  const hedge = computeHedge({ stakeA, winReturnA, loseExtraA, hedgeOdds: input.hedgeOdds, stakeIncrement: inc });

  const hedgeLeg: PromoLeg = {
    book: bookB,
    side: sideY,
    stake: hedge.hedgeStakeRounded,
    odds: input.hedgeOdds,
    kind: "cash",
  };

  const cashAtRisk = stakeA + hedge.hedgeStakeRounded;
  const result: PromoResult = {
    type: input.type,
    effectiveBackOdds,
    legs: [backLeg, hedgeLeg],
    hedge,
    guaranteedProfit: hedge.guaranteedProfit,
    cashAtRisk,
    summary: "",
    warnings,
  };

  // Free-bet conversion rate.
  if (input.type === "free_bet" && input.freeBetAmount) {
    result.conversionPct = (hedge.guaranteedProfit / input.freeBetAmount) * 100;
  }

  result.summary = buildSummary(input, result, { bookA, bookB, sideX, sideY });
  addWarnings(input, result);
  return result;
}

function buildSummary(
  input: PromoCalcInput,
  r: PromoResult,
  names: { bookA: string; bookB: string; sideX: string; sideY: string },
): string {
  const back = r.legs[0]!;
  const hedge = r.legs[1]!;
  const place =
    input.type === "free_bet"
      ? `Use your ${money(back.stake)} free bet on ${names.sideX} at ${names.bookA} (${back.odds.toFixed(2)})`
      : `Bet ${money(back.stake)} on ${names.sideX} at ${names.bookA} (${back.odds.toFixed(2)})`;
  const hedgeTxt = `then bet ${money(hedge.stake)} on ${names.sideY} at ${names.bookB} (${hedge.odds.toFixed(2)})`;
  const outcome =
    r.guaranteedProfit >= 0
      ? `Locks ${money(r.guaranteedProfit)} either way`
      : `Locks a ${money(-r.guaranteedProfit)} loss either way`;
  const conv =
    r.conversionPct != null ? ` (${r.conversionPct.toFixed(1)}% of the free bet turned into cash)` : "";
  return `${place}, ${hedgeTxt}. ${outcome}${conv}. Real cash at risk now: ${money(r.cashAtRisk)}.`;
}

function addWarnings(input: PromoCalcInput, r: PromoResult): void {
  const w = r.warnings;
  if (r.guaranteedProfit < -0.005) {
    if (input.type === "qualifying") {
      w.push(
        `This qualifying bet locks a ${money(-r.guaranteedProfit)} loss — normal to trigger a bonus, ` +
          `as long as the bonus is worth more than this. Higher, closer odds shrink the loss.`,
      );
    } else {
      w.push(
        `At these odds the hedge locks a ${money(-r.guaranteedProfit)} loss. The promo isn't strong ` +
          `enough here — try higher back odds, or a tighter hedge price.`,
      );
    }
  }
  if (input.type === "free_bet" && r.conversionPct != null && r.conversionPct < 60) {
    w.push(
      `Only ${r.conversionPct.toFixed(0)}% conversion. Free bets convert best at HIGH back odds ` +
        `(e.g. 4.0+). Pick a longer-odds market to keep more of the free bet.`,
    );
  }
  if (input.type === "risk_free" && !input.refundIsCash) {
    w.push(
      `Refund is valued at ${input.refundRetentionPct ?? 70}% (it comes as another free bet you then convert). ` +
        `The real number depends on the odds you convert it at.`,
    );
  }
  w.push("Check the promo terms (min odds, max stake, market limits, expiry) and confirm both prices in-app before placing.");
}
