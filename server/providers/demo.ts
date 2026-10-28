import type { FundHoldings, PriceHistory, Quote, QuoteType, ScreenerList, SearchResult } from "../../shared/types.js";
import { SCREENERS, type DataProvider, type ScreenerId } from "./provider.js";

// Offline sample data so the app can be developed and demoed without network access.
// Numbers are illustrative only; they are not live market data.
type Row = [symbol: string, name: string, type: QuoteType, currency: string, exchange: string, price: number, chg: number, cap?: number, pe?: number, eps?: number, div?: number, sector?: string];

const ROWS: Row[] = [
  ["AAPL", "Apple Inc.", "EQUITY", "USD", "NasdaqGS", 228.5, 0.82, 3.45e12, 34.6, 6.6, 0.44, "Technology"],
  ["MSFT", "Microsoft Corporation", "EQUITY", "USD", "NasdaqGS", 431.2, -0.41, 3.2e12, 35.8, 12.05, 0.77, "Technology"],
  ["NVDA", "NVIDIA Corporation", "EQUITY", "USD", "NasdaqGS", 134.8, 2.15, 3.3e12, 52.4, 2.57, 0.03, "Technology"],
  ["AMZN", "Amazon.com, Inc.", "EQUITY", "USD", "NasdaqGS", 186.4, 1.02, 1.96e12, 44.1, 4.23, undefined, "Consumer Cyclical"],
  ["GOOGL", "Alphabet Inc.", "EQUITY", "USD", "NasdaqGS", 163.1, -0.25, 2.0e12, 23.4, 6.97, 0.49, "Communication Services"],
  ["META", "Meta Platforms, Inc.", "EQUITY", "USD", "NasdaqGS", 589.9, 0.66, 1.49e12, 30.1, 19.6, 0.34, "Communication Services"],
  ["TSLA", "Tesla, Inc.", "EQUITY", "USD", "NasdaqGS", 241.0, -3.12, 7.7e11, 67.3, 3.58, undefined, "Consumer Cyclical"],
  ["AVGO", "Broadcom Inc.", "EQUITY", "USD", "NasdaqGS", 172.3, 1.45, 8.0e11, 145.0, 1.19, 1.23, "Technology"],
  ["BRK-B", "Berkshire Hathaway Inc.", "EQUITY", "USD", "NYSE", 455.6, 0.12, 9.8e11, 13.2, 34.5, undefined, "Financial Services"],
  ["JPM", "JPMorgan Chase & Co.", "EQUITY", "USD", "NYSE", 214.9, 0.53, 6.1e11, 12.0, 17.9, 2.33, "Financial Services"],
  ["V", "Visa Inc.", "EQUITY", "USD", "NYSE", 281.7, 0.21, 5.5e11, 29.0, 9.71, 0.79, "Financial Services"],
  ["LLY", "Eli Lilly and Company", "EQUITY", "USD", "NYSE", 905.1, -1.08, 8.6e11, 98.0, 9.23, 0.57, "Healthcare"],
  ["XOM", "Exxon Mobil Corporation", "EQUITY", "USD", "NYSE", 121.4, -0.77, 5.3e11, 14.9, 8.15, 3.13, "Energy"],
  ["KO", "The Coca-Cola Company", "EQUITY", "USD", "NYSE", 70.1, 0.05, 3.0e11, 28.2, 2.48, 2.77, "Consumer Defensive"],
  ["ASML", "ASML Holding N.V.", "EQUITY", "EUR", "Amsterdam", 742.0, 1.88, 2.9e11, 38.7, 19.2, 0.82, "Technology"],
  ["SAP.DE", "SAP SE", "EQUITY", "EUR", "XETRA", 210.5, 0.34, 2.5e11, 92.0, 2.29, 1.05, "Technology"],
  ["NOVO-B.CO", "Novo Nordisk A/S", "EQUITY", "DKK", "Copenhagen", 815.0, -0.9, 3.6e12, 37.5, 21.7, 1.17, "Healthcare"],
  ["SPY", "SPDR S&P 500 ETF Trust", "ETF", "USD", "NYSEArca", 573.8, 0.48, 5.6e11, 27.5, undefined, 1.21],
  ["QQQ", "Invesco QQQ Trust", "ETF", "USD", "NasdaqGM", 493.4, 0.71, 3.0e11, 33.9, undefined, 0.57],
  ["VWCE.DE", "Vanguard FTSE All-World UCITS ETF (Acc)", "ETF", "EUR", "XETRA", 124.6, 0.29, 1.8e10, undefined, undefined, undefined],
];

const FUNDS: Record<string, [string, string, number][]> = {
  SPY: [["AAPL", "Apple Inc", 0.071], ["MSFT", "Microsoft Corp", 0.066], ["NVDA", "NVIDIA Corp", 0.061], ["AMZN", "Amazon.com Inc", 0.036], ["META", "Meta Platforms Inc", 0.025], ["GOOGL", "Alphabet Inc Class A", 0.02], ["BRK-B", "Berkshire Hathaway Inc", 0.017], ["AVGO", "Broadcom Inc", 0.017], ["GOOG", "Alphabet Inc Class C", 0.016], ["TSLA", "Tesla Inc", 0.014]],
  QQQ: [["AAPL", "Apple Inc", 0.088], ["MSFT", "Microsoft Corp", 0.081], ["NVDA", "NVIDIA Corp", 0.078], ["AMZN", "Amazon.com Inc", 0.054], ["META", "Meta Platforms Inc", 0.051], ["AVGO", "Broadcom Inc", 0.05], ["GOOGL", "Alphabet Inc Class A", 0.026], ["GOOG", "Alphabet Inc Class C", 0.025], ["TSLA", "Tesla Inc", 0.025], ["COST", "Costco Wholesale Corp", 0.025]],
  "VWCE.DE": [["AAPL", "Apple Inc", 0.043], ["MSFT", "Microsoft Corp", 0.04], ["NVDA", "NVIDIA Corp", 0.039], ["AMZN", "Amazon.com Inc", 0.022], ["META", "Meta Platforms Inc", 0.015], ["GOOGL", "Alphabet Inc Class A", 0.012], ["AVGO", "Broadcom Inc", 0.011], ["GOOG", "Alphabet Inc Class C", 0.01], ["TSLA", "Tesla Inc", 0.009], ["2330.TW", "Taiwan Semiconductor", 0.009]],
};

const FX_TO_USD: Record<string, number> = { USD: 1, EUR: 1.09, GBP: 1.31, DKK: 0.146, SEK: 0.096, CHF: 1.16, JPY: 0.0067 };

function toQuote(r: Row): Quote {
  const [symbol, name, quoteType, currency, exchange, price, changePercent, marketCap, trailingPE, eps, dividendYield] = r;
  const previousClose = price / (1 + changePercent / 100);
  return {
    symbol, name, quoteType, currency, exchange, price, changePercent, marketCap, trailingPE, eps, dividendYield,
    previousClose,
    change: price - previousClose,
    fiftyTwoWeekLow: +(price * 0.72).toFixed(2),
    fiftyTwoWeekHigh: +(price * 1.12).toFixed(2),
    forwardPE: trailingPE ? +(trailingPE * 0.85).toFixed(1) : undefined,
    expenseRatio: quoteType === "ETF" ? 0.2 : undefined,
  };
}

export class DemoProvider implements DataProvider {
  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toLowerCase();
    return ROWS.filter(([s, n]) => s.toLowerCase().includes(q) || n.toLowerCase().includes(q)).map(
      ([symbol, name, quoteType, , exchange, , , , , , , sector]) => ({ symbol, name, quoteType, exchange, sector }),
    );
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    return ROWS.filter((r) => symbols.includes(r[0])).map(toQuote);
  }

  async fx(from: string[], to: string): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};
    for (const c of [...from, to]) if (FX_TO_USD[c] && FX_TO_USD[to]) rates[c] = FX_TO_USD[c] / FX_TO_USD[to];
    return rates;
  }

  async fundHoldings(symbol: string): Promise<FundHoldings> {
    const holdings = (FUNDS[symbol] ?? []).map(([s, name, weight]) => ({ symbol: s, name, weight }));
    return { symbol, holdings, coveredWeight: holdings.reduce((s, h) => s + h.weight, 0) };
  }

  /** A deterministic random walk that ends at today's demo price. */
  async history(symbol: string, from: string): Promise<PriceHistory> {
    const fx = symbol.match(/^([A-Z]{3})([A-Z]{3})=X$/);
    const row = ROWS.find((r) => r[0] === symbol);
    const last = fx ? (FX_TO_USD[fx[1]] ?? 1) / (FX_TO_USD[fx[2]] ?? 1) : row?.[5];
    if (last == null) throw Object.assign(new Error(`No history for ${symbol}`), { status: 404 });
    const days: string[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(); d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() % 6 !== 0) days.push(d.toISOString().slice(0, 10));
    }
    let seed = [...symbol].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    let price = last;
    const points: [string, number][] = [];
    for (let i = days.length - 1; i >= 0; i--) {
      points.push([days[i], +price.toFixed(4)]);
      price /= 1 + (fx ? 0.003 : 0.018) * (rand() - 0.47); // gentle upward drift going forward
    }
    return { symbol, currency: fx ? fx[2] : row![3], points: points.reverse() };
  }

  async screener(id: ScreenerId): Promise<ScreenerList> {
    const quotes = ROWS.filter((r) => r[2] === "EQUITY").map(toQuote);
    if (id === "day_gainers") quotes.sort((a, b) => b.changePercent! - a.changePercent!);
    else if (id === "day_losers") quotes.sort((a, b) => a.changePercent! - b.changePercent!);
    else quotes.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    return { id, title: SCREENERS[id], quotes: quotes.slice(0, 10) };
  }
}
