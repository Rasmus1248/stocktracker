import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { money, TYPE_LABEL } from "../lib/format.ts";
import type { Holding } from "../lib/portfolio.ts";
import { useAsync } from "../lib/useAsync.ts";
import { SearchBox } from "./SearchBox.tsx";

interface Props {
  /** Pre-selected security, or an existing holding when editing. */
  security?: SearchResult;
  editing?: Holding;
  portfolioName: string;
  onSave: (h: Holding) => void;
  onClose: () => void;
}

export function HoldingDialog({ security: initial, editing, portfolioName, onSave, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [security, setSecurity] = useState<SearchResult | undefined>(
    editing ? { symbol: editing.symbol, name: editing.name, quoteType: editing.quoteType, exchange: "" } : initial,
  );
  const [shares, setShares] = useState(editing ? String(editing.shares) : "");
  const [cost, setCost] = useState(editing?.avgCost != null ? String(editing.avgCost) : "");
  const quote = useAsync(security?.symbol ?? null, () => api.quotes([security!.symbol]).then((r) => r[0]));

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const sharesN = Number(shares);
  const costN = cost.trim() === "" ? undefined : Number(cost);
  const valid = security && sharesN > 0 && (costN == null || costN >= 0);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSave({ symbol: security.symbol, name: quote.data?.name ?? security.name, quoteType: quote.data?.quoteType ?? security.quoteType, shares: sharesN, avgCost: costN });
          onClose();
        }}
      >
        <h2>{editing ? `Edit ${editing.symbol}` : `Add holding to ${portfolioName}`}</h2>
        {!security ? (
          <SearchBox autoFocus onSelect={setSecurity} />
        ) : (
          <>
            <div className="picked">
              <div>
                <strong>{security.symbol}</strong> <span className="tag">{TYPE_LABEL[security.quoteType]}</span>
                <div className="muted small">{quote.data?.name ?? security.name}</div>
              </div>
              <div className="right">
                {quote.data && <div>{money(quote.data.price, quote.data.currency)}</div>}
                {!editing && (
                  <button type="button" className="link" onClick={() => setSecurity(undefined)}>Change</button>
                )}
              </div>
            </div>
            <label>
              Shares / units
              <input type="number" min="0" step="any" required autoFocus value={shares} onChange={(e) => setShares(e.target.value)} />
            </label>
            <label>
              Average cost per share{quote.data ? ` (${quote.data.currency})` : ""} <span className="muted">— optional</span>
              <input type="number" min="0" step="any" value={cost} placeholder={quote.data ? String(quote.data.price) : ""} onChange={(e) => setCost(e.target.value)} />
            </label>
            {!editing && <p className="muted small">If you already hold this security, the shares are added and the average cost is recalculated.</p>}
          </>
        )}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!valid}>{editing ? "Save" : "Add"}</button>
        </div>
      </form>
    </dialog>
  );
}
