import { useMemo } from "react";
import type { FundHoldings, Quote, SearchResult } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { isFund, normalizeCurrency, summarize, type Holding } from "../lib/portfolio.ts";
import type { usePortfolios } from "../lib/usePortfolios.ts";
import { useAsync } from "../lib/useAsync.ts";
import { AllocationCard } from "./AllocationCard.tsx";
import { HoldingsTable } from "./HoldingsTable.tsx";
import { SummaryTiles } from "./SummaryTiles.tsx";

export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "JPY", "CAD", "AUD"];

interface Props {
  store: ReturnType<typeof usePortfolios>;
  onAdd: () => void;
  onEdit: (h: Holding) => void;
  onOpen: (s: SearchResult) => void;
}

export function PortfolioView({ store, onAdd, onEdit, onOpen }: Props) {
  const p = store.active;
  const symbols = p.holdings.map((h) => h.symbol).sort();
  const fundSymbols = p.holdings.filter((h) => isFund(h.quoteType)).map((h) => h.symbol).sort();

  const quotes = useAsync(symbols.length ? symbols.join(",") : null, async () => {
    const list = await api.quotes(symbols);
    return Object.fromEntries(list.map((q) => [q.symbol, q])) as Record<string, Quote>;
  }, 60_000);

  const currencies = [...new Set(Object.values(quotes.data ?? {}).map((q) => normalizeCurrency(q.currency, 0)[0]))].sort();
  const fx = useAsync(`${currencies.join(",")}>${p.baseCurrency}`, () => api.fx(currencies, p.baseCurrency), 10 * 60_000);

  const funds = useAsync(fundSymbols.length ? fundSymbols.join(",") : null, async () => {
    const res = await Promise.allSettled(fundSymbols.map((s) => api.holdings(s)));
    return Object.fromEntries(res.map((r, i) => [fundSymbols[i], r.status === "fulfilled" ? r.value : undefined])) as Record<string, FundHoldings | undefined>;
  });

  const summary = useMemo(() => summarize(p, quotes.data ?? {}, fx.data ?? {}), [p, quotes.data, fx.data]);
  const error = quotes.error ?? fx.error;

  return (
    <div className="stack">
      <div className="toolbar">
        <select aria-label="Portfolio" value={p.id} onChange={(e) => store.select(e.target.value)}>
          {store.portfolios.map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </select>
        <button className="ghost" onClick={() => { const n = prompt("Name of the new portfolio"); if (n?.trim()) store.create(n.trim()); }}>New</button>
        <button className="ghost" onClick={() => { const n = prompt("Rename portfolio", p.name); if (n?.trim()) store.rename(n.trim()); }}>Rename</button>
        <button className="ghost" onClick={() => confirm(`Delete portfolio “${p.name}”?`) && store.remove()}>Delete</button>
        <label className="ccy">
          Currency
          <select value={p.baseCurrency} onChange={(e) => store.setBaseCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <button className="primary" onClick={onAdd}>+ Add holding</button>
      </div>

      {error && <p className="error">Couldn’t load market data: {error}</p>}
      {summary.missing.length > 0 && !quotes.loading && !fx.loading && (
        <p className="warn">No price or exchange rate for: {summary.missing.join(", ")}. These are left out of totals.</p>
      )}

      {p.holdings.length === 0 ? (
        <section className="card empty">
          <h2>“{p.name}” is empty</h2>
          <p className="muted">Add stocks, ETFs or funds to see their value, key metrics and allocation.</p>
          <button className="primary" onClick={onAdd}>+ Add your first holding</button>
        </section>
      ) : (
        <>
          <SummaryTiles s={summary} currency={p.baseCurrency} />
          <AllocationCard positions={summary.positions} fundHoldings={funds.data ?? {}} currency={p.baseCurrency} loadingFunds={funds.loading} />
          <section className="card">
            <header className="card-head">
              <h2>Holdings &amp; key metrics</h2>
              {quotes.loading && <span className="muted small">Refreshing…</span>}
            </header>
            <HoldingsTable
              positions={summary.positions}
              currency={p.baseCurrency}
              onEdit={onEdit}
              onRemove={(h) => store.removeHolding(h.symbol)}
              onOpen={(h) => onOpen({ symbol: h.symbol, name: h.name, quoteType: h.quoteType, exchange: "" })}
            />
          </section>
        </>
      )}
    </div>
  );
}
