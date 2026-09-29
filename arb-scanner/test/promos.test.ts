import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHedge, calcPromo } from "../src/promos.js";

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

test("computeHedge equalizes both outcomes (clean integer case)", () => {
  // winReturnA 500, hedgeOdds 2.5 -> hedge 200; both nets 300.
  const h = computeHedge({ stakeA: 0, winReturnA: 500, loseExtraA: 0, hedgeOdds: 2.5, stakeIncrement: 1 });
  assert.equal(h.hedgeStake, 200);
  assert.equal(h.hedgeStakeRounded, 200);
  assert.equal(h.netIfBackWins, 300);
  assert.equal(h.netIfHedgeWins, 300);
  assert.equal(h.guaranteedProfit, 300);
});

test("free bet (SNR) converts ~83% at fair 6.0 / 1.2 odds", () => {
  const r = calcPromo({ type: "free_bet", freeBetAmount: 100, backOdds: 6.0, hedgeOdds: 1.2 });
  assert.equal(r.legs[0]!.kind, "free-bet");
  assert.equal(r.legs[0]!.stake, 100); // face value shown, not real cash
  assert.equal(r.cashAtRisk, r.legs[1]!.stake); // only the hedge is real money
  assert.ok(near(r.hedge.hedgeStake, 416.67, 0.02));
  assert.ok(near(r.guaranteedProfit, 83.33, 0.5));
  assert.ok(r.conversionPct! > 80 && r.conversionPct! < 84);
});

test("free bet converts more at higher odds than lower", () => {
  const low = calcPromo({ type: "free_bet", freeBetAmount: 100, backOdds: 2.0, hedgeOdds: 2.0 });
  const high = calcPromo({ type: "free_bet", freeBetAmount: 100, backOdds: 6.0, hedgeOdds: 1.2 });
  assert.ok(high.guaranteedProfit > low.guaranteedProfit);
  assert.ok(low.warnings.some((s) => /conversion/i.test(s))); // 50% triggers the low-conversion warning
});

test("risk-free bet locks refund value (70% retention, even odds)", () => {
  // stake 100 @2.0, refund 100 as free bet @70% -> refundValue 70.
  // hedge = (200-70)/2 = 65; both nets 35.
  const r = calcPromo({ type: "risk_free", stake: 100, backOdds: 2.0, hedgeOdds: 2.0, refundAmount: 100 });
  assert.equal(r.hedge.hedgeStakeRounded, 65);
  assert.ok(near(r.guaranteedProfit, 35));
  assert.equal(r.cashAtRisk, 165);
  assert.ok(r.warnings.some((s) => /valued at 70%/.test(s)));
});

test("risk-free with cash refund values it at 100%", () => {
  const r = calcPromo({ type: "risk_free", stake: 100, backOdds: 2.0, hedgeOdds: 2.0, refundAmount: 100, refundIsCash: true });
  // refundValue 100 -> hedge (200-100)/2 = 50; nets: back 200-100-50=50, hedge 50*1-100+100=50.
  assert.equal(r.hedge.hedgeStakeRounded, 50);
  assert.ok(near(r.guaranteedProfit, 50));
});

test("odds boost (profit %) raises effective odds and locks profit", () => {
  // stake 50 @2.0 with +50% profit -> eff 2.5; hedge 2.0 -> hedge 62.5; nets 12.5.
  // Use a 0.5 increment so the 62.5 hedge isn't rounded.
  const r = calcPromo({ type: "odds_boost", stake: 50, backOdds: 2.0, hedgeOdds: 2.0, boostMode: "profit_pct", boostPct: 50, stakeIncrement: 0.5 });
  assert.ok(near(r.effectiveBackOdds, 2.5));
  assert.ok(near(r.hedge.hedgeStake, 62.5));
  assert.ok(near(r.guaranteedProfit, 12.5));
});

test("odds boost (to specific odds) matches equivalent profit %", () => {
  const a = calcPromo({ type: "odds_boost", stake: 50, backOdds: 2.0, hedgeOdds: 2.0, boostMode: "to_odds", boostedOdds: 2.5, stakeIncrement: 0.5 });
  assert.ok(near(a.effectiveBackOdds, 2.5));
  assert.ok(near(a.guaranteedProfit, 12.5));
});

test("qualifying bet at fair even odds nets ~0 and warns about the loss when negative", () => {
  const fair = calcPromo({ type: "qualifying", stake: 100, backOdds: 2.0, hedgeOdds: 2.0 });
  assert.ok(near(fair.guaranteedProfit, 0));
  const lossy = calcPromo({ type: "qualifying", stake: 100, backOdds: 1.9, hedgeOdds: 1.9 });
  assert.ok(lossy.guaranteedProfit < 0);
  assert.ok(lossy.warnings.some((s) => /qualifying bet locks/i.test(s)));
});

test("validation rejects bad odds and missing fields", () => {
  assert.throws(() => calcPromo({ type: "free_bet", freeBetAmount: 50, backOdds: 1.0, hedgeOdds: 2.0 }), /Back odds/);
  assert.throws(() => calcPromo({ type: "free_bet", freeBetAmount: 50, backOdds: 3.0, hedgeOdds: 0.5 }), /Hedge odds/);
  assert.throws(() => calcPromo({ type: "free_bet", backOdds: 3.0, hedgeOdds: 2.0 }), /Free bet amount/);
  assert.throws(() => calcPromo({ type: "risk_free", stake: 100, backOdds: 3.0, hedgeOdds: 2.0 }), /Refund amount/);
});
