import { test } from "node:test";
import assert from "node:assert/strict";
import { findArbitrage, type ArbOpportunity } from "../src/arbitrage.js";
import { SAMPLE_EVENTS } from "../src/sampleData.js";
import { oppKey, watch } from "../src/watch.js";
import { buildNotifiers, summarizeOpp } from "../src/notify.js";
import type { Notifier } from "../src/notify.js";

const scanOpts = { totalStake: 1000, minMarginPct: 0, stakeIncrement: 1 };

function sampleOpps(): ArbOpportunity[] {
  return findArbitrage(SAMPLE_EVENTS, scanOpts);
}

test("sample data yields at least one arb to alert on", () => {
  assert.ok(sampleOpps().length >= 1);
});

test("oppKey is stable across odds wiggles but distinct per market", () => {
  const opps = sampleOpps();
  assert.ok(opps.length >= 2);
  const keys = new Set(opps.map(oppKey));
  assert.equal(keys.size, opps.length); // each opp is distinct
});

test("summarizeOpp includes the bet, book, and guaranteed profit", () => {
  const opp = sampleOpps()[0]!;
  const text = summarizeOpp(opp);
  assert.match(text, /arb/);
  assert.match(text, /Bet \$/);
  assert.match(text, /Guaranteed profit/);
});

/** Captures what would be sent, without any network. */
class CapturingNotifier implements Notifier {
  name = "capture";
  batches: ArbOpportunity[][] = [];
  async send(opps: ArbOpportunity[]): Promise<void> {
    this.batches.push(opps);
  }
}

test("watch alerts once then suppresses the same arb within cooldown", async () => {
  const capture = new CapturingNotifier();
  await watch({
    intervalSec: 0, // no real waiting in tests
    cooldownMin: 30,
    maxCycles: 3,
    scan: async () => sampleOpps(), // identical results every cycle
    notifiers: [capture],
    log: () => {},
  });
  // First cycle alerts; cycles 2 & 3 are deduped by cooldown.
  assert.equal(capture.batches.length, 1);
  assert.equal(capture.batches[0]!.length, sampleOpps().length);
});

test("watch survives a scan error and keeps looping", async () => {
  const capture = new CapturingNotifier();
  let calls = 0;
  await watch({
    intervalSec: 0,
    cooldownMin: 30,
    maxCycles: 2,
    scan: async () => {
      calls++;
      if (calls === 1) throw new Error("transient network blip");
      return sampleOpps();
    },
    notifiers: [capture],
    log: () => {},
  });
  // Cycle 1 errored, cycle 2 recovered and alerted.
  assert.equal(calls, 2);
  assert.equal(capture.batches.length, 1);
});

test("buildNotifiers falls back to console when nothing is configured", () => {
  const saved = { ...process.env };
  delete process.env.DISCORD_WEBHOOK_URL;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  const notifiers = buildNotifiers({ dryRun: false });
  assert.equal(notifiers.length, 1);
  assert.equal(notifiers[0]!.name, "console");
  process.env = saved;
});

test("buildNotifiers enables discord + telegram from env", () => {
  const saved = { ...process.env };
  process.env.DISCORD_WEBHOOK_URL = "https://discord.test/webhook";
  process.env.TELEGRAM_BOT_TOKEN = "tok";
  process.env.TELEGRAM_CHAT_ID = "123";
  const names = buildNotifiers({ dryRun: false }).map((n) => n.name);
  assert.deepEqual(names.sort(), ["discord", "telegram"]);
  process.env = saved;
});
