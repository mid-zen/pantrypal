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
 */
import { loadEnv } from "./config.js";
import { fetchOdds, listSports } from "./oddsApi.js";
import { findArbitrage, type ScanOptions } from "./arbitrage.js";
import { renderOpportunity, renderSummary } from "./format.js";
import { SAMPLE_EVENTS } from "./sampleData.js";

interface CliArgs {
  demo: boolean;
  list: boolean;
  help: boolean;
  sport: string;
  regions: string;
  markets: string;
  stake: number;
  minMargin: number;
  increment: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    demo: false,
    list: false,
    help: false,
    sport: "upcoming",
    regions: "us",
    markets: "h2h,spreads,totals",
    stake: 1000,
    minMargin: 0.5,
    increment: 1,
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
      case "--stake": args.stake = Number(next()); break;
      case "--min-margin": args.minMargin = Number(next()); break;
      case "--increment": args.increment = Number(next()); break;
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
  --stake <amount>       Total stake to split per arb (default: 1000)
  --min-margin <pct>     Minimum return %% to report (default: 0.5)
  --increment <amount>   Round real stakes to this increment (default: 1)
  --demo                 Use offline sample data
  -h, --help             Show this help

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
  };

  // --- Demo mode: no network, no key ---
  if (args.demo) {
    process.stdout.write("Scanning bundled sample data (demo mode)...\n");
    const opps = findArbitrage(SAMPLE_EVENTS, scanOpts);
    opps.forEach((o, i) => process.stdout.write("\n" + renderOpportunity(o, i) + "\n"));
    process.stdout.write(renderSummary(opps));
    return;
  }

  // --- Live mode ---
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

  process.stdout.write(
    `Fetching odds: sport=${args.sport} regions=${args.regions} markets=${args.markets}\n`,
  );
  const events = await fetchOdds({
    apiKey,
    sport: args.sport,
    regions: args.regions,
    markets: args.markets,
  });
  process.stdout.write(`Scanning ${events.length} games...\n`);

  const opps = findArbitrage(events, scanOpts);
  opps.forEach((o, i) => process.stdout.write("\n" + renderOpportunity(o, i) + "\n"));
  process.stdout.write(renderSummary(opps));
}

main().catch((err) => {
  process.stderr.write(`\nError: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
