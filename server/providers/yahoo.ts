import YahooFinance from "yahoo-finance2";
import type { FundHoldings, Quote, QuoteType, ScreenerList, SearchResult } from "../../shared/types.js";
import { SCREENERS, type DataProvider, type ScreenerId } from "./provider.js";

const KNOWN_TYPES: QuoteType[] = ["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CRYPTOCURRENCY", "CURRENCY", "FUTURE"];
const toType = (t: unknown): QuoteType => (KNOWN_TYPES.includes(t as QuoteType) ? (t as QuoteType) : "OTHER");

// Yahoo changes its payloads often; we read fields defensively instead of failing on schema drift.
const loose = { validateResult: false } as const;
type Raw = Record<string, any>;

export function mapQuote(q: Raw): Quote {
  return {
    symbol: q.symbol,
    name: q.longName ?? q.shortName ?? q.symbol,
    quoteType: toType(q.quoteType),
    currency: q.currency ?? "USD",
    exchange: q.fullExchangeName ?? q.exchange ?? "",
    price: q.regularMarketPrice ?? q.navPrice ?? 0,
    change: q.regularMarketChange,
    changePercent: q.regularMarketChangePercent,
    previousClose: q.regularMarketPreviousClose,
    marketCap: q.marketCap ?? q.netAssets ?? q.totalAssets,
    trailingPE: q.trailingPE,
    forwardPE: q.forwardPE,
    eps: q.epsTrailingTwelveMonths,
    // `dividendYield` is already in percent; `trailingAnnualDividendYield` is a fraction.
    dividendYield:
      q.dividendYield ?? (q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : undefined),
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    priceToBook: q.priceToBook,
    volume: q.regularMarketVolume,
    averageVolume: q.averageDailyVolume3Month,
    ytdReturn: q.ytdReturn,
    expenseRatio: q.netExpenseRatio,
  };
}

export class YahooProvider implements DataProvider {
  private yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

  async search(query: string): Promise<SearchResult[]> {
    const res = (await this.yf.search(query, { quotesCount: 20, newsCount: 0 }, loose)) as Raw;
    return (res.quotes ?? [])
      .filter((q: Raw) => q.isYahooFinance && q.symbol)
      .map((q: Raw) => ({
        symbol: q.symbol,
        name: q.longname ?? q.shortname ?? q.symbol,
        exchange: q.exchDisp ?? q.exchange ?? "",
        quoteType: toType(q.quoteType),
        sector: q.sector,
      }));
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];
    const res = (await this.yf.quote(symbols, { return: "array" }, loose)) as Raw[];
    return res.filter((q) => q?.symbol).map(mapQuote);
  }

  async fx(from: string[], to: string): Promise<Record<string, number>> {
    const rates: Record<string, number> = { [to]: 1 };
    const needed = from.filter((c) => c !== to);
    if (needed.length === 0) return rates;
    const res = (await this.yf.quote(needed.map((c) => `${c}${to}=X`), { return: "array" }, loose)) as Raw[];
    for (const q of res) {
      const from = String(q.symbol).slice(0, 3);
      if (q.regularMarketPrice) rates[from] = q.regularMarketPrice;
    }
    return rates;
  }

  async fundHoldings(symbol: string): Promise<FundHoldings> {
    const res = (await this.yf.quoteSummary(symbol, { modules: ["topHoldings"] }, loose)) as Raw;
    const holdings = (res.topHoldings?.holdings ?? [])
      .filter((h: Raw) => h.holdingPercent > 0)
      .map((h: Raw) => ({ symbol: h.symbol || h.holdingName, name: h.holdingName || h.symbol, weight: h.holdingPercent }));
    const coveredWeight = holdings.reduce((s: number, h: { weight: number }) => s + h.weight, 0);
    return { symbol, holdings, coveredWeight };
  }

  async screener(id: ScreenerId): Promise<ScreenerList> {
    const res = (await this.yf.screener({ scrIds: id, count: 25 }, undefined, loose)) as Raw;
    return { id, title: SCREENERS[id], quotes: (res.quotes ?? []).map(mapQuote) };
  }
}
