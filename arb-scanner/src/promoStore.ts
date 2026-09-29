/**
 * Simple JSON-file store for saved promos (the tracker).
 *
 * Single-user, low-volume, so a JSON file is plenty — no DB dependency. Writes
 * are atomic (temp file + rename) so a crash mid-write can't corrupt the store.
 *
 * NOTE: on ephemeral/free hosting (Render/Fly without a persistent disk) the
 * file is wiped on redeploy/restart. Point PROMO_DATA_DIR at a mounted volume
 * to keep history. Locally it just works.
 */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { PromoCalcInput, PromoResult } from "./promos.js";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PROMO_DATA_DIR || join(here, "..", "data");
const FILE = join(DATA_DIR, "promos.json");

export type PromoStatus = "planned" | "placed" | "settled";

export interface SavedPromo {
  id: string;
  createdAt: string;
  type: string;
  bookA: string;
  bookB: string;
  guaranteedProfit: number;
  cashAtRisk: number;
  status: PromoStatus;
  note: string;
  input: PromoCalcInput;
  result: Pick<PromoResult, "legs" | "effectiveBackOdds" | "conversionPct" | "summary">;
}

async function readAll(): Promise<SavedPromo[]> {
  try {
    const text = await readFile(FILE, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as SavedPromo[]) : [];
  } catch {
    return []; // missing/corrupt file → start empty
  }
}

async function writeAll(list: SavedPromo[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + `.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await rename(tmp, FILE); // atomic replace
}

export interface PromoTotals {
  planned: number; // guaranteed profit of not-yet-settled promos
  settled: number; // realized guaranteed profit
  all: number;
  count: number;
  atRisk: number; // cash currently tied up in planned/placed promos
}

function totals(list: SavedPromo[]): PromoTotals {
  let planned = 0;
  let settled = 0;
  let atRisk = 0;
  for (const p of list) {
    if (p.status === "settled") settled += p.guaranteedProfit;
    else {
      planned += p.guaranteedProfit;
      atRisk += p.cashAtRisk;
    }
  }
  return { planned, settled, all: planned + settled, count: list.length, atRisk };
}

export async function listPromos(): Promise<{ promos: SavedPromo[]; totals: PromoTotals }> {
  const promos = (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { promos, totals: totals(promos) };
}

export async function addPromo(args: {
  input: PromoCalcInput;
  result: PromoResult;
  note?: string;
}): Promise<SavedPromo> {
  const list = await readAll();
  const { input, result } = args;
  const saved: SavedPromo = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    type: input.type,
    bookA: input.bookA?.trim() || "Book A",
    bookB: input.bookB?.trim() || "Book B",
    guaranteedProfit: result.guaranteedProfit,
    cashAtRisk: result.cashAtRisk,
    status: "planned",
    note: (args.note ?? "").slice(0, 500),
    input,
    result: {
      legs: result.legs,
      effectiveBackOdds: result.effectiveBackOdds,
      conversionPct: result.conversionPct,
      summary: result.summary,
    },
  };
  list.push(saved);
  await writeAll(list);
  return saved;
}

export async function updatePromo(
  id: string,
  patch: { status?: PromoStatus; note?: string },
): Promise<SavedPromo | null> {
  const list = await readAll();
  const promo = list.find((p) => p.id === id);
  if (!promo) return null;
  if (patch.status && ["planned", "placed", "settled"].includes(patch.status)) {
    promo.status = patch.status;
  }
  if (patch.note !== undefined) promo.note = patch.note.slice(0, 500);
  await writeAll(list);
  return promo;
}

export async function deletePromo(id: string): Promise<boolean> {
  const list = await readAll();
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  await writeAll(next);
  return true;
}
