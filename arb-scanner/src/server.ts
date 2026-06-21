/**
 * Web dashboard server.
 *
 *   npm run web        # then open http://localhost:3000
 *
 * Serves the static dashboard in ../public and a small JSON API that runs the
 * same arbitrage engine the CLI uses. No framework — just node:http.
 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize } from "node:path";
import { loadEnv } from "./config.js";
import { fetchOdds } from "./oddsApi.js";
import { findArbitrage } from "./arbitrage.js";
import { SAMPLE_EVENTS } from "./sampleData.js";
import { ONTARIO_BOOKMAKERS, filterEventsToBooks, resolveBooks } from "./bookmakers.js";
import type { GameEvent } from "./types.js";

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(here, "..", "public");
const PORT = Number(process.env.PORT ?? 3000);

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
  if (!filePath.startsWith(PUBLIC_DIR)) {
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

async function handleScan(url: URL, res: http.ServerResponse): Promise<void> {
  const q = url.searchParams;
  const demo = q.get("demo") === "1" || q.get("demo") === "true";
  const sport = q.get("sport") || "upcoming";
  const regions = q.get("regions") || "us";
  const markets = q.get("markets") || "h2h,spreads,totals";
  const stake = num(q.get("stake"), 1000);
  const minMargin = num(q.get("minMargin"), 0.5);
  const increment = num(q.get("increment"), 1);

  if (stake <= 0) {
    sendJson(res, 400, { ok: false, error: "Stake must be a positive number." });
    return;
  }

  const sel = resolveBooks(q.get("books") || "ontario");
  const scanOpts = {
    totalStake: stake,
    minMarginPct: minMargin,
    stakeIncrement: increment > 0 ? increment : 1,
  };

  try {
    let events: GameEvent[];
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
      events = await fetchOdds({ apiKey, sport, regions, markets, bookmakers: sel.requestBooks });
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
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    sendJson(res, 200, { ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
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

server.listen(PORT, () => {
  process.stdout.write(
    `\n  Arb dashboard running →  http://localhost:${PORT}\n` +
      `  (open that in your browser; press Ctrl+C to stop)\n\n`,
  );
});
