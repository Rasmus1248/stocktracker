import { useState } from "react";
import type { SearchResult } from "../shared/types";
import { ExploreView } from "./components/ExploreView";
import { PortfolioView } from "./components/PortfolioView";
import { SecurityDetail } from "./components/SecurityDetail";
import { SYNC_LABEL, SyncDialog } from "./components/SyncDialog";
import { TradeDialog, type TradeDraft } from "./components/TradeDialog";
import { api } from "./lib/api";
import { usePortfolios } from "./lib/usePortfolios";
import { useAsync } from "./lib/useAsync";

type Tab = "portfolio" | "explore";

export function App() {
  const store = usePortfolios();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [dialog, setDialog] = useState<TradeDraft | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const meta = useAsync("meta", api.meta);

  return (
    <>
      <header className="topbar">
        <h1>📈 Stock Tracker</h1>
        <nav className="tabs">
          {(["portfolio", "explore"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
              {t === "portfolio" ? "Portfolio" : "Explore"}
            </button>
          ))}
        </nav>
        {meta.data?.source === "demo" && <span className="badge" title="Started with DATA_SOURCE=demo">Demo data</span>}
        <span className="spacer" />
        <button className={`ghost sync-status ${store.sync.status}`} onClick={() => setSyncOpen(true)} title={SYNC_LABEL[store.sync.status]}>
          <span className="dot" aria-hidden /> Sync devices
        </button>
      </header>
      {store.sync.notice && (
        <div className="notice" role="status">
          {store.sync.notice} <button className="link small" onClick={store.sync.dismissNotice}>Dismiss</button>
        </div>
      )}
      <main>
        {detail && (
          <SecurityDetail security={detail} onClose={() => setDetail(null)} onAdd={(s) => setDialog({ portfolioId: store.isAll ? store.portfolios[0].id : store.active.id, tx: { type: "buy", symbol: s.symbol, name: s.name, quoteType: s.quoteType } })} />
        )}
        {tab === "portfolio" ? (
          <PortfolioView
            store={store}
            onTrade={setDialog}
            onOpen={(s) => { setDetail(s); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        ) : (
          <ExploreView onOpen={setDetail} />
        )}
      </main>
      <footer className="muted small">Market data from Yahoo Finance, may be delayed. Portfolios sync across your devices with your sync code.</footer>
      {syncOpen && <SyncDialog sync={store.sync} onClose={() => setSyncOpen(false)} />}
      {dialog && (
        <TradeDialog
          {...dialog}
          portfolios={store.portfolios}
          onClose={() => setDialog(null)}
          onSave={store.saveTransaction}
          onDelete={store.deleteTransaction}
        />
      )}
    </>
  );
}
