# Arb Scanner

A standalone command-line tool that scans live sportsbook odds and finds
**arbitrage opportunities** — bets where you stake *both* sides of a game across
different books and lock in a profit no matter who wins.

It is a self-contained project (its own `package.json`, no dependency on
anything else in this repo).

> 👉 **Picking up this project?** Read **[HANDOFF.md](./HANDOFF.md)** first — it
> covers current state, how to verify, key decisions/caveats, and next steps.

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

## Web dashboard

A simple, readable webpage that shows opportunities as cards (edge %, the exact
bets to place, guaranteed profit, plain-English summary).

```bash
npm run web        # then open http://localhost:3000 in your browser
```

- Starts in **Demo** mode so you can see it instantly with no key. Flip the
  toggle to **Live** once you've added an `ODDS_API_KEY` (see below).
- Controls for sport, stake, minimum edge, and Ontario-only vs all books.
- Optional **auto-refresh** (30s–5m) so the list updates itself.
- Change the port with `PORT=8080 npm run web`.

**Open it on your phone (same Wi-Fi):** the server binds to your whole network
and prints a phone URL on startup, e.g.:

```
On this computer →  http://localhost:3000
On your phone (same Wi-Fi) →  http://192.168.1.42:3000
```

Type that second URL into your phone's browser (the computer must stay running,
and both devices on the same Wi-Fi). The page is mobile-responsive. If it won't
load, your computer's firewall is likely blocking the port — allow it, or see
"From anywhere" below.

**From anywhere (off your Wi-Fi):** see **[DEPLOY.md](./DEPLOY.md)** for
copy-paste steps — an instant Cloudflared tunnel (`npm run tunnel`), always-on
hosting on Fly.io/Render, or Docker on your own server.

> 🔒 When hosting publicly, set `DASHBOARD_PASSWORD` to lock the dashboard behind
> a login, and put `ODDS_API_KEY` in the host's secrets. See DEPLOY.md.

It calls the same engine as the CLI via a small JSON API (`GET /api/scan`), so
the numbers match exactly.

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
| `--books <set>` | `ontario` | `ontario` = only Ontario-licensed books; `all` = every book in `--regions` (not filtered); or a custom comma list of Odds API keys |
| `--stake <amount>` | `1000` | Total stake split across the legs of each arb |
| `--min-margin <pct>` | `0.5` | Minimum return % to report |
| `--increment <amount>` | `1` | Round real stakes to this increment |
| `--include-live` | off | Also scan games that already started (risky: in-play lines move/suspend too fast to place two legs) |
| `--max-staleness <min>` | `15` | Ignore any price the book hasn't refreshed in this many minutes (`0` = off) |
| `--demo` | — | Use offline sample data |
| `--list` | — | List sports the API has odds for |
| `--watch` | — | Re-scan on a loop and push alerts for new arbs |
| `--interval <seconds>` | `180` | Seconds between scans (watch mode) |
| `--cooldown <minutes>` | `30` | Don't re-alert the same arb within this window |
| `--max-cycles <n>` | `0` | Stop after n scans (`0` = run forever) |
| `--dry-run` | — | Print alerts to the console instead of (only) sending |

## Ontario-licensed books only (default)

By default the scanner **only considers sportsbooks licensed for Ontario
players** and ignores everything else — including offshore books (Bovada,
BetOnline, Pinnacle, …) that are **not legal in Ontario**. So every bet it
suggests is one you can actually place at a regulated Ontario book.

The current default allowlist (`src/bookmakers.ts`), each verified (2026-07-02)
against the iGO registry, The Odds API's published bookmaker keys, **and a live
scan confirming the book actually returns odds**:

> **FanDuel, DraftKings, BetMGM, BetRivers, Bally Bet, theScore Bet,
> LeoVegas, BetVictor, 888sport, Betway, Pinnacle**

The filter is applied twice for safety: the live request asks The Odds API for
*only* these books, and the results are re-filtered locally before any math runs.

> ⚠️ **bet365 and Caesars are missing on purpose.** bet365 is Ontario-licensed
> and popular, but The Odds API only carries its *Australian* feed (`bet365_au`),
> which is useless as an Ontario price proxy (same for PointsBet Canada).
> Caesars' key (`williamhill_us`) is still documented but returned zero markets
> in a live check — a dead feed. Arbs with a leg at those books are invisible
> to this tool.

**Keeping the list correct:**

- The authoritative list of who's licensed is iGaming Ontario's official
  registry: <https://igamingontario.ca/en/player/regulated-igaming-market>.
- To add a book, confirm it's on that registry **and** confirm its *exact*
  Odds API bookmaker key. A wrong key fails silently — the API just returns
  nothing for it (e.g. Caesars' key is `williamhill_us`; a key named `caesars`
  does not exist).

> ⚠️ **Price caveat:** The Odds API has no dedicated Ontario region. For these
> brands it serves their **US/UK/EU** price feed. The brand is Ontario-licensed,
> but the exact line can differ from that operator's Ontario (`.ca`) app, so
> treat the numbers as a close approximation and **always confirm the live odds
> in the app before you stake**.

> 💰 **Quota note:** the allowlist spans four Odds API regions (us, us2, uk,
> eu), and each live request costs roughly *regions × markets* credits — about
> 12 credits per scan with all three markets. The free tier (500/month) supports
> ~40 full scans; trim `--markets` or self-host with a paid key if you scan a lot.
> The web dashboard caches live responses (`CACHE_TTL_SEC`, default 60s) so
> auto-refresh and multiple viewers share one request.

Override the filter when you need to:

```bash
npm run scan -- --sport basketball_nba                 # Ontario books (default)
npm run scan -- --sport basketball_nba --books bet365,fanduel,betmgm
npm run scan -- --sport basketball_nba --books all --regions us   # NOT Ontario-filtered
```

## Watch mode & notifications

Watch mode re-scans on an interval and only alerts you about **new**
opportunities — a per-arb cooldown stops a long-lived arb from pinging you every
cycle.

```bash
# Live, alert when a new arb appears (channels auto-enabled from env vars):
npm run scan -- --sport basketball_nba --watch --interval 120

# Try the whole pipeline with no key and no real sends:
npm run demo -- --watch --dry-run
```

Channels are turned on simply by setting their env vars in `.env`. Enable either
or both:

| Channel | Env vars | How to get them |
|---------|----------|-----------------|
| **Discord** | `DISCORD_WEBHOOK_URL` | Server Settings → Integrations → Webhooks → New Webhook → Copy URL |
| **Telegram** | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Create a bot with [@BotFather](https://t.me/botfather); message your bot, then read your chat id from `https://api.telegram.org/bot<TOKEN>/getUpdates` |

If no channel is configured (or you pass `--dry-run`), alerts print to the
console so nothing is silently dropped.

> ⚠️ **Quota:** each live scan spends Odds API requests (free tier = 500/month,
> and cost scales with the number of regions × markets). A 120s interval running
> all day will blow through the free tier — widen `--interval` or watch a single
> sport/region to conserve quota.

## How it works (code map)

| File | Responsibility |
|------|----------------|
| `src/odds.ts` | American ↔ decimal conversion, implied probability |
| `src/arbitrage.ts` | Best-price selection per outcome, arb detection, stake allocation |
| `src/oddsApi.ts` | The Odds API client + normalization |
| `src/bookmakers.ts` | Ontario-licensed book allowlist + filter |
| `src/sampleData.ts` | Offline demo fixtures |
| `src/format.ts` | Terminal output |
| `src/notify.ts` | Pluggable alert notifiers (Discord, Telegram, console) |
| `src/watch.ts` | Watch loop with new-arb dedup + cooldown |
| `src/server.ts` | Web dashboard server + `/api/scan` JSON API |
| `public/` | Dashboard frontend (HTML/CSS/JS, no build step) |
| `src/index.ts` | CLI entry / argument parsing |

Markets handled:

- **Moneyline (`h2h`)** — 2-way and 3-way. Soccer *requires* the Draw leg: a
  two-leg soccer "arb" loses both bets on a draw, so it's never reported.
- **Totals** — Over/Under matched at the exact same line.
- **Spreads** — the two teams matched on mirrored lines by **signed** value
  (home at L with away at −L). Matching by absolute value would sometimes pair
  both teams on the same side of the spread when books disagree on the
  favorite — two bets that can both lose.

Built-in safety checks (all on by default):

- **Started games are skipped** — in-play lines move and suspend too fast to
  reliably place two legs (`--include-live` to override).
- **Stale prices are dropped** — a quote the book hasn't refreshed in 15+
  minutes is the classic fake-arb trap (`--max-staleness` to tune).
- **Rounding can't fake a profit** — if rounding stakes to your increment makes
  the worst-case outcome a loss, the opportunity is discarded, not shown.
- **Warnings on anything fishy** — edges over 10% (almost always a stale or
  wrong price), both legs at one book, or a price several minutes old all get
  an explicit warning in the CLI, dashboard, and alerts.

## Tests

```bash
npm test
```

Covers odds conversions, arb detection, payout equalization, the no-arb case,
and the margin filter.

## Roadmap ideas

- **Middling** detection (different lines on totals/spreads that can both win).
- Account for **stake limits** per book in the allocation.
- More alert channels (Slack, email/SMTP) — the notifier layer is pluggable.
- Persist found arbs to disk/DB for history and edge tracking over time.
- Add player-prop markets and more regions.
