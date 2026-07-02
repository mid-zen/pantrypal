/**
 * CLI entry point for the arbitrage scanner.
 *
 *   npm run demo                       # run on bundled sample data, no key needed
 *   npm run scan -- --sport ...        # live scan (needs ODDS_API_KEY)
 *
 * Examples:
 *   npm run scan -- --list                       # show available sports
 *   npm run scan -- --sport basketball_nba
 *   npm run scan -- --sport upcoming --stake 1000 --min-margin 1
 *   npm run scan -- --sport upcoming --watch --interval 180   # alert on new arbs
 *   npm run demo -- --watch --dry-run            # test the notification pipeline
 */
import { loadEnv } from "./config.js";
import { fetchOdds, listSports } from "./oddsApi.js";
import { findArbitrage, type ArbOpportunity, type ScanOptions } from "./arbitrage.js";
import { renderOpportunity, renderSummary } from "./format.js";
import { SAMPLE_EVENTS } from "./sampleData.js";
import { buildNotifiers } from "./notify.js";
import { watch } from "./watch.js";
import { filterEventsToBooks, resolveBooks } from "./bookmakers.js";

interface CliArgs {
  demo: boolean;
  list: boolean;
  help: boolean;
  sport: string;
  regions: string;
  markets: string;
  books: string;
  stake: number;
  minMargin: number;
  increment: number;
  includeLive: boolean;
  maxStaleness: number;
  watch: boolean;
  interval: number;
  cooldown: number;
  maxCycles: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    demo: false,
    list: false,
    help: false,
    sport: "upcoming",
    regions: "us",
    markets: "h2h,spreads,totals",
    books: "ontario",
    stake: 1000,
    minMargin: 0.5,
    increment: 1,
    includeLive: false,
    maxStaleness: 15,
    watch: false,
    interval: 180,
    cooldown: 30,
    maxCycles: 0,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? "";
    switch (a) {
      case "--demo": args.demo = true; break;
      case "--list": args.list = true; break;
      case "-h":
      case "--help": args.help = true; break;
      case "--sport": args.sport = next(); break;
      case "--regions": args.regions = next(); break;
      case "--markets": args.markets = next(); break;
      case "--books": args.books = next(); break;
      case "--stake": args.stake = Number(next()); break;
      case "--min-margin": args.minMargin = Number(next()); break;
      case "--increment": args.increment = Number(next()); break;
      case "--include-live": args.includeLive = true; break;
      case "--max-staleness": args.maxStaleness = Number(next()); break;
      case "--watch": args.watch = true; break;
      case "--interval": args.interval = Number(next()); break;
      case "--cooldown": args.cooldown = Number(next()); break;
      case "--max-cycles": args.maxCycles = Number(next()); break;
      case "--dry-run": args.dryRun = true; break;
      default:
        if (a?.startsWith("--")) {
          process.stderr.write(`Unknown option: ${a}\n`);
        }
    }
  }
  return args;
}

const HELP = `
Sports Arbitrage Scanner — finds bets where staking both sides guarantees profit.

Usage:
  npm run demo                          Run on bundled sample data (no API key)
  npm run scan -- [options]             Live scan via The Odds API

Options:
  --list                 List sports the API currently has odds for
  --sport <key>          Sport key (default: "upcoming"). e.g. basketball_nba
  --regions <r>          Comma list: us,us2,uk,eu,au (default: us)
  --markets <m>          Comma list: h2h,spreads,totals (default: all)
  --books <set>          Which sportsbooks to check (default: ontario):
                           ontario  = only Ontario-licensed books (safe default)
                           all      = every book in --regions (NOT Ontario-filtered)
                           k1,k2    = custom Odds API bookmaker keys
  --stake <amount>       Total stake to split per arb (default: 1000)
  --min-margin <pct>     Minimum return %% to report (default: 0.5)
  --increment <amount>   Round real stakes to this increment (default: 1)
  --include-live         Also scan games that already started (riskier; default: off)
  --max-staleness <min>  Ignore prices older than this many minutes (default: 15, 0 = off)
  --demo                 Use offline sample data
  -h, --help             Show this help

Watch / notifications:
  --watch                Re-scan on a loop and push alerts for NEW arbs
  --interval <seconds>   Seconds between scans (default: 180)
  --cooldown <minutes>   Don't re-alert the same arb within this window (default: 30)
  --max-cycles <n>       Stop after n scans (default: 0 = forever)
  --dry-run              Print alerts to the console instead of (only) sending

Alert channels (auto-enabled when their env vars are set):
  Discord    DISCORD_WEBHOOK_URL
  Telegram   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID

Setup for live scans:
  1. Get a free key at https://the-odds-api.com (500 requests/month)
  2. cp .env.example .env  and put your key in ODDS_API_KEY
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  if (!Number.isFinite(args.stake) || args.stake <= 0) {
    process.stderr.write("Error: --stake must be a positive number.\n");
    process.exitCode = 1;
    return;
  }

  const scanOpts: ScanOptions = {
    totalStake: args.stake,
    minMarginPct: args.minMargin,
    stakeIncrement: args.increment > 0 ? args.increment : 1,
    includeLive: args.includeLive,
    maxStalenessMin: Number.isFinite(args.maxStaleness) ? args.maxStaleness : 15,
  };

  // Resolve which sportsbooks to check (ontario | all | custom keys).
  const sel = resolveBooks(args.books);
  const allowedKeys = sel.allowedKeys;
  const requestBooks = sel.requestBooks;
  if (sel.titles) process.stdout.write(`Checking ${sel.label}: ${sel.titles.join(", ")}\n`);
  else
    process.stdout.write(
      `WARNING: ${sel.label} — every book in regions "${args.regions}", ` +
        "NOT limited to Ontario-licensed sportsbooks.\n",
    );

  // Build the function that produces the current opportunity list. In demo mode
  // it reads bundled fixtures; in live mode it hits The Odds API each call.
  let runScan: () => Promise<ArbOpportunity[]>;

  if (args.demo) {
    runScan = async () => findArbitrage(filterEventsToBooks(SAMPLE_EVENTS, allowedKeys), scanOpts);
  } else {
    loadEnv();
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey || apiKey === "your-odds-api-key-here") {
      process.stderr.write(
        "Error: ODDS_API_KEY not set. Copy .env.example to .env and add your key,\n" +
          "or run `npm run demo` to try the scanner on sample data.\n",
      );
      process.exitCode = 1;
      return;
    }

    if (args.list) {
      const sports = await listSports(apiKey);
      process.stdout.write("\nAvailable sports (use the key with --sport):\n");
      for (const s of sports.filter((s) => s.active)) {
        process.stdout.write(`  ${s.key.padEnd(28)} ${s.title}\n`);
      }
      return;
    }

    runScan = async () => {
      const events = await fetchOdds({
        apiKey,
        sport: args.sport,
        regions: args.regions,
        markets: args.markets,
        bookmakers: requestBooks,
      });
      // Safety net: even though we requested only these books, re-filter so a
      // non-allowlisted book can never reach the arbitrage math.
      return findArbitrage(filterEventsToBooks(events, allowedKeys), scanOpts);
    };
  }

  // --- Watch mode: loop + notify on new arbs ---
  if (args.watch) {
    const notifiers = buildNotifiers({ dryRun: args.dryRun });
    if (!args.demo) {
      process.stdout.write(
        "Note: each scan spends Odds API quota (free tier = 500/month). " +
          "Mind your --interval.\n",
      );
    }
    await watch({
      intervalSec: args.interval,
      cooldownMin: args.cooldown,
      maxCycles: args.maxCycles,
      scan: runScan,
      notifiers,
    });
    return;
  }

  // --- One-shot mode: scan once and print ---
  if (args.demo) process.stdout.write("Scanning bundled sample data (demo mode)...\n");
  else process.stdout.write(`Fetching odds: sport=${args.sport} regions=${args.regions}\n`);

  const opps = await runScan();
  opps.forEach((o, i) => process.stdout.write("\n" + renderOpportunity(o, i) + "\n"));
  process.stdout.write(renderSummary(opps));
}

main().catch((err) => {
  process.stderr.write(`\nError: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
