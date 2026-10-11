import { describe, expect, it } from "vitest";
import type { Quote } from "../../shared/types.ts";
import { allocation, summarize, type Portfolio } from "./portfolio.ts";

const q = (symbol: string, price: number, currency = "USD", extra: Partial<Quote> = {}): Quote => ({
  symbol, name: symbol, quoteType: "EQUITY", currency, exchange: "", price, ...extra,
});

const portfolio: Portfolio = {
  id: "p", name: "Test", baseCurrency: "USD",
  holdings: [
    { symbol: "AAPL", name: "Apple", quoteType: "EQUITY", shares: 10, avgCost: 100 },
    { symbol: "SPY", name: "S&P 500", quoteType: "ETF", shares: 2 },
    { symbol: "VOD.L", name: "Vodafone", quoteType: "EQUITY", shares: 100, avgCost: 50 },
  ],
};
const quotes = {
  AAPL: q("AAPL", 200, "USD", { change: 2, dividendYield: 0.5 }),
  SPY: q("SPY", 500, "USD", { quoteType: "ETF" }),
  "VOD.L": q("VOD.L", 80, "GBp"),
};
const fx = { USD: 1, GBP: 1.25 };

describe("summarize", () => {
  const s = summarize(portfolio, quotes, fx);

  it("values positions in the base currency, converting pence to pounds", () => {
    expect(s.positions.map((p) => p.value)).toEqual([2000, 1000, 100]);
    expect(s.totalValue).toBe(3100);
  });

  it("computes gains only for positions with a cost basis", () => {
    expect(s.totalCost).toBe(1000 + 62.5);
    expect(s.totalGain).toBeCloseTo(1000 + 37.5);
    expect(s.positions[2].gainPercent).toBeCloseTo(60);
  });

  it("computes weights and day change", () => {
    expect(s.positions[0].weight).toBeCloseTo(2000 / 3100);
    expect(s.dayChange).toBe(20);
  });

  it("reports holdings with no quote or FX rate", () => {
    expect(summarize(portfolio, quotes, { USD: 1 }).missing).toEqual(["VOD.L"]);
  });
});

describe("allocation", () => {
  const { positions } = summarize(portfolio, quotes, fx);
  const funds = {
    SPY: { symbol: "SPY", coveredWeight: 0.3, holdings: [{ symbol: "AAPL", name: "Apple", weight: 0.1 }, { symbol: "MSFT", name: "Microsoft", weight: 0.2 }] },
  };

  it("shows funds as one slice when look-through is off", () => {
    const slices = allocation(positions, funds, false);
    expect(slices.map((x) => [x.key, x.value])).toEqual([["AAPL", 2000], ["SPY", 1000], ["VOD.L", 100]]);
  });

  it("splits funds into their holdings and merges overlaps when look-through is on", () => {
    const slices = allocation(positions, funds, true);
    const byKey = Object.fromEntries(slices.map((x) => [x.key, x.value]));
    expect(byKey).toEqual({ AAPL: 2100, MSFT: 200, "SPY::rest": 700, "VOD.L": 100 });
    expect(slices.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
    expect(slices.find((x) => x.key === "AAPL")!.kind).toBe("direct");
  });
});
