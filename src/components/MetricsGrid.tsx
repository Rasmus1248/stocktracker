import type { Quote } from "../../shared/types.ts";
import { compact, money, num, pct } from "../lib/format.ts";
import { isFund } from "../lib/portfolio.ts";

export function RangeBar({ low, high, value }: { low?: number; high?: number; value: number }) {
  if (low == null || high == null || high <= low) return <span>—</span>;
  const pos = Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
  return (
    <span className="range" title={`52-week range ${num(low)} – ${num(high)}`}>
      <span className="range-track">
        <span className="range-dot" style={{ left: `${pos}%` }} />
      </span>
      <span className="range-labels small muted">
        <span>{num(low)}</span>
        <span>{num(high)}</span>
      </span>
    </span>
  );
}

/** Key metrics for a single security. */
export function MetricsGrid({ quote: q }: { quote: Quote }) {
  const fund = isFund(q.quoteType);
  const items: [string, React.ReactNode][] = [
    [fund ? "Net assets" : "Market cap", compact(q.marketCap)],
    ["P/E (TTM)", num(q.trailingPE)],
    ["Forward P/E", num(q.forwardPE)],
    ["EPS (TTM)", money(q.eps, q.currency)],
    ["Dividend yield", pct(q.dividendYield)],
    ["Price / book", num(q.priceToBook)],
    ["Volume", compact(q.volume)],
    ["Avg. volume (3M)", compact(q.averageVolume)],
  ];
  if (fund) items.push(["YTD return", pct(q.ytdReturn)], ["Expense ratio", pct(q.expenseRatio)]);
  return (
    <dl className="metrics">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      <div className="wide">
        <dt>52-week range</dt>
        <dd>
          <RangeBar low={q.fiftyTwoWeekLow} high={q.fiftyTwoWeekHigh} value={q.price} />
        </dd>
      </div>
    </dl>
  );
}
