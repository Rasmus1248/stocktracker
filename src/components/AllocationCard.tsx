import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { FundHoldings } from "../../shared/types";
import { money, pct } from "../lib/format";
import { allocation, isFund, type Position, type Slice } from "../lib/portfolio";

export const SLICE_OPTIONS = [10, 20, 50, 100] as const;
const LIMIT_KEY = "stocktracker.sliceLimit";

// The first 7 slices get the base palette. Larger charts reuse those hues in lighter and darker
// tints so neighbouring slices stay distinguishable; the legend and tooltip carry the exact identity.
const HUES = 7;
const TINTS = ["", "var(--surface) 45%", "var(--text) 30%", "var(--surface) 70%"];
function color(i: number) {
  const base = `var(--series-${(i % HUES) + 1})`;
  const tint = TINTS[Math.floor(i / HUES) % TINTS.length];
  return tint ? `color-mix(in oklab, ${base}, ${tint})` : base;
}
const OTHER_COLOR = "var(--series-other)";

function loadLimit(): number {
  try {
    const n = Number(localStorage.getItem(LIMIT_KEY));
    return (SLICE_OPTIONS as readonly number[]).includes(n) ? n : 10;
  } catch {
    return 10;
  }
}

interface Props {
  positions: Position[];
  fundHoldings: Record<string, FundHoldings | undefined>;
  currency: string;
  loadingFunds: boolean;
}

export function AllocationCard({ positions, fundHoldings, currency, loadingFunds }: Props) {
  const [lookThrough, setLookThrough] = useState(false);
  const [limit, setLimitState] = useState(loadLimit);
  const [hovered, setHovered] = useState<string | null>(null);
  const setLimit = (n: number) => {
    setLimitState(n);
    try {
      localStorage.setItem(LIMIT_KEY, String(n));
    } catch {
      /* not persisted */
    }
  };
  const funds = positions.filter((p) => isFund(p.holding.quoteType));
  const hasFunds = funds.length > 0;
  const slices = useMemo(() => allocation(positions, fundHoldings, hasFunds && lookThrough), [positions, fundHoldings, lookThrough, hasFunds]);

  const chartData = useMemo(() => {
    const top = slices.slice(0, limit);
    const rest = slices.slice(limit);
    if (rest.length === 0) return top;
    const value = rest.reduce((s, x) => s + x.value, 0);
    const other: Slice = {
      key: "__other", label: `Other (${rest.length})`, name: `${rest.length} smaller positions`, kind: "direct",
      value, weight: rest.reduce((s, x) => s + x.weight, 0), sources: [],
    };
    return [...top, other];
  }, [slices, limit]);
  const many = chartData.length > 20;

  const coverageNote = lookThrough && hasFunds
    ? funds
        .map((f) => {
          const fh = fundHoldings[f.holding.symbol];
          if (!fh) return null;
          if (fh.holdings.length === 0) return `${f.holding.symbol}: holdings not available, shown as one slice`;
          return `${f.holding.symbol}: top ${fh.holdings.length} holdings cover ${pct(fh.coveredWeight * 100, 1)}`;
        })
        .filter(Boolean)
    : [];

  return (
    <section className="card allocation">
      <header className="card-head">
        <h2>Allocation</h2>
        <div className="row wrap">
        <div className="segmented" role="group" aria-label="Number of positions shown in the chart">
          <span className="muted small">Show top</span>
          {SLICE_OPTIONS.map((n) => (
            <button key={n} className={limit === n ? "active" : ""} aria-pressed={limit === n} onClick={() => setLimit(n)}>
              {n}
            </button>
          ))}
        </div>
        {hasFunds && (
          <label className="switch" title="Split ETFs and funds into the stocks they hold">
            <span className={lookThrough ? "muted" : ""}>Funds as one</span>
            <input type="checkbox" role="switch" checked={lookThrough} onChange={(e) => setLookThrough(e.target.checked)} />
            <span className="switch-track" aria-hidden />
            <span className={lookThrough ? "" : "muted"}>Show underlying stocks</span>
          </label>
        )}
        </div>
      </header>

      {slices.length === 0 ? (
        <p className="muted">Add holdings to see how your portfolio is split.</p>
      ) : (
        <div className="allocation-body">
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={chartData.length > 1 && !many ? 1 : 0} stroke="var(--surface)" strokeWidth={many ? 1 : 2} isAnimationActive={false}
                  onMouseEnter={(_, i) => setHovered(chartData[i]?.key ?? null)} onMouseLeave={() => setHovered(null)}>
                  {chartData.map((s, i) => (
                    <Cell key={s.key} fill={s.key === "__other" ? OTHER_COLOR : color(i)} opacity={hovered && hovered !== s.key ? 0.3 : 1} />
                  ))}
                </Pie>
                <Tooltip content={<SliceTooltip currency={currency} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <div className="small muted">{slices.length} {slices.length === 1 ? "position" : "positions"}</div>
              <div className="donut-total">{money(slices.reduce((s, x) => s + x.value, 0), currency, true)}</div>
            </div>
          </div>

          <ol className="legend">
            {slices.map((s, i) => (
              <li
                key={s.key}
                title={s.name}
                className={hovered === s.key || (hovered === "__other" && i >= limit) ? "hl" : ""}
                onMouseEnter={() => setHovered(i < limit ? s.key : "__other")}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="swatch" style={{ background: i < limit ? color(i) : OTHER_COLOR }} />
                <span className="sym">{s.label}</span>
                <span className="name">{s.name}</span>
                <span className="bar"><span style={{ width: `${(s.weight / slices[0].weight) * 100}%` }} /></span>
                <span className="num">{pct(s.weight * 100, 1)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {loadingFunds && lookThrough && <p className="muted small">Loading fund holdings…</p>}
      {coverageNote.length > 0 && (
        <p className="muted small">
          Fund breakdowns use the top holdings each fund reports; the rest of each fund is grouped as “other”. {coverageNote.join(" · ")}
        </p>
      )}
    </section>
  );
}

function SliceTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: Slice }[]; currency: string }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="tooltip">
      <div><strong>{s.label}</strong> · {pct(s.weight * 100, 2)}</div>
      <div className="muted small">{s.name}</div>
      <div>{money(s.value, currency)}</div>
      {s.sources.length > 1 || (s.sources[0] && s.sources[0].symbol !== s.key) ? (
        <ul className="small">
          {s.sources.map((src, i) => (
            <li key={i}>{src.symbol === s.key ? "Held directly" : `via ${src.symbol}`}: {money(src.value, currency)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
