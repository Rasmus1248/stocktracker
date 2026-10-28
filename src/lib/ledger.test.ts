import { describe, expect, it } from "vitest";
import { computeLedger, externalFlow, sharesOn, type Transaction } from "./ledger";

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, "type" | "date">): Transaction => ({
  id: `t${++n}`, currency: "USD", createdAt: n, ...t,
});
const buy = (date: string, shares: number, price: number, extra: Partial<Transaction> = {}) =>
  tx({ type: "buy", date, symbol: "AAPL", shares, price, ...extra });
const sell = (date: string, shares: number, price: number, extra: Partial<Transaction> = {}) =>
  tx({ type: "sell", date, symbol: "AAPL", shares, price, ...extra });

describe("computeLedger", () => {
  it("averages cost across buys, including fees", () => {
    const l = computeLedger([buy("2024-01-01", 10, 100, { fee: 10 }), buy("2024-02-01", 10, 120)]);
    const p = l.positions.get("AAPL")!;
    expect(p.shares).toBe(20);
    expect(p.cost).toBe(2210);
  });

  it("realizes gains on partial sells at average cost and keeps the rest", () => {
    const l = computeLedger([buy("2024-01-01", 10, 100), buy("2024-02-01", 10, 200), sell("2024-03-01", 5, 300, { fee: 5 })]);
    const p = l.positions.get("AAPL")!;
    expect(p.shares).toBe(15);
    expect(p.cost).toBe(2250); // avg 150
    expect(p.realized).toBe(5 * 300 - 5 - 5 * 150);
    expect(l.sales[0].gain).toBe(745);
  });

  it("orders backdated trades by date, not entry order", () => {
    const txs = [sell("2024-06-01", 5, 150), buy("2024-01-01", 10, 100)];
    const l = computeLedger(txs);
    expect(l.issues.size).toBe(0);
    expect(l.positions.get("AAPL")!.realized).toBe(250);
  });

  it("flags selling more than was held on that date", () => {
    const s = sell("2024-01-01", 5, 150);
    const l = computeLedger([s, buy("2024-02-01", 10, 100)]);
    expect(l.issues.get(s.id)).toMatch(/only 0/);
    expect(l.positions.get("AAPL")!.shares).toBe(10);
  });

  it("starts a fresh cost basis after selling out", () => {
    const l = computeLedger([buy("2024-01-01", 10, 100), sell("2024-02-01", 10, 120), buy("2024-03-01", 2, 50)]);
    const p = l.positions.get("AAPL")!;
    expect(p.cost).toBe(100);
    expect(p.realized).toBe(200);
  });

  it("moves cash for cash-settled trades and dividends, converting pence", () => {
    const l = computeLedger([
      tx({ type: "deposit", date: "2024-01-01", currency: "GBP", amount: 1000 }),
      tx({ type: "buy", date: "2024-01-02", symbol: "VOD.L", currency: "GBp", shares: 100, price: 500, fee: 1000, cash: true }),
      tx({ type: "dividend", date: "2024-02-01", symbol: "VOD.L", currency: "GBP", amount: 20, cash: true }),
      tx({ type: "withdrawal", date: "2024-03-01", currency: "GBP", amount: 100 }),
    ]);
    expect(l.cash.GBP).toBeCloseTo(1000 - 510 + 20 - 100);
    expect(l.positions.get("VOD.L")!.dividends.GBP).toBe(20);
  });

  it("can stop at a date", () => {
    const txs = [buy("2024-01-01", 10, 100), sell("2024-06-01", 4, 100)];
    expect(sharesOn(txs, "AAPL", "2024-05-31")).toBe(10);
    expect(sharesOn(txs, "AAPL", "2024-06-01")).toBe(6);
  });

  it("keeps cost unknown for imported holdings without a price", () => {
    const l = computeLedger([tx({ type: "buy", date: "2024-01-01", symbol: "AAPL", shares: 3 })]);
    expect(l.positions.get("AAPL")!.cost).toBeUndefined();
  });
});

describe("externalFlow", () => {
  it("counts only money crossing the portfolio boundary", () => {
    expect(externalFlow(buy("2024-01-01", 2, 10, { fee: 1 }))).toEqual(["USD", 21]);
    expect(externalFlow(sell("2024-01-01", 2, 10, { fee: 1 }))).toEqual(["USD", -19]);
    expect(externalFlow(buy("2024-01-01", 2, 10, { cash: true }))).toBeNull();
    expect(externalFlow(tx({ type: "deposit", date: "2024-01-01", amount: 50 }))).toEqual(["USD", 50]);
  });
});
