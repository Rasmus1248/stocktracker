import { useState } from "react";
import { compact, money, num, pct, signedMoney, TYPE_LABEL, trend } from "../lib/format";
import type { Holding, Position } from "../lib/portfolio";
import type { TxType } from "../lib/ledger";
import { CASH_PREFIX, isCash } from "../lib/portfolio";
import { NOTE_MAX } from "./TradeDialog";
import { RangeBar } from "./MetricsGrid";

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
  /** Open the trade dialog for this holding. */
  onTrade: (h: Holding, type: TxType) => void;
  /** Open the imported transaction that has no purchase price. */
  onAddCost: (h: Holding) => void;
  /** Omitted in the combined view, where notes are read-only. */
  onNote?: (h: Holding, note: string | undefined) => void;
  onOpen: (h: Holding) => void;
  showPortfolios: boolean;
}

export function HoldingsTable({ positions, currency, onTrade, onAddCost, onOpen, onNote, showPortfolios }: Props) {
  const [editingNote, setEditingNote] = useState<string | null>(null);
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
            isCash(h) ? (
              <tr key={h.symbol} className="cash-row">
                <td>
                  <span className="sym">{h.name}</span> <span className="tag">Cash</span>
                  {showPortfolios && <div className="muted small">{h.portfolios.join(", ")}</div>}
                </td>
                <td className="num">{money(h.shares, h.symbol.slice(CASH_PREFIX.length))}</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{money(value, currency)}</td>
                <td className="num">{pct(weight != null ? weight * 100 : undefined, 1)}</td>
                <td colSpan={6} />
                <td className="actions">
                  <button className="ghost small" onClick={() => onTrade(h, "deposit")}>Deposit</button>
                  <button className="ghost small" onClick={() => onTrade(h, "withdrawal")}>Withdraw</button>
                </td>
              </tr>
            ) : (
            <tr key={h.symbol}>
              <td>
                <button className="link sym" onClick={() => onOpen(h)}>{h.symbol}</button>{" "}
                <span className="tag">{TYPE_LABEL[h.quoteType]}</span>
                <div className="name muted small" title={h.name}>{q?.name ?? h.name}</div>
                {showPortfolios && <div className="muted small">In: {h.portfolios.join(", ")}</div>}
                {editingNote === h.symbol && onNote ? (
                  <NoteEditor
                    initial={h.note ?? ""}
                    onSave={(note) => {
                      onNote(h, note.trim() || undefined);
                      setEditingNote(null);
                    }}
                    onCancel={() => setEditingNote(null)}
                  />
                ) : h.note ? (
                  <button className="note" onClick={() => onNote && setEditingNote(h.symbol)} title={onNote ? "Edit note" : undefined} disabled={!onNote}>
                    <span aria-hidden>📝</span> {h.note}
                  </button>
                ) : null}
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
                  <button className="link small" onClick={() => onAddCost(h)}>Add cost</button>
                )}
              </td>
              <td className="num">{compact(q?.marketCap)}</td>
              <td className="num">{num(q?.trailingPE, 1)}</td>
              <td className="num">{q?.eps != null ? num(q.eps) : "—"}</td>
              <td className="num">{pct(q?.dividendYield)}</td>
              <td>{q ? <RangeBar low={q.fiftyTwoWeekLow} high={q.fiftyTwoWeekHigh} value={q.price} /> : "—"}</td>
              <td className="actions">
                <button className="ghost small" onClick={() => onTrade(h, "buy")}>Buy</button>
                <button className="ghost small" onClick={() => onTrade(h, "sell")}>Sell</button>
                {onNote && !h.note && editingNote !== h.symbol && (
                  <button className="ghost small" onClick={() => setEditingNote(h.symbol)}>Note</button>
                )}
              </td>
            </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteEditor({ initial, onSave, onCancel }: { initial: string; onSave: (note: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <form
      className="note-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text);
      }}
    >
      <input
        autoFocus
        maxLength={NOTE_MAX}
        value={text}
        placeholder="e.g. Sell at 250"
        aria-label="Note"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <button type="submit" className="small primary">Save</button>
      {initial && <button type="button" className="small ghost" onClick={() => onSave("")}>Delete</button>}
      <button type="button" className="small ghost" onClick={onCancel}>Cancel</button>
    </form>
  );
}
