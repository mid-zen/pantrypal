/**
 * Bankroll tracking — pure math (no I/O).
 *
 * Each sportsbook app has a starting balance plus a list of transactions. The
 * running balance and profit/loss are derived, never stored, so they can't drift
 * out of sync.
 *
 *   balance = startingBalance + Σ delta(txn)
 *   P/L     = Σ delta(txn) over betting entries only (win/loss/bonus/adjust)
 *
 * Deposits and withdrawals move capital in/out — they change the balance but are
 * NOT profit. So an app can hold $500 with a P/L of +$80.
 */

export type TxnType = "deposit" | "withdraw" | "win" | "loss" | "bonus" | "adjust";

export const TXN_TYPES: TxnType[] = ["deposit", "withdraw", "win", "loss", "bonus", "adjust"];

/** Transaction types that represent gambling result (count toward P/L). */
const PNL_TYPES = new Set<TxnType>(["win", "loss", "bonus", "adjust"]);

export interface Txn {
  id: string;
  date: string;
  type: TxnType;
  /** Magnitude (>= 0) for all types except `adjust`, which is signed. */
  amount: number;
  note: string;
}

export interface App {
  id: string;
  name: string;
  startingBalance: number;
  createdAt: string;
  txns: Txn[];
}

/** Signed effect of a transaction on the balance. */
export function delta(txn: Txn): number {
  switch (txn.type) {
    case "deposit":
    case "win":
    case "bonus":
      return txn.amount;
    case "withdraw":
    case "loss":
      return -txn.amount;
    case "adjust":
      return txn.amount; // already signed
  }
}

export interface AppView extends App {
  balance: number;
  deposited: number;
  withdrawn: number;
  pnl: number;
}

export function computeApp(app: App): AppView {
  let balance = app.startingBalance;
  let deposited = 0;
  let withdrawn = 0;
  let pnl = 0;
  for (const t of app.txns) {
    const d = delta(t);
    balance += d;
    if (t.type === "deposit") deposited += t.amount;
    else if (t.type === "withdraw") withdrawn += t.amount;
    if (PNL_TYPES.has(t.type)) pnl += d;
  }
  return { ...app, balance, deposited, withdrawn, pnl };
}

export interface BankrollTotals {
  balance: number;
  pnl: number;
  deposited: number;
  withdrawn: number;
  netDeposited: number; // deposited - withdrawn (cash currently committed via txns)
  apps: number;
}

export function computeTotals(views: AppView[]): BankrollTotals {
  const t: BankrollTotals = { balance: 0, pnl: 0, deposited: 0, withdrawn: 0, netDeposited: 0, apps: views.length };
  for (const v of views) {
    t.balance += v.balance;
    t.pnl += v.pnl;
    t.deposited += v.deposited;
    t.withdrawn += v.withdrawn;
  }
  t.netDeposited = t.deposited - t.withdrawn;
  return t;
}

/** Validate a transaction's type/amount. Returns a clean {type, amount}. */
export function validateTxn(type: string, amount: number): { type: TxnType; amount: number } {
  if (!TXN_TYPES.includes(type as TxnType)) throw new Error(`Unknown transaction type: ${type}`);
  if (!Number.isFinite(amount)) throw new Error("Amount must be a number.");
  if (type !== "adjust" && amount < 0) throw new Error("Amount must be zero or positive.");
  return { type: type as TxnType, amount };
}
