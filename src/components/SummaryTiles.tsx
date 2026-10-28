import { money, pct, signedMoney, trend } from "../lib/format";
import type { PortfolioSummary } from "../lib/portfolio";

export function SummaryTiles({ s, currency }: { s: PortfolioSummary; currency: string }) {
  const tiles = [
    { label: "Total value", value: money(s.totalValue, currency), sub: s.cashValue ? `incl. ${money(s.cashValue, currency)} cash` : undefined },
    { label: "Today", value: signedMoney(s.dayChange, currency), sub: pct(s.dayChangePercent, 2, true), t: trend(s.dayChange) },
    {
      label: "Unrealized gain",
      value: s.totalCost > 0 ? signedMoney(s.totalGain, currency) : "—",
      sub: s.totalCost > 0 ? pct(s.totalGainPercent, 2, true) : "Add purchase prices to track",
      t: s.totalCost > 0 ? trend(s.totalGain) : "",
    },
    {
      label: "Realized gain",
      value: signedMoney(s.realizedGain, currency),
      sub: "From sells and dividends, all time",
      t: trend(s.realizedGain),
    },
    { label: "Dividend yield", value: pct(s.weightedDividendYield), sub: "Value-weighted" },
  ];
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <div className="tile-label">{t.label}</div>
          <div className={`tile-value ${t.t ? `delta ${t.t}` : ""}`}>{t.value}</div>
          {t.sub && <div className={`tile-sub ${t.t && t.label !== "Realized gain" ? `delta ${t.t}` : "muted"}`}>{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
