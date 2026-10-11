import { money, pct, signedMoney, trend } from "../lib/format";
import type { PortfolioSummary } from "../lib/portfolio";

export function SummaryTiles({ s, currency }: { s: PortfolioSummary; currency: string }) {
  const tiles = [
    { label: "Total value", value: money(s.totalValue, currency) },
    { label: "Today", value: signedMoney(s.dayChange, currency), sub: pct(s.dayChangePercent, 2, true), t: trend(s.dayChange) },
    {
      label: "Total gain / loss",
      value: s.totalCost > 0 ? signedMoney(s.totalGain, currency) : "—",
      sub: s.totalCost > 0 ? pct(s.totalGainPercent, 2, true) : "Add cost basis to track",
      t: s.totalCost > 0 ? trend(s.totalGain) : "",
    },
    { label: "Dividend yield", value: pct(s.weightedDividendYield), sub: "Value-weighted" },
    { label: "Holdings", value: String(s.positions.length) },
  ];
  return (
    <div className="tiles">
      {tiles.map((t) => (
        <div className="tile" key={t.label}>
          <div className="tile-label">{t.label}</div>
          <div className={`tile-value ${t.t ? `delta ${t.t}` : ""}`}>{t.value}</div>
          {t.sub && <div className={`tile-sub ${t.t ? `delta ${t.t}` : "muted"}`}>{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
