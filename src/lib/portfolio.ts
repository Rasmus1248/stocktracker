import type { FundHoldings, Quote, QuoteType } from "../../shared/types";
import { computeLedger, currencyUnit, type Transaction } from "./ledger";

export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: string;
  transactions: Transaction[];
  /** Free-text reminders per symbol, e.g. "sell at 250" or "hold until 300". */
  notes: Record<string, string>;
}

/** A current position, derived from one or more portfolios' transactions. Cash balances are holdings too. */
export interface Holding {
  symbol: string;
  name: string;
  quoteType: QuoteType;
  /** For cash, the balance. */
  shares: number;
  /** Average cost per share including fees, in the security's quote currency. Undefined if unknown. */
  avgCost?: number;
  note?: string;
  /** Names of the portfolios holding it (shown in the combined view). */
  portfolios: string[];
}

export const CASH_PREFIX = "CASH:";
export const isCash = (h: { quoteType: QuoteType }) => h.quoteType === "CASH";
export const isFund = (t: QuoteType) => t === "ETF" || t === "MUTUALFUND";

/** Yahoo quotes London listings in pence (GBp/GBX); normalise to whole currency units. */
export function normalizeCurrency(currency: string, amount: number): [string, number] {
  const [ccy, unit] = currencyUnit(currency);
  return [ccy, amount / unit];
}

/** Holdings plus all-time realized results for one portfolio or several combined. */
export interface PortfolioView {
  holdings: Holding[];
  /** Realized gains from sells, by quote currency (e.g. GBp). */
  realized: Record<string, number>;
  /** Dividends received, by currency. */
  dividends: Record<string, number>;
  issues: number;
}

const add = (rec: Record<string, number>, k: string, v: number) => (rec[k] = (rec[k] ?? 0) + v);

export function buildView(portfolios: Portfolio[]): PortfolioView {
  const bySymbol = new Map<string, Holding & { cost?: number }>();
  const realized: Record<string, number> = {};
  const dividends: Record<string, number> = {};
  let issues = 0;

  for (const p of portfolios) {
    const ledger = computeLedger(p.transactions);
    issues += ledger.issues.size;
    for (const pos of ledger.positions.values()) {
      if (pos.realized) add(realized, pos.currency, pos.realized);
      for (const [ccy, v] of Object.entries(pos.dividends)) add(dividends, ccy, v);
      if (pos.shares <= 0) continue;
      const h = bySymbol.get(pos.symbol);
      const note = p.notes?.[pos.symbol];
      if (!h) {
        bySymbol.set(pos.symbol, {
          symbol: pos.symbol, name: pos.name, quoteType: pos.quoteType, shares: pos.shares, cost: pos.cost,
          note, portfolios: [p.name],
        });
      } else {
        h.shares += pos.shares;
        h.cost = h.cost == null || pos.cost == null ? undefined : h.cost + pos.cost;
        h.portfolios.push(p.name);
        if (note) h.note = h.note ? `${h.note} · ${note}` : note;
      }
    }
    for (const [ccy, amount] of Object.entries(ledger.cash)) {
      if (Math.abs(amount) < 0.005) continue;
      const key = CASH_PREFIX + ccy;
      const h = bySymbol.get(key);
      if (h) {
        h.shares += amount;
        h.portfolios.push(p.name);
      } else bySymbol.set(key, { symbol: key, name: `Cash (${ccy})`, quoteType: "CASH", shares: amount, portfolios: [p.name] });
    }
  }

  const holdings = [...bySymbol.values()].map(({ cost, ...h }) => ({
    ...h,
    avgCost: !isCash(h) && cost != null && h.shares > 0 ? cost / h.shares : undefined,
  }));
  return { holdings, realized, dividends, issues };
}

/** Currencies a view needs FX rates for, besides those of its quotes. */
export function viewCurrencies(view: PortfolioView): string[] {
  const set = new Set<string>();
  for (const h of view.holdings) if (isCash(h)) set.add(h.symbol.slice(CASH_PREFIX.length));
  for (const c of Object.keys(view.realized)) set.add(currencyUnit(c)[0]);
  for (const c of Object.keys(view.dividends)) set.add(currencyUnit(c)[0]);
  return [...set];
}

export interface Position {
  holding: Holding;
  quote?: Quote;
  /** Values below are in the portfolio's base currency; undefined when a quote or FX rate is missing. */
  value?: number;
  cost?: number;
  gain?: number;
  gainPercent?: number;
  dayChange?: number;
  weight?: number;
}

export interface PortfolioSummary {
  positions: Position[];
  totalValue: number;
  cashValue: number;
  /** Unrealized gain on holdings with a known cost. */
  totalCost: number;
  totalGain: number;
  totalGainPercent?: number;
  /** All-time realized gains plus dividends, at today's exchange rates. */
  realizedGain: number;
  dayChange: number;
  dayChangePercent?: number;
  weightedDividendYield?: number;
  missing: string[];
}

export function summarize(view: PortfolioView, quotes: Record<string, Quote>, fx: Record<string, number>): PortfolioSummary {
  const missing: string[] = [];
  const positions: Position[] = view.holdings.map((holding) => {
    if (isCash(holding)) {
      const rate = fx[holding.symbol.slice(CASH_PREFIX.length)];
      if (rate == null) {
        missing.push(holding.name);
        return { holding };
      }
      return { holding, value: holding.shares * rate, dayChange: 0 };
    }
    const quote = quotes[holding.symbol];
    if (!quote) {
      missing.push(holding.symbol);
      return { holding };
    }
    const [ccy, price] = normalizeCurrency(quote.currency, quote.price);
    const rate = fx[ccy];
    if (rate == null) {
      missing.push(holding.symbol);
      return { holding, quote };
    }
    const value = holding.shares * price * rate;
    const pos: Position = { holding, quote, value };
    if (holding.avgCost != null && holding.avgCost > 0) {
      // avgCost is in display units (e.g. pence for GBp listings), same as the quoted price.
      pos.cost = holding.shares * normalizeCurrency(quote.currency, holding.avgCost)[1] * rate;
      pos.gain = value - pos.cost;
      pos.gainPercent = (pos.gain / pos.cost) * 100;
    }
    if (quote.change != null) pos.dayChange = holding.shares * normalizeCurrency(quote.currency, quote.change)[1] * rate;
    return pos;
  });

  const totalValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  for (const p of positions) if (p.value != null && totalValue > 0) p.weight = p.value / totalValue;
  const cashValue = positions.filter((p) => isCash(p.holding)).reduce((s, p) => s + (p.value ?? 0), 0);

  const withCost = positions.filter((p) => p.cost != null);
  const totalCost = withCost.reduce((s, p) => s + p.cost!, 0);
  const totalGain = withCost.reduce((s, p) => s + p.gain!, 0);
  const dayChange = positions.reduce((s, p) => s + (p.dayChange ?? 0), 0);
  const prevValue = totalValue - dayChange;

  let realizedGain = 0;
  for (const [ccy, amount] of [...Object.entries(view.realized), ...Object.entries(view.dividends)]) {
    const [whole, v] = normalizeCurrency(ccy, amount);
    if (fx[whole] != null) realizedGain += v * fx[whole];
  }

  const yieldBase = positions.filter((p) => p.value != null && !isCash(p.holding));
  const invested = yieldBase.reduce((s, p) => s + p.value!, 0);
  const weightedDividendYield =
    invested > 0 ? yieldBase.reduce((s, p) => s + (p.quote?.dividendYield ?? 0) * p.value!, 0) / invested : undefined;

  return {
    positions,
    totalValue,
    cashValue,
    totalCost,
    totalGain,
    totalGainPercent: totalCost > 0 ? (totalGain / totalCost) * 100 : undefined,
    realizedGain,
    dayChange,
    dayChangePercent: prevValue > 0 ? (dayChange / prevValue) * 100 : undefined,
    weightedDividendYield,
    missing,
  };
}

/** Converts the pre-trade-tracking format ({ holdings: [{ shares, avgCost, note }] }) into opening buys. */
export function migratePortfolio(raw: Portfolio & { holdings?: { symbol: string; name: string; quoteType: QuoteType; shares: number; avgCost?: number; note?: string; currency?: string }[] }, today: string): Portfolio {
  if (Array.isArray(raw.transactions)) return { ...raw, notes: raw.notes ?? {} };
  const notes: Record<string, string> = {};
  const transactions: Transaction[] = (raw.holdings ?? []).map((h, i) => {
    if (h.note) notes[h.symbol] = h.note;
    return {
      id: `import-${raw.id}-${i}`, type: "buy", date: today, symbol: h.symbol, name: h.name, quoteType: h.quoteType,
      currency: h.currency ?? "", shares: h.shares, price: h.avgCost, createdAt: i,
    };
  });
  const { holdings: _drop, ...rest } = raw;
  return { ...rest, transactions, notes };
}

export interface Slice {
  key: string;
  label: string;
  name: string;
  value: number;
  weight: number;
  /** Which portfolio positions contribute to this slice (for tooltips). */
  sources: { symbol: string; value: number }[];
  kind: "direct" | "fund" | "fund-rest";
}

/**
 * Allocation slices for the chart. With `lookThrough`, each fund is split into its
 * underlying holdings (merged with any direct position in the same stock); the part of
 * the fund not covered by the reported holdings becomes a "<fund> · other holdings" slice.
 */
export function allocation(
  positions: Position[],
  fundHoldings: Record<string, FundHoldings | undefined>,
  lookThrough: boolean,
): Slice[] {
  const slices = new Map<string, Slice>();
  const add = (key: string, label: string, name: string, kind: Slice["kind"], source: string, value: number) => {
    if (value <= 0) return;
    const s = slices.get(key) ?? { key, label, name, value: 0, weight: 0, sources: [], kind };
    s.value += value;
    s.sources.push({ symbol: source, value });
    if (kind === "direct") s.kind = "direct";
    slices.set(key, s);
  };

  for (const p of positions) {
    if (p.value == null) continue;
    const { symbol, name, quoteType } = p.holding;
    const fh = fundHoldings[symbol];
    if (!lookThrough || !isFund(quoteType) || !fh || fh.holdings.length === 0) {
      add(symbol, quoteType === "CASH" ? name : symbol, name, isFund(quoteType) ? "fund" : "direct", symbol, p.value);
      continue;
    }
    for (const h of fh.holdings) add(h.symbol, h.symbol, h.name, "fund", symbol, p.value * h.weight);
    const rest = Math.max(0, 1 - fh.coveredWeight);
    add(`${symbol}::rest`, `${symbol} · other`, `${name} — remaining holdings`, "fund-rest", symbol, p.value * rest);
  }

  const total = [...slices.values()].reduce((s, x) => s + x.value, 0);
  const list = [...slices.values()];
  for (const s of list) s.weight = total > 0 ? s.value / total : 0;
  return list.sort((a, b) => b.value - a.value);
}
