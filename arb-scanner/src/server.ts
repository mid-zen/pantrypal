/**
 * Web dashboard server.
 *
 *   npm run web        # then open http://localhost:3000
 *
 * Serves the static dashboard in ../public and a small JSON API that runs the
 * same arbitrage engine the CLI uses. No framework — just node:http.
 */
import http from "node:http";
import os from "node:os";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { loadEnv } from "./config.js";
import { fetchOdds, quotaRemaining } from "./oddsApi.js";
import { findArbitrage } from "./arbitrage.js";
import { SAMPLE_EVENTS } from "./sampleData.js";
import { ONTARIO_BOOKMAKERS, filterEventsToBooks, resolveBooks } from "./bookmakers.js";
import type { GameEvent } from "./types.js";

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);

// --- Optional password protection --------------------------------------
// If DASHBOARD_PASSWORD is set, every request (except /healthz) requires HTTP
// Basic auth. Strongly recommended when exposing the dashboard to the internet.
const AUTH_USER = process.env.DASHBOARD_USER || "admin";
const AUTH_PASS = process.env.DASHBOARD_PASSWORD || "";
const AUTH_ENABLED = AUTH_PASS.length > 0;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function isAuthorized(req: http.IncomingMessage): boolean {
  if (!AUTH_ENABLED) return true;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  // Evaluate both to avoid short-circuit timing leaks.
  const okUser = safeEqual(user, AUTH_USER);
  const okPass = safeEqual(pass, AUTH_PASS);
  return okUser && okPass;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const s = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(s);
}

async function serveStatic(res: http.ServerResponse, urlPath: string): Promise<void> {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = normalize(join(PUBLIC_DIR, rel));
  // Prevent path traversal outside the public dir.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + "/")) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}

const num = (v: string | null, fallback: number): number => {
  if (v === null || v.trim() === "") return fallback; // missing param -> default
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// --- Live-response cache -------------------------------------------------
// Every uncached live scan spends Odds API quota (free tier = 500/month), and
// auto-refresh or multiple open tabs would each burn a request. One fetch per
// distinct (sport, markets, regions, books) is shared for CACHE_TTL_SEC.
const CACHE_TTL_MS = Math.max(0, num(process.env.CACHE_TTL_SEC ?? null, 60)) * 1000;
const oddsCache = new Map<string, { expires: number; events: GameEvent[] }>();

async function cachedFetchOdds(args: Parameters<typeof fetchOdds>[0]): Promise<{ events: GameEvent[]; cached: boolean }> {
  const key = JSON.stringify([args.sport, args.markets, args.regions, args.bookmakers]);
  const hit = oddsCache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return { events: hit.events, cached: true };
  const events = await fetchOdds(args);
  for (const [k, v] of oddsCache) if (v.expires <= now) oddsCache.delete(k);
  oddsCache.set(key, { expires: now + CACHE_TTL_MS, events });
  return { events, cached: false };
}

async function handleScan(url: URL, res: http.ServerResponse): Promise<void> {
  const q = url.searchParams;
  const demo = q.get("demo") === "1" || q.get("demo") === "true";
  const sport = q.get("sport") || "upcoming";
  const regions = q.get("regions") || "us";
  const markets = q.get("markets") || "h2h,spreads,totals";
  const stake = num(q.get("stake"), 1000);
  const minMargin = num(q.get("minMargin"), 0.5);
  const increment = num(q.get("increment"), 1);
  const includeLive = q.get("includeLive") === "1" || q.get("includeLive") === "true";
  const includeOdds = q.get("includeOdds") === "1" || q.get("includeOdds") === "true";
  const maxStalenessMin = num(q.get("maxStaleMin"), 15);

  if (stake <= 0) {
    sendJson(res, 400, { ok: false, error: "Stake must be a positive number." });
    return;
  }

  const sel = resolveBooks(q.get("books") || "ontario");
  const scanOpts = {
    totalStake: stake,
    minMarginPct: minMargin,
    stakeIncrement: increment > 0 ? increment : 1,
    includeLive,
    maxStalenessMin,
  };

  try {
    let events: GameEvent[];
    let cached = false;
    if (demo) {
      events = SAMPLE_EVENTS;
    } else {
      const apiKey = process.env.ODDS_API_KEY;
      if (!apiKey || apiKey === "your-odds-api-key-here") {
        sendJson(res, 200, {
          ok: false,
          needKey: true,
          error:
            "No ODDS_API_KEY configured on the server. Use Demo mode, or add a key " +
            "to arb-scanner/.env and restart `npm run web`.",
        });
        return;
      }
      ({ events, cached } = await cachedFetchOdds({
        apiKey,
        sport,
        regions,
        markets,
        bookmakers: sel.requestBooks,
      }));
    }

    const filtered = filterEventsToBooks(events, sel.allowedKeys);
    const opportunities = findArbitrage(filtered, scanOpts);

    sendJson(res, 200, {
      ok: true,
      mode: demo ? "demo" : "live",
      sport,
      stake,
      minMargin,
      books: sel.titles,
      booksLabel: sel.label,
      booksFiltered: sel.allowedKeys !== null,
      gamesScanned: filtered.length,
      count: opportunities.length,
      opportunities,
      // Raw pulled odds, so the user can see exactly what each book offered.
      events: includeOdds ? filtered : undefined,
      cached,
      quotaRemaining: demo ? null : quotaRemaining(),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // Health check for host platforms — always open, no auth.
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  // Password gate (when DASHBOARD_PASSWORD is set).
  if (!isAuthorized(req)) {
    res.writeHead(401, {
      "www-authenticate": 'Basic realm="Arb Scanner", charset="UTF-8"',
      "content-type": "text/plain",
    });
    res.end("Authentication required.");
    return;
  }

  if (url.pathname === "/api/scan") {
    void handleScan(url, res);
    return;
  }
  if (url.pathname === "/api/meta") {
    const hasKey = Boolean(process.env.ODDS_API_KEY && process.env.ODDS_API_KEY !== "your-odds-api-key-here");
    sendJson(res, 200, { hasKey, ontario: ONTARIO_BOOKMAKERS });
    return;
  }
  void serveStatic(res, url.pathname);
});

/** Non-internal IPv4 addresses, so you can open the dashboard from your phone. */
function lanAddresses(): string[] {
  const out: string[] = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// Bind to 0.0.0.0 so other devices on the same Wi-Fi (e.g. your phone) can reach it.
server.listen(PORT, "0.0.0.0", () => {
  let msg = `\n  Arb dashboard running:\n    On this computer →  http://localhost:${PORT}\n`;
  const lan = lanAddresses();
  if (lan.length > 0) {
    msg += `    On your phone (same Wi-Fi) →  http://${lan[0]}:${PORT}\n`;
    for (const ip of lan.slice(1)) msg += `                                  http://${ip}:${PORT}\n`;
  }
  msg += AUTH_ENABLED
    ? `  Password protection: ON (user "${AUTH_USER}")\n`
    : `  Password protection: OFF — set DASHBOARD_PASSWORD before exposing publicly.\n`;
  msg += `  (press Ctrl+C to stop)\n\n`;
  process.stdout.write(msg);
});
