import { useState } from "react";
import { compact, money, num, pct, signedMoney, TYPE_LABEL, trend } from "../lib/format.ts";
import type { Holding, Position } from "../lib/portfolio.ts";
import { RangeBar } from "./MetricsGrid.tsx";

type SortKey = "symbol" | "value" | "weight" | "day" | "gain" | "pe" | "cap" | "div";

const sorters: Record<SortKey, (p: Position) => number | string | undefined> = {
  symbol: (p) => p.holding.symbol,
  value: (p) => p.value,
  weight: (p) => p.weight,
  day: (p) => p.quote?.changePercent,
  gain: (p) => p.gainPercent,
  pe: (p) => p.quote?.trailingPE,
  cap: (p) => p.quote?.marketCap,
  div: (p) => p.quote?.dividendYield,
};

interface Props {
  positions: Position[];
  currency: string;
  onEdit: (h: Holding) => void;
  onRemove: (h: Holding) => void;
  onOpen: (h: Holding) => void;
}

export function HoldingsTable({ positions, currency, onEdit, onRemove, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "value", desc: true });
  const rows = [...positions].sort((a, b) => {
    const x = sorters[sort.key](a), y = sorters[sort.key](b);
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
    return sort.desc ? -c : c;
  });

  const th = (key: SortKey, label: string, cls = "num") => (
    <th className={cls} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
      <button className="sort" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== "symbol" }))}>
        {label}{sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
      </button>
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="holdings">
        <thead>
          <tr>
            {th("symbol", "Holding", "")}
            <th className="num">Shares</th>
            <th className="num">Price</th>
            {th("day", "Day")}
            {th("value", "Value")}
            {th("weight", "Weight")}
            {th("gain", "Gain / loss")}
            {th("cap", "Mkt cap")}
            {th("pe", "P/E")}
            <th className="num">EPS</th>
            {th("div", "Div. yield")}
            <th>52-week range</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ holding: h, quote: q, value, weight, gain, gainPercent, cost }) => (
            <tr key={h.symbol}>
              <td>
                <button className="link sym" onClick={() => onOpen(h)}>{h.symbol}</button>{" "}
                <span className="tag">{TYPE_LABEL[h.quoteType]}</span>
                <div className="name muted small" title={h.name}>{q?.name ?? h.name}</div>
              </td>
              <td className="num">{num(h.shares, 4)}</td>
              <td className="num">{q ? money(q.price, q.currency) : "—"}</td>
              <td className={`num delta ${trend(q?.changePercent)}`}>{pct(q?.changePercent, 2, true)}</td>
              <td className="num">{money(value, currency)}</td>
              <td className="num">{pct(weight != null ? weight * 100 : undefined, 1)}</td>
              <td className={`num delta ${trend(gain)}`}>
                {cost != null ? (
                  <>
                    {signedMoney(gain, currency)}
                    <div className="small">{pct(gainPercent, 2, true)}</div>
                  </>
                ) : (
                  <button className="link small" onClick={() => onEdit(h)}>Add cost</button>
                )}
              </td>
              <td className="num">{compact(q?.marketCap)}</td>
              <td className="num">{num(q?.trailingPE, 1)}</td>
              <td className="num">{q?.eps != null ? num(q.eps) : "—"}</td>
              <td className="num">{pct(q?.dividendYield)}</td>
              <td>{q ? <RangeBar low={q.fiftyTwoWeekLow} high={q.fiftyTwoWeekHigh} value={q.price} /> : "—"}</td>
              <td className="actions">
                <button className="ghost small" onClick={() => onEdit(h)}>Edit</button>
                <button className="ghost small" onClick={() => confirm(`Remove ${h.symbol} from this portfolio?`) && onRemove(h)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
