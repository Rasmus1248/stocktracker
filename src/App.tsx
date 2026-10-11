import { useState } from "react";
import type { SearchResult } from "../shared/types.ts";
import { ExploreView } from "./components/ExploreView.tsx";
import { HoldingDialog } from "./components/HoldingDialog.tsx";
import { PortfolioView } from "./components/PortfolioView.tsx";
import { SecurityDetail } from "./components/SecurityDetail.tsx";
import { api } from "./lib/api.ts";
import type { Holding } from "./lib/portfolio.ts";
import { usePortfolios } from "./lib/usePortfolios.ts";
import { useAsync } from "./lib/useAsync.ts";

type Tab = "portfolio" | "explore";
type DialogState = { security?: SearchResult; editing?: Holding } | null;

export function App() {
  const store = usePortfolios();
  const [tab, setTab] = useState<Tab>("portfolio");
  const [detail, setDetail] = useState<SearchResult | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
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
      </header>
      <main>
        {detail && (
          <SecurityDetail security={detail} onClose={() => setDetail(null)} onAdd={(security) => setDialog({ security })} />
        )}
        {tab === "portfolio" ? (
          <PortfolioView
            store={store}
            onAdd={() => setDialog({})}
            onEdit={(editing) => setDialog({ editing })}
            onOpen={(s) => { setDetail(s); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        ) : (
          <ExploreView onOpen={setDetail} />
        )}
      </main>
      <footer className="muted small">Market data from Yahoo Finance, may be delayed. Portfolios are stored in this browser.</footer>
      {dialog && (
        <HoldingDialog
          {...dialog}
          portfolioName={store.active.name}
          onClose={() => setDialog(null)}
          onSave={(h) => (dialog.editing ? store.updateHolding(h.symbol, { shares: h.shares, avgCost: h.avgCost }) : store.addHolding(h))}
        />
      )}
    </>
  );
}
