# Handoff — arb-scanner

For the next agent (or developer) picking this up. Read this first, then
`README.md` for usage and `DEPLOY.md` for hosting.

_Last updated: 2026-07-02._

---

## 1. What this project is

A **standalone sports-betting arbitrage scanner**. It finds "sure bets": cases
where the best price on each side of a game (taken across different sportsbooks)
implies a total probability under 100%, so staking both sides guarantees a
profit regardless of outcome.

It lives in `arb-scanner/` inside the `pantrypal` repo but is **completely
independent** of the pantry app (its own `package.json`, no shared code). The
user asked for it on branch `claude/sports-betting-arbitrage-09zlmv`.

**Core math** (`src/arbitrage.ts`): for a market's best per-outcome decimal
odds, `S = Σ(1/oddsᵢ)`. If `S < 1` there's an arb; return = `1/S − 1`; stake on
leg i = `totalStake × (1/oddsᵢ) / S`, which equalizes the payout to `totalStake/S`
on every outcome.

## 2. Current state — what works

Everything below is **built, tested, committed, and pushed**. 16 tests pass;
`npx tsc --noEmit` is clean.

- **Engine**: odds conversion, arbitrage detection + stake allocation for
  moneyline (`h2h`, 2- and 3-way), totals (matched line), spreads (mirrored
  lines). (`src/odds.ts`, `src/arbitrage.ts`)
- **Live data**: The Odds API client, decimal odds, supports the `bookmakers`
  query param. (`src/oddsApi.ts`) Needs `ODDS_API_KEY`.
- **Ontario filter (default)**: only considers Ontario-licensed books; drops
  everything else incl. offshore (Bovada etc.). Allowlist + `resolveBooks()` in
  `src/bookmakers.ts`. Applied at request **and** re-filtered locally.
- **CLI**: `src/index.ts` — one-shot scan or `--watch` loop. Flags for sport,
  regions, markets, books, stake, min-margin, increment, interval, cooldown,
  dry-run.
- **Notifications**: pluggable notifiers — Discord webhook, Telegram bot,
  console fallback. New-arb dedup + cooldown in the watch loop.
  (`src/notify.ts`, `src/watch.ts`)
- **Web dashboard**: `src/server.ts` (zero-framework `node:http`) + `public/`
  (HTML/CSS/JS, no build step). Card UI with edge %, exact bets, guaranteed
  profit, plain-English summary. Demo/Live toggle, controls, auto-refresh.
  Binds `0.0.0.0` and prints a LAN URL for phones.
- **Auth + health**: optional HTTP Basic auth gated on `DASHBOARD_PASSWORD`
  (timing-safe); `/healthz` open for host checks.
- **Deploy**: `Dockerfile`, `.dockerignore`, `fly.toml` (Toronto region),
  `npm run tunnel` (cloudflared), `DEPLOY.md` with steps for tunnel / Fly /
  Render / Docker.

## 3. How to run & verify (do this first)

```bash
cd arb-scanner
npm install
npm test                 # 16 tests, all pass
npx tsc --noEmit         # clean
npm run demo             # engine on bundled data → 2 example arbs
npm run web              # dashboard at http://localhost:3000 (Demo mode)
```

Live mode needs a key: copy `.env.example` → `.env`, set `ODDS_API_KEY`
(free tier at https://the-odds-api.com, 500 req/month).

## 4. File map

| Path | Purpose |
|------|---------|
| `src/types.ts` | Shared types (`GameEvent`, `BookmakerMarket`, `Outcome`) |
| `src/odds.ts` | American↔decimal, implied probability |
| `src/arbitrage.ts` | Best-price selection, arb detection, stake split |
| `src/oddsApi.ts` | The Odds API client + normalization |
| `src/bookmakers.ts` | Ontario allowlist, `resolveBooks()`, `filterEventsToBooks()` |
| `src/notify.ts` | Discord / Telegram / console notifiers |
| `src/watch.ts` | Watch loop, `oppKey()` dedup + cooldown |
| `src/server.ts` | Web server, `/api/scan`, `/api/meta`, `/healthz`, auth |
| `src/format.ts` | Terminal rendering |
| `src/index.ts` | CLI entry / arg parsing |
| `src/sampleData.ts` | Offline demo fixtures (incl. a Bovada line the filter drops) |
| `public/` | Dashboard frontend |
| `test/` | `arbitrage`, `bookmakers`, `watch` test suites |

## 5. Important context, decisions & caveats

- **Not a hack.** Pure math on public odds. Framed honestly to the user
  throughout; arbing is legal but books limit/close arber accounts (ToS, not
  law). Keep that honesty in any user-facing copy.
- **The Odds API has NO Ontario/Canada region.** For Ontario brands it serves
  their **US/UK** price feed — close but not identical to the operator's `.ca`
  app. This caveat is in the README/UI and must stay. Always "confirm in-app
  before staking."
- **Ontario allowlist is deliberately tight** (bet365, FanDuel, DraftKings,
  BetMGM, Caesars, BetRivers) — only brands confirmed both Ontario-licensed AND
  present in The Odds API. Source of truth: iGaming Ontario registry
  https://igamingontario.ca/en/player/regulated-igaming-market (46+ operators,
  changes over time). To expand, verify the brand on that registry AND confirm
  its exact Odds API bookmaker key, then add one line to `ONTARIO_BOOKMAKERS`
  in `src/bookmakers.ts`. Candidates noted there: PointsBet, theScore Bet,
  Bally Bet, Betway, 888sport, BetVictor, Unibet, bet99, Hard Rock Bet.
- **Runs via `tsx`** (no compile step). `tsx` is a runtime **dependency** so
  `npm ci --omit=dev` + `npm start` work in production/Docker. ESM imports use
  `.js` extensions.
- **Node ≥ 18** (native `fetch`). Dev/test on Node 22.
- **Secrets**: `ODDS_API_KEY`, `DASHBOARD_PASSWORD`, `DASHBOARD_USER` via env /
  `.env` (gitignored) / host secrets. Never commit them.

## 6. Known limitations / not done

- **Docker image not built here** — no Docker daemon in the dev sandbox. The
  Dockerfile is standard but has not been `docker build`-verified. Do that once.
- **Odds API coverage of Canadian books** not empirically checked against a live
  key — verify the allowlist keys actually return data (`npm run scan -- --list`
  and inspect a live response).
- **No caching** — every dashboard scan and every watch cycle spends API quota.
  A public/auto-refreshing dashboard can blow the 500/month free tier fast.
- **No persistence** — arbs aren't stored; no history.
- **Spreads matching** is by absolute line value; hasn't been stress-tested on
  messy real data (half-points, alt lines).
- **Stake allocation ignores per-book limits** and rounding beyond a flat
  increment.

## 7. Suggested next steps (offered to user, not yet chosen)

1. **Response caching** in the server (share one API call across viewers /
   short TTL) — protects quota. _Recommended first._
2. **GitHub Action** to auto-deploy to Fly on push to the branch.
3. **Middling** detection (different totals/spreads lines that can both win).
4. **History/persistence** — log found arbs (SQLite/Supabase) + an edge-over-time
   view.
5. **More alert channels** (Slack, email/SMTP) — notifier layer is pluggable.
6. **Native mobile screen** — the parent repo is React Native/Expo; could surface
   this as an in-app screen with push notifications.
7. **Verify & expand the Ontario allowlist** against the live iGO registry + API.

## 8. Git / workflow notes

- Branch: **`claude/sports-betting-arbitrage-09zlmv`** (push here; don't push
  elsewhere without permission). No PR has been opened — user hasn't asked.
- Commits so far (newest first): deployability → phone/LAN → web dashboard →
  Ontario filter → watch+notifications → initial scanner. See `git log main..HEAD`.
- All work is under `arb-scanner/`. The rest of the repo is the unrelated
  pantry app — leave it alone.
- Verify (`npm test`, `npx tsc --noEmit`, `npm run demo`) before committing;
  keep the honesty/caveat framing in any user-facing text.
