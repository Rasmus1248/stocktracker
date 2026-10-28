import type { PriceHistory } from "../../shared/types";
import { computeLedger, currencyUnit, externalFlow, type Transaction } from "./ledger";
import type { Portfolio } from "./portfolio";

export interface YearRow {
  year: number;
  /** Value on 31 Dec of the previous year (0 before the first trade). */
  startValue?: number;
  /** Value on 31 Dec, or today for the current year. */
  endValue?: number;
  /** Money you put in (+) or took out (−) during the year: deposits, withdrawals, trades not settled in cash. */
  netFlows?: number;
  /** endValue − startValue − netFlows: what the portfolio earned, sold positions and dividends included. */
  gain?: number;
  /** Modified Dietz return, which accounts for when during the year money came in or out. */
  returnPct?: number;
  /** Gains locked in by sells during the year (useful for taxes). */
  realized: number;
  dividends: number;
  /** False if a price or exchange rate was missing; the gain is then not shown. */
  complete: boolean;
  /** True if an imported holding without a purchase price had to be valued at that day's market price. */
  estimated: boolean;
}

/** Last close on or before a date, from a series sorted oldest first. */
export function closeOn(points: [string, number][] | undefined, date: string): number | undefined {
  if (!points?.length || points[0][0] > date) return undefined;
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid][0] <= date) lo = mid;
    else hi = mid - 1;
  }
  return points[lo][1];
}

export const fxSymbol = (from: string, to: string) => `${from}${to}=X`;

export interface Lookup {
  price(symbol: string, date: string): number | undefined;
  fx(currency: string, date: string): number | undefined;
}

export function makeLookup(history: Record<string, PriceHistory | undefined>, base: string): Lookup {
  return {
    price: (symbol, date) => closeOn(history[symbol]?.points, date),
    fx: (ccy, date) => (ccy === base ? 1 : closeOn(history[fxSymbol(ccy, base)]?.points, date)),
  };
}

const yearEnd = (y: number) => `${y}-12-31`;
const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** Which price histories the yearly table needs, all fetched from one start date so they cache well. */
export function historyNeeds(portfolios: Portfolio[], base: string, today: string) {
  const txs = portfolios.flatMap((p) => p.transactions);
  if (txs.length === 0) return null;
  const firstYear = Math.min(...txs.map((t) => +t.date.slice(0, 4)));
  const thisYear = +today.slice(0, 4);
  const symbols = new Set<string>();
  const currencies = new Set<string>();
  for (const t of txs) {
    currencies.add(currencyUnit(t.currency)[0]);
    if (t.symbol && t.price == null) symbols.add(t.symbol); // priced from history instead
  }
  for (let y = firstYear; y < thisYear; y++) {
    for (const p of portfolios) {
      const l = computeLedger(p.transactions, yearEnd(y));
      for (const pos of l.positions.values()) if (pos.shares > 0) symbols.add(pos.symbol);
    }
  }
  currencies.delete(base);
  currencies.delete("");
  const all = [...symbols, ...[...currencies].map((c) => fxSymbol(c, base))];
  return all.length ? { from: `${firstYear - 1}-12-15`, symbols: all.sort() } : null;
}

function valueAt(portfolios: Portfolio[], date: string, base: string, lookup: Lookup): number | undefined {
  let total = 0;
  for (const p of portfolios) {
    const l = computeLedger(p.transactions, date);
    for (const pos of l.positions.values()) {
      if (pos.shares <= 0) continue;
      const close = lookup.price(pos.symbol, date);
      const [ccy, unit] = currencyUnit(pos.currency);
      const rate = lookup.fx(ccy, date);
      if (close == null || rate == null) return undefined;
      total += (pos.shares * close * rate) / unit;
    }
    for (const [ccy, amount] of Object.entries(l.cash)) {
      const rate = lookup.fx(ccy, date);
      if (rate == null) return undefined;
      total += amount * rate;
    }
  }
  return total;
}

/** The external flow of a transaction in base currency, pricing imported holdings at that day's close. */
function flowOf(tx: Transaction, base: string, lookup: Lookup): { amount?: number; estimated: boolean } {
  let estimated = false;
  let t = tx;
  if ((tx.type === "buy" || tx.type === "sell") && tx.price == null && !tx.cash && tx.symbol) {
    const price = lookup.price(tx.symbol, tx.date);
    if (price == null) return { estimated: true };
    t = { ...tx, price };
    estimated = true;
  }
  const flow = externalFlow(t);
  if (!flow) return { amount: 0, estimated };
  const rate = lookup.fx(flow[0], tx.date);
  return { amount: rate == null ? undefined : flow[1] * rate, estimated };
}

export function yearlyPerformance(
  portfolios: Portfolio[],
  base: string,
  lookup: Lookup,
  today: string,
  liveValue: number | undefined,
): YearRow[] {
  const txs = portfolios.flatMap((p) => p.transactions);
  if (txs.length === 0) return [];
  const firstYear = Math.min(...txs.map((t) => +t.date.slice(0, 4)));
  const thisYear = +today.slice(0, 4);
  const sales = portfolios.flatMap((p) => computeLedger(p.transactions).sales);
  const rows: YearRow[] = [];

  for (let year = thisYear; year >= firstYear; year--) {
    const start = yearEnd(year - 1);
    const end = year === thisYear ? today : yearEnd(year);
    const startValue = year === firstYear ? 0 : valueAt(portfolios, start, base, lookup);
    const endValue = year === thisYear ? liveValue : valueAt(portfolios, end, base, lookup);
    const inYear = (d: string) => d > start && d <= end;

    let netFlows: number | undefined = 0;
    let weighted = 0;
    let estimated = false;
    const span = dayNumber(end) - dayNumber(start);
    for (const tx of txs) {
      if (!inYear(tx.date)) continue;
      const f = flowOf(tx, base, lookup);
      estimated ||= f.estimated;
      if (f.amount == null || netFlows == null) {
        netFlows = undefined;
        continue;
      }
      netFlows += f.amount;
      weighted += (f.amount * (dayNumber(end) - dayNumber(tx.date))) / span;
    }

    let realized = 0;
    for (const s of sales) {
      if (!inYear(s.tx.date) || s.gain == null) continue;
      const [ccy, unit] = currencyUnit(s.tx.currency);
      realized += ((s.gain / unit) * (lookup.fx(ccy, s.tx.date) ?? 0));
    }
    let dividends = 0;
    for (const tx of txs) {
      if (tx.type === "dividend" && inYear(tx.date)) dividends += (tx.amount ?? 0) * (lookup.fx(tx.currency, tx.date) ?? 0);
    }

    const complete = startValue != null && endValue != null && netFlows != null;
    const gain = complete ? endValue! - startValue! - netFlows! : undefined;
    const denom = complete ? startValue! + weighted : 0;
    rows.push({
      year, startValue, endValue, netFlows, gain, realized, dividends, complete, estimated,
      returnPct: gain != null && denom > 0 ? (gain / denom) * 100 : undefined,
    });
  }
  return rows;
}
