import type { QuoteType } from "../../shared/types";

/**
 * Every change to a portfolio is a transaction; holdings, cost basis, realized gains and cash
 * balances are all derived from the list. That's what lets you backdate trades and see gains on
 * positions you've already sold.
 */
export type TxType = "buy" | "sell" | "dividend" | "deposit" | "withdrawal";

export interface Transaction {
  id: string;
  type: TxType;
  /** Trade date, YYYY-MM-DD. */
  date: string;
  /** Security fields: set for buy, sell and dividend. */
  symbol?: string;
  name?: string;
  quoteType?: QuoteType;
  /**
   * Currency of `price` and `fee`, exactly as the security is quoted (may be a minor unit such as GBp).
   * For deposits, withdrawals and dividends: the currency of `amount`, always a whole-unit ISO code.
   */
  currency: string;
  shares?: number;
  /** Price per share. Undefined only for holdings imported from before trades were tracked, if no cost was entered. */
  price?: number;
  fee?: number;
  /** Dividend, deposit or withdrawal total. */
  amount?: number;
  /** Buy, sell or dividend: settle against the portfolio's cash balance in that currency. */
  cash?: boolean;
  /** Tie-breaker for transactions on the same day: the order they were entered. */
  createdAt: number;
}

export interface LedgerPosition {
  symbol: string;
  name: string;
  quoteType: QuoteType;
  /** Quote currency (may be a minor unit such as GBp); cost and realized are in this currency. */
  currency: string;
  shares: number;
  /** Total cost of the shares still held, fees included. Undefined if any lot has no price. */
  cost?: number;
  /** Gain locked in by sells, fees included. Only sells whose cost was known count. */
  realized: number;
  /** Dividends received, keyed by (whole-unit) currency. */
  dividends: Record<string, number>;
}

export interface Sale {
  tx: Transaction;
  proceeds: number;
  costBasis?: number;
  gain?: number;
}

export interface Ledger {
  positions: Map<string, LedgerPosition>;
  /** Cash balance per whole-unit currency. */
  cash: Record<string, number>;
  sales: Sale[];
  /** Transactions that don't add up, e.g. selling more shares than were held on that date. */
  issues: Map<string, string>;
}

const EPS = 1e-9;

/** Minor-unit currencies (London pence etc.) → whole-unit currency and divisor. */
export function currencyUnit(currency: string): [string, number] {
  if (currency === "GBp" || currency === "GBX") return ["GBP", 100];
  if (currency === "ZAc") return ["ZAR", 100];
  if (currency === "ILA") return ["ILS", 100];
  return [currency.toUpperCase(), 1];
}

export const byDate = (a: Transaction, b: Transaction) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt;

/** Replays the transactions in date order, optionally only those on or before `until` (YYYY-MM-DD). */
export function computeLedger(transactions: Transaction[], until?: string): Ledger {
  const positions = new Map<string, LedgerPosition>();
  const cash: Record<string, number> = {};
  const sales: Sale[] = [];
  const issues = new Map<string, string>();
  const addCash = (ccy: string, amount: number) => (cash[ccy] = (cash[ccy] ?? 0) + amount);

  for (const tx of [...transactions].sort(byDate)) {
    if (until && tx.date > until) break;

    if (tx.type === "deposit" || tx.type === "withdrawal") {
      addCash(tx.currency, tx.type === "deposit" ? (tx.amount ?? 0) : -(tx.amount ?? 0));
      continue;
    }
    if (!tx.symbol) continue;

    let pos = positions.get(tx.symbol);
    if (!pos) {
      pos = { symbol: tx.symbol, name: tx.name ?? tx.symbol, quoteType: tx.quoteType ?? "EQUITY", currency: tx.currency, shares: 0, cost: 0, realized: 0, dividends: {} };
      positions.set(tx.symbol, pos);
    }

    if (!pos.currency && tx.type !== "dividend") pos.currency = tx.currency; // imported holdings may lack it

    if (tx.type === "dividend") {
      const amount = tx.amount ?? 0;
      pos.dividends[tx.currency] = (pos.dividends[tx.currency] ?? 0) + amount;
      if (tx.cash) addCash(tx.currency, amount);
      continue;
    }

    const [cashCcy, unit] = currencyUnit(tx.currency);
    const fee = tx.fee ?? 0;
    let shares = tx.shares ?? 0;

    if (tx.type === "buy") {
      if (pos.shares < EPS) pos.cost = 0; // a fresh position starts a fresh cost basis
      pos.shares += shares;
      pos.cost = pos.cost == null || tx.price == null ? undefined : pos.cost + shares * tx.price + fee;
      if (tx.cash && tx.price != null) addCash(cashCcy, -(shares * tx.price + fee) / unit);
    } else {
      if (shares > pos.shares + EPS) {
        issues.set(tx.id, `Sells ${shares} shares but only ${+pos.shares.toFixed(6)} were held on ${tx.date}.`);
        shares = pos.shares;
      }
      const proceeds = shares * (tx.price ?? 0) - fee;
      const costBasis = pos.cost != null && pos.shares > EPS ? (pos.cost * shares) / pos.shares : undefined;
      const gain = costBasis != null && tx.price != null ? proceeds - costBasis : undefined;
      if (gain != null) pos.realized += gain;
      if (pos.cost != null && costBasis != null) pos.cost -= costBasis;
      pos.shares -= shares;
      if (pos.shares < EPS) {
        pos.shares = 0;
        pos.cost = 0;
      }
      sales.push({ tx, proceeds, costBasis, gain });
      if (tx.cash) addCash(cashCcy, proceeds / unit);
    }
  }
  return { positions, cash, sales, issues };
}

/** Shares of `symbol` held at the end of `date`. */
export const sharesOn = (transactions: Transaction[], symbol: string, date: string) =>
  computeLedger(transactions, date).positions.get(symbol)?.shares ?? 0;

/**
 * Money moved into (+) or out of (−) the portfolio by a transaction, in whole currency units.
 * Cash-settled trades move money within the portfolio, so they aren't flows.
 */
export function externalFlow(tx: Transaction): [currency: string, amount: number] | null {
  if (tx.type === "deposit") return [tx.currency, tx.amount ?? 0];
  if (tx.type === "withdrawal") return [tx.currency, -(tx.amount ?? 0)];
  if (tx.cash) return null;
  if (tx.type === "dividend") return [tx.currency, -(tx.amount ?? 0)]; // paid out to you
  if (tx.price == null) return null;
  const [ccy, unit] = currencyUnit(tx.currency);
  const gross = (tx.shares ?? 0) * tx.price;
  const fee = tx.fee ?? 0;
  return tx.type === "buy" ? [ccy, (gross + fee) / unit] : [ccy, -(gross - fee) / unit];
}
