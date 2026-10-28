import { describe, expect, it } from "vitest";
import type { Quote } from "../../shared/types";
import type { Transaction } from "./ledger";
import { allocation, buildView, migratePortfolio, summarize, type Portfolio } from "./portfolio";

const q = (symbol: string, price: number, currency = "USD", extra: Partial<Quote> = {}): Quote => ({
  symbol, name: symbol, quoteType: "EQUITY", currency, exchange: "", price, ...extra,
});
let n = 0;
const buy = (symbol: string, shares: number, price: number | undefined, currency = "USD", extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, type: "buy", date: "2024-01-01", symbol, name: symbol, quoteType: "EQUITY", currency, shares, price, createdAt: n, ...extra,
});
const portfolio = (name: string, transactions: Transaction[], notes: Record<string, string> = {}): Portfolio => ({
  id: name, name, baseCurrency: "USD", transactions, notes,
});

const main = portfolio("Main", [
  buy("AAPL", 10, 100),
  buy("SPY", 2, undefined, "USD", { quoteType: "ETF" }),
  buy("VOD.L", 100, 50, "GBp"),
  { id: "d1", type: "deposit", date: "2024-01-01", currency: "EUR", amount: 100, createdAt: 99 },
]);
const quotes = {
  AAPL: q("AAPL", 200, "USD", { change: 2, dividendYield: 0.5 }),
  SPY: q("SPY", 500, "USD", { quoteType: "ETF" }),
  "VOD.L": q("VOD.L", 80, "GBp"),
};
const fx = { USD: 1, GBP: 1.25, EUR: 1.1 };

describe("summarize", () => {
  const s = summarize(buildView([main]), quotes, fx);
  const value = (sym: string) => s.positions.find((p) => p.holding.symbol === sym)!.value;

  it("values positions and cash in the base currency, converting pence to pounds", () => {
    expect(value("AAPL")).toBe(2000);
    expect(value("SPY")).toBe(1000);
    expect(value("VOD.L")).toBe(100);
    expect(value("CASH:EUR")).toBeCloseTo(110);
    expect(s.totalValue).toBeCloseTo(3210);
    expect(s.cashValue).toBeCloseTo(110);
  });

  it("computes unrealized gains only for positions with a cost basis", () => {
    expect(s.totalCost).toBe(1000 + 62.5);
    expect(s.totalGain).toBeCloseTo(1000 + 37.5);
  });

  it("computes day change", () => {
    expect(s.dayChange).toBe(20);
  });

  it("reports holdings with no quote or FX rate", () => {
    expect(summarize(buildView([main]), quotes, { USD: 1, EUR: 1 }).missing).toEqual(["VOD.L"]);
  });

  it("includes realized gains and dividends", () => {
    const p = portfolio("P", [
      buy("AAPL", 10, 100),
      { id: "s", type: "sell", date: "2024-02-01", symbol: "AAPL", currency: "USD", shares: 10, price: 150, createdAt: 100 },
      { id: "dv", type: "dividend", date: "2024-02-01", symbol: "AAPL", currency: "USD", amount: 7, createdAt: 101 },
    ]);
    const sum = summarize(buildView([p]), quotes, fx);
    expect(sum.positions).toHaveLength(0);
    expect(sum.realizedGain).toBe(507);
  });
});

describe("buildView", () => {
  it("combines portfolios, merging shares, cost and notes", () => {
    const other = portfolio("Other", [buy("AAPL", 10, 200)], { AAPL: "hold" });
    const view = buildView([main, other]);
    const aapl = view.holdings.find((h) => h.symbol === "AAPL")!;
    expect(aapl.shares).toBe(20);
    expect(aapl.avgCost).toBe(150);
    expect(aapl.portfolios).toEqual(["Main", "Other"]);
    expect(aapl.note).toBe("hold");
  });
});

describe("migratePortfolio", () => {
  it("turns old-style holdings into opening buys and keeps notes", () => {
    const old = { id: "x", name: "Old", baseCurrency: "EUR", holdings: [{ symbol: "AAPL", name: "Apple", quoteType: "EQUITY" as const, shares: 3, avgCost: 120, note: "sell at 300" }] };
    const p = migratePortfolio(old as never, "2026-10-28");
    expect(p.transactions).toMatchObject([{ type: "buy", date: "2026-10-28", symbol: "AAPL", shares: 3, price: 120 }]);
    expect(p.notes).toEqual({ AAPL: "sell at 300" });
    expect("holdings" in p).toBe(false);
  });
});

describe("allocation", () => {
  const { positions } = summarize(buildView([main]), quotes, fx);
  const funds = {
    SPY: { symbol: "SPY", coveredWeight: 0.3, holdings: [{ symbol: "AAPL", name: "Apple", weight: 0.1 }, { symbol: "MSFT", name: "Microsoft", weight: 0.2 }] },
  };

  it("shows funds as one slice when look-through is off", () => {
    const slices = allocation(positions, funds, false);
    expect(slices.map((x) => x.key)).toEqual(["AAPL", "SPY", "CASH:EUR", "VOD.L"]);
  });

  it("splits funds into their holdings and merges overlaps when look-through is on", () => {
    const slices = allocation(positions, funds, true);
    const byKey = Object.fromEntries(slices.map((x) => [x.key, x.value]));
    expect(byKey.AAPL).toBe(2100);
    expect(byKey.MSFT).toBe(200);
    expect(byKey["SPY::rest"]).toBe(700);
    expect(slices.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1);
  });
});
