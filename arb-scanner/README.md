# Arb Scanner

A standalone command-line tool that scans live sportsbook odds and finds
**arbitrage opportunities** — bets where you stake *both* sides of a game across
different books and lock in a profit no matter who wins.

It is a self-contained project (its own `package.json`, no dependency on
anything else in this repo).

## What this actually is

This is **arbitrage betting** (a.k.a. "arbing" / "sure betting"), not an exploit
or a hack of any app. The edge is pure math:

- Every sportsbook bakes a margin ("the vig") into its odds, so on a single book
  the two sides of a game add up to *more* than 100% implied probability — the
  house edge.
- Different books price the same game differently. Occasionally the **best**
  price on side A at one book and the **best** price on side B at another book
  add up to *less* than 100%.
- When that happens, you split your stake between the two books so that **every
  outcome pays back more than your total stake**.

```
S = Σ (1 / bestDecimalOdds_i)      # sum of implied probabilities
arbitrage exists  ⇔  S < 1
return on stake   =  (1 / S) − 1
stake on side i   =  totalStake × (1 / oddsᵢ) / S
```

## Read this before you bet

- **Legal, but not welcomed.** Arbitrage is legal in regulated markets, but
  sportsbooks dislike it. They routinely **limit stakes or close accounts** of
  customers they flag as arbers. That's a terms-of-service consequence, not a
  legal one.
- **Margins are thin and fleeting.** Real arbs are typically **0.5%–4%** and
  last seconds to minutes before lines move. The tool reports the edge so you
  can judge whether it's worth it.
- **You need capital in multiple books.** You must already have funded accounts
  at each book to place both legs in time.
- **Verify before you stake.** Always re-check the live price in each app — odds
  shift between the API snapshot and your bet.
- This tool does not place bets and is **not financial advice**. Check the laws
  in your jurisdiction.

## Quick start (no API key needed)

```bash
cd arb-scanner
npm install
npm run demo
```

The demo runs on bundled sample data and prints two example arbs with exact
stake splits.

## Live scanning

1. Get a free API key (500 requests/month) at <https://the-odds-api.com>.
   The Odds API is a legal aggregator that serves live odds from ~40 US books —
   the right way to get data without scraping the apps.
2. Configure your key:
   ```bash
   cp .env.example .env
   # edit .env and set ODDS_API_KEY
   ```
3. Scan:
   ```bash
   npm run scan -- --list                 # see available sports
   npm run scan -- --sport basketball_nba
   npm run scan -- --sport upcoming --stake 2000 --min-margin 1
   ```

## Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--sport <key>` | `upcoming` | Sport key, e.g. `basketball_nba`, `americanfootball_nfl`. `upcoming` = next games across sports |
| `--regions <r>` | `us` | Comma list: `us,us2,uk,eu,au` |
| `--markets <m>` | `h2h,spreads,totals` | Which markets to scan |
| `--stake <amount>` | `1000` | Total stake split across the legs of each arb |
| `--min-margin <pct>` | `0.5` | Minimum return % to report |
| `--increment <amount>` | `1` | Round real stakes to this increment |
| `--demo` | — | Use offline sample data |
| `--list` | — | List sports the API has odds for |

## How it works (code map)

| File | Responsibility |
|------|----------------|
| `src/odds.ts` | American ↔ decimal conversion, implied probability |
| `src/arbitrage.ts` | Best-price selection per outcome, arb detection, stake allocation |
| `src/oddsApi.ts` | The Odds API client + normalization |
| `src/sampleData.ts` | Offline demo fixtures |
| `src/format.ts` | Terminal output |
| `src/index.ts` | CLI entry / argument parsing |

Markets handled:

- **Moneyline (`h2h`)** — 2-way and 3-way (soccer draw).
- **Totals** — Over/Under matched at the same line.
- **Spreads** — the two teams matched on mirrored lines (±L).

## Tests

```bash
npm test
```

Covers odds conversions, arb detection, payout equalization, the no-arb case,
and the margin filter.

## Roadmap ideas

- **Middling** detection (different lines on totals/spreads that can both win).
- Account for **stake limits** per book in the allocation.
- Persist found arbs and alert (push/Discord) when edge exceeds a threshold.
- Add player-prop markets and more regions.
