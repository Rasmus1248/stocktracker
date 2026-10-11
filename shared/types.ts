export type QuoteType = "EQUITY" | "ETF" | "MUTUALFUND" | "INDEX" | "CRYPTOCURRENCY" | "CURRENCY" | "FUTURE" | "OTHER";

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  quoteType: QuoteType;
  sector?: string;
}

/** Price plus the key metrics we show for a security. Fields are optional because coverage varies by security type. */
export interface Quote {
  symbol: string;
  name: string;
  quoteType: QuoteType;
  currency: string;
  exchange: string;
  price: number;
  change?: number;
  changePercent?: number;
  previousClose?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  eps?: number;
  dividendYield?: number; // percent, e.g. 0.52 means 0.52%
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  priceToBook?: number;
  volume?: number;
  averageVolume?: number;
  ytdReturn?: number; // percent, funds only
  expenseRatio?: number; // percent, funds only
}

export interface FundHolding {
  symbol: string;
  name: string;
  /** Weight inside the fund, 0..1 */
  weight: number;
}

export interface FundHoldings {
  symbol: string;
  holdings: FundHolding[];
  /** Sum of the weights that Yahoo reports (usually the top 10 only). */
  coveredWeight: number;
}

export interface ScreenerList {
  id: string;
  title: string;
  quotes: Quote[];
}

export interface Meta {
  source: "yahoo" | "demo";
}
