import { describe, expect, it } from "vitest";
import type { Transaction } from "./ledger";
import { closeOn, historyNeeds, makeLookup, yearlyPerformance } from "./performance";
import type { Portfolio } from "./portfolio";

let n = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, "type" | "date">): Transaction => ({ id: `t${++n}`, currency: "USD", createdAt: n, ...t });
const portfolio = (transactions: Transaction[]): Portfolio => ({ id: "p", name: "P", baseCurrency: "USD", transactions, notes: {} });

const history = {
  AAPL: { symbol: "AAPL", currency: "USD", points: [["2022-12-30", 100], ["2023-06-01", 110], ["2023-12-29", 150], ["2024-03-01", 160], ["2024-12-31", 200]] as [string, number][] },
  MSFT: { symbol: "MSFT", currency: "USD", points: [["2023-01-03", 50], ["2023-12-29", 80], ["2024-12-31", 90]] as [string, number][] },
};

describe("closeOn", () => {
  it("returns the last close on or before a date", () => {
    expect(closeOn(history.AAPL.points, "2023-12-31")).toBe(150);
    expect(closeOn(history.AAPL.points, "2023-06-01")).toBe(110);
    expect(closeOn(history.AAPL.points, "2022-01-01")).toBeUndefined();
  });
});

describe("yearlyPerformance", () => {
  const p = portfolio([
    tx({ type: "buy", date: "2023-06-01", symbol: "AAPL", shares: 10, price: 110 }),
    tx({ type: "buy", date: "2023-01-03", symbol: "MSFT", shares: 10, price: 50 }),
    // Sold MSFT entirely in 2024: its gain must still count that year.
    tx({ type: "sell", date: "2024-03-01", symbol: "MSFT", shares: 10, price: 85 }),
  ]);
  const lookup = makeLookup(history, "USD");

  it("includes positions that were sold during the year", () => {
    const rows = yearlyPerformance([p], "USD", lookup, "2025-02-01", 10 * 210);
    const y2024 = rows.find((r) => r.year === 2024)!;
    // Start: 10×150 + 10×80 = 2300. End: 10×200. Flows: −850 (MSFT proceeds paid out).
    expect(y2024.startValue).toBe(2300);
    expect(y2024.endValue).toBe(2000);
    expect(y2024.netFlows).toBe(-850);
    expect(y2024.gain).toBe(550);
    expect(y2024.realized).toBe(350);

    const y2023 = rows.find((r) => r.year === 2023)!;
    expect(y2023.gain).toBe(10 * 150 + 10 * 80 - 1100 - 500);

    const y2025 = rows.find((r) => r.year === 2025)!;
    expect(y2025.gain).toBe(100);
    expect(rows.map((r) => r.year)).toEqual([2025, 2024, 2023]);
  });

  it("marks a year incomplete when a price is missing", () => {
    const rows = yearlyPerformance([p], "USD", makeLookup({}, "USD"), "2025-02-01", 2100);
    expect(rows.find((r) => r.year === 2024)!.complete).toBe(false);
  });

  it("knows which histories to fetch", () => {
    expect(historyNeeds([p], "USD", "2025-02-01")).toEqual({ from: "2022-12-15", symbols: ["AAPL", "MSFT"] });
    expect(historyNeeds([portfolio([tx({ type: "deposit", date: "2025-01-01", amount: 5 })])], "USD", "2025-02-01")).toBeNull();
  });
});
