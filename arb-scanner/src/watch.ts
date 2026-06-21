/**
 * Watch mode: re-scan on an interval and dispatch alerts only for opportunities
 * that are new (or whose cooldown has expired), so persistent arbs don't spam
 * you every cycle.
 */
import type { ArbOpportunity } from "./arbitrage.js";
import type { Notifier } from "./notify.js";

export interface WatchOptions {
  /** Seconds between scans. */
  intervalSec: number;
  /** Don't re-alert the same opportunity within this many minutes. */
  cooldownMin: number;
  /** Stop after this many cycles; 0 = run forever. */
  maxCycles: number;
  /** Produces the current opportunity list (live fetch or demo data). */
  scan: () => Promise<ArbOpportunity[]>;
  notifiers: Notifier[];
  /** Injectable logger (tests pass a noop). */
  log?: (msg: string) => void;
}

/**
 * Stable identity for an opportunity, independent of small odds wiggles: same
 * game + market + line + book/outcome pairing is "the same arb".
 */
export function oppKey(opp: ArbOpportunity): string {
  const legs = opp.legs
    .map((l) => `${l.bookmaker}>${l.outcomeName}`)
    .sort()
    .join("|");
  return `${opp.eventId}|${opp.marketKey}|${opp.point ?? ""}|${legs}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function watch(opts: WatchOptions): Promise<void> {
  const log = opts.log ?? ((m: string) => process.stdout.write(m + "\n"));
  const lastAlerted = new Map<string, number>();
  const cooldownMs = opts.cooldownMin * 60_000;
  let cycle = 0;

  log(
    `Watching every ${opts.intervalSec}s ` +
      `(cooldown ${opts.cooldownMin}m, channels: ${opts.notifiers.map((n) => n.name).join(", ")}). ` +
      `Press Ctrl+C to stop.`,
  );

  while (opts.maxCycles === 0 || cycle < opts.maxCycles) {
    cycle++;
    const stamp = new Date().toLocaleTimeString();
    try {
      const opps = await opts.scan();
      const now = Date.now();
      const fresh = opps.filter((o) => {
        const key = oppKey(o);
        const last = lastAlerted.get(key);
        if (last !== undefined && now - last < cooldownMs) return false;
        lastAlerted.set(key, now);
        return true;
      });

      if (fresh.length > 0) {
        log(`[${stamp}] ${opps.length} arb(s) found, ${fresh.length} new → alerting.`);
        for (const n of opts.notifiers) {
          try {
            await n.send(fresh);
          } catch (e) {
            log(`  ! ${n.name} notify failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      } else {
        log(`[${stamp}] ${opps.length} arb(s) found, none new.`);
      }
    } catch (e) {
      // Keep the loop alive across transient fetch/network errors.
      log(`[${stamp}] scan error: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (opts.maxCycles !== 0 && cycle >= opts.maxCycles) break;
    if (opts.intervalSec > 0) await sleep(opts.intervalSec * 1000);
  }
}
