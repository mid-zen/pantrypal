/**
 * JSON-file store for the bankroll tracker (apps + transactions).
 * Same atomic-write pattern as promoStore; see its persistence caveat.
 */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { type App, type AppView, type BankrollTotals, computeApp, computeTotals, validateTxn } from "./bankroll.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PROMO_DATA_DIR || join(here, "..", "data");
const FILE = join(DATA_DIR, "bankroll.json");

async function readAll(): Promise<App[]> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as App[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: App[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + `.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await rename(tmp, FILE);
}

export async function list(): Promise<{ apps: AppView[]; totals: BankrollTotals }> {
  const apps = (await readAll())
    .map(computeApp)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { apps, totals: computeTotals(apps) };
}

export async function addApp(name: string, startingBalance: number): Promise<App> {
  const clean = (name || "").trim();
  if (!clean) throw new Error("App name is required.");
  if (!Number.isFinite(startingBalance) || startingBalance < 0) {
    throw new Error("Starting balance must be zero or positive.");
  }
  const listing = await readAll();
  if (listing.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error(`An app named "${clean}" already exists.`);
  }
  const app: App = { id: randomUUID(), name: clean, startingBalance, createdAt: new Date().toISOString(), txns: [], openBets: [] };
  listing.push(app);
  await writeAll(listing);
  return app;
}

export async function deleteApp(id: string): Promise<boolean> {
  const listing = await readAll();
  const next = listing.filter((a) => a.id !== id);
  if (next.length === listing.length) return false;
  await writeAll(next);
  return true;
}

/** Wipe an app to zero: clear its transactions and starting balance. */
export async function resetApp(id: string): Promise<App | null> {
  const listing = await readAll();
  const app = listing.find((a) => a.id === id);
  if (!app) return null;
  app.txns = [];
  app.openBets = [];
  app.startingBalance = 0;
  await writeAll(listing);
  return app;
}

/**
 * Add a transaction to an app. Supports a virtual type "set": `amount` is the
 * target balance and it's stored as an `adjust` that reconciles to it.
 */
export async function addTxn(
  appId: string,
  input: { type: string; amount: number; note?: string },
): Promise<App | null> {
  const listing = await readAll();
  const app = listing.find((a) => a.id === appId);
  if (!app) return null;

  let type = input.type;
  let amount = input.amount;
  let note = (input.note ?? "").slice(0, 200);

  if (type === "set") {
    const current = computeApp(app).balance;
    const target = amount;
    if (!Number.isFinite(target)) throw new Error("Target balance must be a number.");
    amount = target - current; // signed adjust
    type = "adjust";
    if (!note) note = `set balance to ${target}`;
  }

  const clean = validateTxn(type, amount);
  app.txns.push({ id: randomUUID(), date: new Date().toISOString(), type: clean.type, amount: clean.amount, note });
  await writeAll(listing);
  return app;
}

export async function deleteTxn(appId: string, txnId: string): Promise<boolean> {
  const listing = await readAll();
  const app = listing.find((a) => a.id === appId);
  if (!app) return false;
  const before = app.txns.length;
  app.txns = app.txns.filter((t) => t.id !== txnId);
  if (app.txns.length === before) return false;
  await writeAll(listing);
  return true;
}

/** Add a pending bet that reserves its stake from the app's available balance. */
export async function addOpenBet(
  appId: string,
  input: { description?: string; stake: number; potentialReturn: number; odds?: number },
): Promise<App | null> {
  const listing = await readAll();
  const app = listing.find((a) => a.id === appId);
  if (!app) return null;
  if (!Number.isFinite(input.stake) || input.stake <= 0) throw new Error("Stake must be positive.");
  if (!Number.isFinite(input.potentialReturn) || input.potentialReturn <= 0) throw new Error("Potential return must be positive.");
  app.openBets = app.openBets ?? [];
  app.openBets.push({
    id: randomUUID(),
    placedAt: new Date().toISOString(),
    description: (input.description ?? "").slice(0, 120),
    stake: input.stake,
    potentialReturn: input.potentialReturn,
    odds: Number.isFinite(input.odds as number) ? input.odds : undefined,
  });
  await writeAll(listing);
  return app;
}

/**
 * Settle an open bet:
 *   win  → records a win of (potentialReturn − stake) profit, frees the stake
 *   loss → records a loss of the stake
 *   void → just frees the stake back to available (no P/L)
 */
export async function settleOpenBet(
  appId: string,
  betId: string,
  outcome: "win" | "loss" | "void",
): Promise<App | null> {
  const listing = await readAll();
  const app = listing.find((a) => a.id === appId);
  if (!app || !app.openBets) return null;
  const bet = app.openBets.find((b) => b.id === betId);
  if (!bet) return null;
  app.openBets = app.openBets.filter((b) => b.id !== betId);

  if (outcome === "win") {
    app.txns.push({ id: randomUUID(), date: new Date().toISOString(), type: "win", amount: bet.potentialReturn - bet.stake, note: `Won: ${bet.description || "bet"}` });
  } else if (outcome === "loss") {
    app.txns.push({ id: randomUUID(), date: new Date().toISOString(), type: "loss", amount: bet.stake, note: `Lost: ${bet.description || "bet"}` });
  }
  // "void" leaves no transaction — the reserved stake simply returns to available.
  await writeAll(listing);
  return app;
}

export async function deleteOpenBet(appId: string, betId: string): Promise<boolean> {
  const listing = await readAll();
  const app = listing.find((a) => a.id === appId);
  if (!app || !app.openBets) return false;
  const before = app.openBets.length;
  app.openBets = app.openBets.filter((b) => b.id !== betId);
  if (app.openBets.length === before) return false;
  await writeAll(listing);
  return true;
}

/**
 * Post a batch of entries to apps identified BY NAME, creating any missing app
 * (starting balance 0). Used by the promo-settle flow. Returns the new listing.
 */
export async function postEntries(
  entries: { app: string; type: string; amount: number; note?: string }[],
): Promise<{ apps: AppView[]; totals: BankrollTotals }> {
  const listing = await readAll();
  for (const e of entries) {
    const name = (e.app || "").trim();
    if (!name) continue;
    let app = listing.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (!app) {
      app = { id: randomUUID(), name, startingBalance: 0, createdAt: new Date().toISOString(), txns: [] };
      listing.push(app);
    }
    let type = e.type;
    let amount = e.amount;
    let note = (e.note ?? "").slice(0, 200);
    if (type === "set") {
      const current = computeApp(app).balance;
      amount = amount - current;
      type = "adjust";
    }
    const clean = validateTxn(type, amount);
    app.txns.push({ id: randomUUID(), date: new Date().toISOString(), type: clean.type, amount: clean.amount, note });
  }
  await writeAll(listing);
  const apps = listing.map(computeApp).sort((a, b) => a.name.localeCompare(b.name));
  return { apps, totals: computeTotals(apps) };
}
