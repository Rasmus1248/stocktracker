import type { FundHoldings, PriceHistory, Quote, ScreenerList, SearchResult } from "../../shared/types.js";

export const SCREENERS = {
  most_actives: "Most active",
  day_gainers: "Top gainers",
  day_losers: "Top losers",
} as const;
export type ScreenerId = keyof typeof SCREENERS;

export interface DataProvider {
  search(query: string): Promise<SearchResult[]>;
  quotes(symbols: string[]): Promise<Quote[]>;
  /** Exchange rates: value of 1 unit of each `from` currency expressed in `to`. */
  fx(from: string[], to: string): Promise<Record<string, number>>;
  fundHoldings(symbol: string): Promise<FundHoldings>;
  screener(id: ScreenerId): Promise<ScreenerList>;
  /** Daily closes from `from` (YYYY-MM-DD) until today. Also works for FX pairs such as EURUSD=X. */
  history(symbol: string, from: string): Promise<PriceHistory>;
}
