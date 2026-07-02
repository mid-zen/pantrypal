# Deploying the dashboard

The dashboard is a plain Node web server (`npm start`), so it runs anywhere Node
or Docker runs. Pick the path that matches what you want:

| I want… | Use | Persists? | Effort |
|---------|-----|-----------|--------|
| To glance at it on my phone off Wi-Fi, right now | **Cloudflared tunnel** | No (while your PC is on) | 1 command |
| An always-on link I can bookmark | **Fly.io** or **Render** | Yes | ~10 min |
| To run it on my own server/VPS | **Docker** | Yes | ~10 min |

> 🔒 **Before you expose it publicly, set a password.** Set `DASHBOARD_PASSWORD`
> (and optionally `DASHBOARD_USER`, default `admin`). The server then requires
> HTTP Basic auth on every page. Also set your `ODDS_API_KEY` as a secret on the
> host so Live mode works. Never commit these — use the host's secret settings.

---

## Option A — Instant public link (Cloudflared tunnel)

Best for "let me check it from my phone on cellular for a bit." Your computer
keeps running the app; Cloudflare gives you a temporary public URL.

```bash
# terminal 1: run the dashboard
npm run web

# terminal 2: open a tunnel to it
npm run tunnel        # = npx cloudflared tunnel --url http://localhost:3000
```

Cloudflared prints a URL like `https://random-words.trycloudflare.com` — open
that on any device, anywhere. It stays up until you stop either command. The URL
changes each time. (First run downloads the cloudflared binary.)

---

## Option B — Fly.io (always-on, CLI-driven)

```bash
# one-time: install flyctl and log in
#   https://fly.io/docs/hpn/install/     then:  fly auth login

cd arb-scanner
# edit fly.toml: change `app = "arb-scanner-CHANGE-ME"` to your own unique name
fly launch --no-deploy --copy-config          # creates the app from fly.toml
fly secrets set ODDS_API_KEY=your_key DASHBOARD_PASSWORD=your_password
fly deploy
```

`fly deploy` builds the Dockerfile and gives you `https://<your-app>.fly.dev`.
The config uses the Toronto region (`yyz`) and scales to zero when idle.

---

## Option C — Render (always-on, mostly clicks)

1. Push this repo to GitHub (already done on your branch).
2. Render dashboard → **New → Web Service** → connect the repo.
3. Set **Root Directory** to `arb-scanner`.
4. Runtime **Docker** (it'll find the `Dockerfile`), or Node with
   Build = `npm ci` and Start = `npm start`.
5. **Environment → Add**: `ODDS_API_KEY` and `DASHBOARD_PASSWORD`.
6. Health check path: `/healthz`. Create the service.

Render builds and serves it at `https://<your-service>.onrender.com`.
(Free tier sleeps when idle and wakes on first request.)

---

## Option D — Any Docker host / VPS

```bash
cd arb-scanner
docker build -t arb-scanner .
docker run -d --restart unless-stopped -p 80:3000 \
  -e ODDS_API_KEY=your_key \
  -e DASHBOARD_PASSWORD=your_password \
  --name arb-scanner arb-scanner
```

Then point a domain at the box (and put it behind a TLS proxy such as Caddy or
Nginx for HTTPS). The container answers health checks on `/healthz`.

---

## Environment variables reference

| Variable | Needed for | Notes |
|----------|-----------|-------|
| `ODDS_API_KEY` | Live odds | From https://the-odds-api.com |
| `DASHBOARD_PASSWORD` | Public hosting | Enables HTTP Basic auth when set |
| `DASHBOARD_USER` | — | Basic-auth username (default `admin`) |
| `PORT` | — | Host usually sets this; server binds `0.0.0.0` |

## Cost & quota reminders

- Live scans spend Odds API quota (free tier = 500/month). A public dashboard
  that many people refresh — or one with auto-refresh left on — burns through it
  fast. Consider a higher `--interval`, caching, or a paid Odds API plan.
- Free hosting tiers (Render/Fly) sleep when idle; the first request after a nap
  is slow while it wakes.
