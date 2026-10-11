import type { Quote, SearchResult } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { money, pct, TYPE_LABEL, trend } from "../lib/format.ts";
import { isFund } from "../lib/portfolio.ts";
import { useAsync } from "../lib/useAsync.ts";
import { MetricsGrid } from "./MetricsGrid.tsx";

export function PriceLine({ q }: { q: Quote }) {
  return (
    <div className="price-line">
      <span className="price">{money(q.price, q.currency)}</span>
      <span className={`delta ${trend(q.change)}`}>
        {q.change != null && (q.change > 0 ? "▲ " : q.change < 0 ? "▼ " : "")}
        {money(q.change != null ? Math.abs(q.change) : undefined, q.currency)} ({pct(q.changePercent, 2, true)})
      </span>
    </div>
  );
}

interface Props {
  security: SearchResult;
  onAdd: (s: SearchResult) => void;
  onClose: () => void;
}

export function SecurityDetail({ security, onAdd, onClose }: Props) {
  const { data, error, loading } = useAsync(security.symbol, () => api.quotes([security.symbol]).then((r) => r[0]), 60_000);
  const fund = isFund(security.quoteType);
  const holdings = useAsync(fund ? security.symbol : null, () => api.holdings(security.symbol));

  return (
    <section className="card detail">
      <header className="detail-head">
        <div>
          <h2>
            {security.symbol} <span className="tag">{TYPE_LABEL[security.quoteType]}</span>
          </h2>
          <div className="muted">
            {data?.name ?? security.name} · {data?.exchange ?? security.exchange}
            {data && ` · ${data.currency}`}
          </div>
        </div>
        <div className="row">
          <button className="primary" onClick={() => onAdd(security)}>Add to portfolio</button>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </header>
      {loading && !data && <p className="muted">Loading quote…</p>}
      {error && !data && <p className="error">{error}</p>}
      {!loading && !error && !data && <p className="muted">No quote available for this security.</p>}
      {data && (
        <>
          <PriceLine q={data} />
          <MetricsGrid quote={data} />
        </>
      )}
      {fund && holdings.data && holdings.data.holdings.length > 0 && (
        <>
          <h3>Top holdings</h3>
          <ol className="fund-holdings">
            {holdings.data.holdings.map((h) => (
              <li key={h.symbol}>
                <span className="sym">{h.symbol}</span>
                <span className="name">{h.name}</span>
                <span className="num">{pct(h.weight * 100)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
