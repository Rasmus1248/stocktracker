import type { SearchResult } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { compact, money, pct, trend } from "../lib/format.ts";
import { useAsync } from "../lib/useAsync.ts";
import { SearchBox } from "./SearchBox.tsx";

const LISTS = ["most_actives", "day_gainers", "day_losers"];

export function ExploreView({ onOpen }: { onOpen: (s: SearchResult) => void }) {
  return (
    <div className="stack">
      <section className="card">
        <h2>Find a security</h2>
        <p className="muted small">Search stocks, ETFs and funds across all major exchanges by name or ticker (e.g. “Apple”, “VWCE”, “NOVO-B.CO”).</p>
        <SearchBox autoFocus onSelect={onOpen} />
      </section>
      <div className="lists">
        {LISTS.map((id) => <MarketList key={id} id={id} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function MarketList({ id, onOpen }: { id: string; onOpen: (s: SearchResult) => void }) {
  const { data, error } = useAsync(id, () => api.screener(id), 5 * 60_000);
  return (
    <section className="card">
      <h3>{data?.title ?? "…"}</h3>
      {error && <p className="error small">{error}</p>}
      <table className="mini">
        <tbody>
          {data?.quotes.map((q) => (
            <tr key={q.symbol} onClick={() => onOpen(q)} className="clickable">
              <td>
                <span className="sym">{q.symbol}</span>
                <div className="name muted small">{q.name}</div>
              </td>
              <td className="num">{money(q.price, q.currency)}</td>
              <td className={`num delta ${trend(q.changePercent)}`}>{pct(q.changePercent, 2, true)}</td>
              <td className="num muted small">{compact(q.marketCap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
