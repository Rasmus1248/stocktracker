import { useMemo, useState } from "react";
import type { FundHoldings, Quote, SearchResult } from "../../shared/types";
import { api } from "../lib/api";
import type { TxType } from "../lib/ledger";
import { buildView, CASH_PREFIX, isCash, isFund, normalizeCurrency, summarize, viewCurrencies, type Holding } from "../lib/portfolio";
import { ALL, type usePortfolios } from "../lib/usePortfolios";
import { useAsync } from "../lib/useAsync";
import { AllocationCard } from "./AllocationCard";
import { HoldingsTable } from "./HoldingsTable";
import { PerformanceCard } from "./PerformanceCard";
import { SummaryTiles } from "./SummaryTiles";
import { CURRENCIES, type TradeDraft } from "./TradeDialog";
import { TransactionsCard } from "./TransactionsCard";

type Section = "holdings" | "performance" | "transactions";
const SECTIONS: [Section, string][] = [["holdings", "Holdings"], ["performance", "Gain by year"], ["transactions", "Transactions"]];

interface Props {
  store: ReturnType<typeof usePortfolios>;
  onTrade: (draft: TradeDraft) => void;
  onOpen: (s: SearchResult) => void;
}

export function PortfolioView({ store, onTrade, onOpen }: Props) {
  const [section, setSection] = useState<Section>("holdings");
  const { shown, isAll, viewCurrency: currency } = store;
  const p = store.active;

  const view = useMemo(() => buildView(shown), [shown]);
  const securities = view.holdings.filter((h) => !isCash(h));
  const symbols = securities.map((h) => h.symbol).sort();
  const fundSymbols = securities.filter((h) => isFund(h.quoteType)).map((h) => h.symbol).sort();

  const quotes = useAsync(symbols.length ? symbols.join(",") : null, async () => {
    const list = await api.quotes(symbols);
    return Object.fromEntries(list.map((q) => [q.symbol, q])) as Record<string, Quote>;
  }, 60_000);

  const currencies = [
    ...new Set([...Object.values(quotes.data ?? {}).map((q) => normalizeCurrency(q.currency, 0)[0]), ...viewCurrencies(view)]),
  ].sort();
  const fx = useAsync(`${currencies.join(",")}>${currency}`, () => api.fx(currencies, currency), 10 * 60_000);

  const funds = useAsync(fundSymbols.length ? fundSymbols.join(",") : null, async () => {
    const res = await Promise.allSettled(fundSymbols.map((s) => api.holdings(s)));
    return Object.fromEntries(res.map((r, i) => [fundSymbols[i], r.status === "fulfilled" ? r.value : undefined])) as Record<string, FundHoldings | undefined>;
  });

  const summary = useMemo(() => summarize(view, quotes.data ?? {}, fx.data ?? {}), [view, quotes.data, fx.data]);
  const error = quotes.error ?? fx.error;
  const loading = quotes.loading || fx.loading;
  const empty = shown.every((x) => x.transactions.length === 0);

  /** Which portfolio a trade on this holding goes to: the active one, or the first one holding it. */
  const portfolioFor = (h?: Holding) => (isAll ? (store.portfolios.find((x) => h && h.portfolios.includes(x.name))?.id ?? store.portfolios[0].id) : p.id);
  const trade = (type: TxType, h?: Holding) =>
    onTrade({
      portfolioId: portfolioFor(h),
      tx: h && isCash(h) ? { type, currency: h.symbol.slice(CASH_PREFIX.length) } : { type, symbol: h?.symbol, name: h?.name, quoteType: h?.quoteType },
    });
  const addCost = (h: Holding) => {
    for (const x of shown) {
      const tx = x.transactions.find((t) => t.symbol === h.symbol && t.type === "buy" && t.price == null);
      if (tx) return onTrade({ portfolioId: x.id, tx });
    }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <select aria-label="Portfolio" value={isAll ? ALL : p.id} onChange={(e) => store.select(e.target.value)}>
          {store.portfolios.length > 1 && <option value={ALL}>All portfolios ({store.portfolios.length})</option>}
          {store.portfolios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="ghost" onClick={() => { const n = prompt("Name of the new portfolio"); if (n?.trim()) store.create(n.trim()); }}>New</button>
        {!isAll && (
          <>
            <button className="ghost" onClick={() => { const n = prompt("Rename portfolio", p.name); if (n?.trim()) store.rename(n.trim()); }}>Rename</button>
            <button className="ghost" onClick={() => confirm(`Delete portfolio “${p.name}” and all its transactions?`) && store.remove()}>Delete</button>
          </>
        )}
        <label className="ccy">
          Currency
          <select value={currency} onChange={(e) => store.setCurrency(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <button onClick={() => trade("deposit")}>Cash</button>
        <button className="primary" onClick={() => trade("buy")}>+ Buy / sell</button>
      </div>

      {isAll && <p className="muted small banner">Showing all {store.portfolios.length} portfolios combined, in {currency}. Pick one portfolio to rename or delete it.</p>}
      {error && <p className="error">Couldn’t load market data: {error}</p>}
      {summary.missing.length > 0 && !loading && (
        <p className="warn">No price or exchange rate for: {summary.missing.join(", ")}. These are left out of totals.</p>
      )}
      {view.issues > 0 && (
        <p className="warn">
          {view.issues} {view.issues === 1 ? "sell doesn't" : "sells don't"} add up (more shares sold than held).{" "}
          <button className="link" onClick={() => setSection("transactions")}>Review transactions</button>
        </p>
      )}

      {empty ? (
        <section className="card empty">
          <h2>{isAll ? "No transactions yet" : `“${p.name}” is empty`}</h2>
          <p className="muted">Record a buy to start — backdate it to when you actually bought. Add cash with a deposit.</p>
          <div className="row center">
            <button className="primary" onClick={() => trade("buy")}>+ Add your first trade</button>
            <button onClick={() => trade("deposit")}>Deposit cash</button>
          </div>
        </section>
      ) : (
        <>
          <SummaryTiles s={summary} currency={currency} />
          <nav className="subtabs" aria-label="Portfolio sections">
            {SECTIONS.map(([id, label]) => (
              <button key={id} className={section === id ? "active" : ""} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}>
                {label}
              </button>
            ))}
          </nav>

          {section === "holdings" && (
            <>
              <AllocationCard positions={summary.positions} fundHoldings={funds.data ?? {}} currency={currency} loadingFunds={funds.loading} />
              <section className="card">
                <header className="card-head">
                  <h2>Holdings &amp; key metrics</h2>
                  {quotes.loading && <span className="muted small">Refreshing…</span>}
                </header>
                {summary.positions.length === 0 ? (
                  <p className="muted">Everything has been sold. Past results are under “Gain by year” and “Transactions”.</p>
                ) : (
                  <HoldingsTable
                    positions={summary.positions}
                    currency={currency}
                    showPortfolios={isAll}
                    onTrade={(h, type) => trade(type, h)}
                    onAddCost={addCost}
                    onNote={isAll ? undefined : (h, note) => store.setNote(p.id, h.symbol, note)}
                    onOpen={(h) => onOpen({ symbol: h.symbol, name: h.name, quoteType: h.quoteType, exchange: "" })}
                  />
                )}
              </section>
            </>
          )}
          {section === "performance" && (
            <PerformanceCard portfolios={shown} currency={currency} liveValue={summary.missing.length || loading ? undefined : summary.totalValue} />
          )}
          {section === "transactions" && (
            <TransactionsCard
              portfolios={shown}
              showPortfolio={isAll}
              onAdd={() => trade("buy")}
              onEdit={(portfolioId, tx) => onTrade({ portfolioId, tx })}
            />
          )}
        </>
      )}
    </div>
  );
}
