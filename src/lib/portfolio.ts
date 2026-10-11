import type { FundHoldings, Quote, QuoteType } from "../../shared/types";

export interface Holding {
  symbol: string;
  name: string;
  quoteType: QuoteType;
  shares: number;
  /** Average purchase price per share, in the security's own currency. */
  avgCost?: number;
  /** Free-text reminder, e.g. "sell at 250" or "hold until 300". */
  note?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  baseCurrency: string;
  holdings: Holding[];
}

export const isFund = (t: QuoteType) => t === "ETF" || t === "MUTUALFUND";

/** Yahoo quotes London listings in pence (GBp/GBX); normalise to whole currency units. */
export function normalizeCurrency(currency: string, amount: number): [string, number] {
  if (currency === "GBp" || currency === "GBX") return ["GBP", amount / 100];
  if (currency === "ZAc") return ["ZAR", amount / 100];
  if (currency === "ILA") return ["ILS", amount / 100];
  return [currency.toUpperCase(), amount];
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
  totalCost: number;
  totalGain: number;
  totalGainPercent?: number;
  dayChange: number;
  dayChangePercent?: number;
  weightedDividendYield?: number;
  missing: string[];
}

export function summarize(
  portfolio: Portfolio,
  quotes: Record<string, Quote>,
  fx: Record<string, number>,
): PortfolioSummary {
  const missing: string[] = [];
  const positions: Position[] = portfolio.holdings.map((holding) => {
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
      // avgCost is entered in display units (e.g. pence for GBp listings), same as the quoted price.
      pos.cost = holding.shares * normalizeCurrency(quote.currency, holding.avgCost)[1] * rate;
      pos.gain = value - pos.cost;
      pos.gainPercent = (pos.gain / pos.cost) * 100;
    }
    if (quote.change != null) pos.dayChange = holding.shares * normalizeCurrency(quote.currency, quote.change)[1] * rate;
    return pos;
  });

  const totalValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  for (const p of positions) if (p.value != null && totalValue > 0) p.weight = p.value / totalValue;

  const withCost = positions.filter((p) => p.cost != null);
  const totalCost = withCost.reduce((s, p) => s + p.cost!, 0);
  const totalGain = withCost.reduce((s, p) => s + p.gain!, 0);
  const dayChange = positions.reduce((s, p) => s + (p.dayChange ?? 0), 0);
  const prevValue = totalValue - dayChange;

  const yieldBase = positions.filter((p) => p.value != null);
  const weightedDividendYield =
    totalValue > 0 ? yieldBase.reduce((s, p) => s + (p.quote?.dividendYield ?? 0) * p.value!, 0) / totalValue : undefined;

  return {
    positions,
    totalValue,
    totalCost,
    totalGain,
    totalGainPercent: totalCost > 0 ? (totalGain / totalCost) * 100 : undefined,
    dayChange,
    dayChangePercent: prevValue > 0 ? (dayChange / prevValue) * 100 : undefined,
    weightedDividendYield,
    missing,
  };
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
      add(symbol, symbol, name, isFund(quoteType) ? "fund" : "direct", symbol, p.value);
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
