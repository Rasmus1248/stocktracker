import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { FundHoldings } from "../../shared/types";
import { money, pct } from "../lib/format";
import { allocation, isFund, type Position, type Slice } from "../lib/portfolio";

// Categorical palette: fixed order, never cycled. Anything past slot 7 folds into "Other".
const SLOTS = 7;
const color = (i: number) => (i < SLOTS ? `var(--series-${i + 1})` : "var(--series-other)");

interface Props {
  positions: Position[];
  fundHoldings: Record<string, FundHoldings | undefined>;
  currency: string;
  loadingFunds: boolean;
}

export function AllocationCard({ positions, fundHoldings, currency, loadingFunds }: Props) {
  const [lookThrough, setLookThrough] = useState(false);
  const funds = positions.filter((p) => isFund(p.holding.quoteType));
  const hasFunds = funds.length > 0;
  const slices = useMemo(() => allocation(positions, fundHoldings, hasFunds && lookThrough), [positions, fundHoldings, lookThrough, hasFunds]);

  const chartData = useMemo(() => {
    const top = slices.slice(0, SLOTS);
    const rest = slices.slice(SLOTS);
    if (rest.length === 0) return top;
    const value = rest.reduce((s, x) => s + x.value, 0);
    const other: Slice = {
      key: "__other", label: `Other (${rest.length})`, name: `${rest.length} smaller positions`, kind: "direct",
      value, weight: rest.reduce((s, x) => s + x.weight, 0), sources: [],
    };
    return [...top, other];
  }, [slices]);

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
        {hasFunds && (
          <label className="switch" title="Split ETFs and funds into the stocks they hold">
            <span className={lookThrough ? "muted" : ""}>Funds as one</span>
            <input type="checkbox" role="switch" checked={lookThrough} onChange={(e) => setLookThrough(e.target.checked)} />
            <span className="switch-track" aria-hidden />
            <span className={lookThrough ? "" : "muted"}>Show underlying stocks</span>
          </label>
        )}
      </header>

      {slices.length === 0 ? (
        <p className="muted">Add holdings to see how your portfolio is split.</p>
      ) : (
        <div className="allocation-body">
          <div className="donut">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={chartData.length > 1 ? 1 : 0} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                  {chartData.map((s, i) => (
                    <Cell key={s.key} fill={color(s.key === "__other" ? SLOTS : i)} />
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
              <li key={s.key} title={s.name}>
                <span className="swatch" style={{ background: color(i) }} />
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
