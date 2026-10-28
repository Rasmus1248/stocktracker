import { useEffect, useMemo, useRef, useState } from "react";
import type { QuoteType, SearchResult } from "../../shared/types";
import { api } from "../lib/api";
import { money, num, TYPE_LABEL } from "../lib/format";
import { computeLedger, currencyUnit, type Transaction, type TxType } from "../lib/ledger";
import { closeOn } from "../lib/performance";
import type { Portfolio } from "../lib/portfolio";
import { newId, today } from "../lib/usePortfolios";
import { useAsync } from "../lib/useAsync";
import { SearchBox } from "./SearchBox";

export const NOTE_MAX = 280;
export const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "SEK", "NOK", "DKK", "JPY", "CAD", "AUD"];

const TYPES: { type: TxType; label: string }[] = [
  { type: "buy", label: "Buy" },
  { type: "sell", label: "Sell" },
  { type: "dividend", label: "Dividend" },
  { type: "deposit", label: "Deposit cash" },
  { type: "withdrawal", label: "Withdraw cash" },
];

interface Security {
  symbol: string;
  name: string;
  quoteType: QuoteType;
}

export interface TradeDraft {
  portfolioId: string;
  /** An existing transaction to edit, or a partial one to prefill (e.g. type + symbol from a table row). */
  tx: Partial<Transaction> & { type: TxType };
}

interface Props extends TradeDraft {
  portfolios: Portfolio[];
  onSave: (portfolioId: string, tx: Transaction) => void;
  onDelete: (portfolioId: string, id: string) => void;
  onClose: () => void;
}

const isTrade = (t: TxType) => t === "buy" || t === "sell";
const isCashOnly = (t: TxType) => t === "deposit" || t === "withdrawal";
const daysBefore = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const str = (v: number | undefined) => (v == null ? "" : String(v));

export function TradeDialog({ portfolios, portfolioId: initialPortfolio, tx: initial, onSave, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const editing = initial.id != null;
  const [portfolioId, setPortfolioId] = useState(initialPortfolio);
  const portfolio = portfolios.find((p) => p.id === portfolioId) ?? portfolios[0];
  const [type, setType] = useState<TxType>(initial.type);
  const [id] = useState(() => initial.id ?? newId());
  const [createdAt] = useState(() => initial.createdAt ?? Date.now());
  const [security, setSecurity] = useState<Security | undefined>(
    initial.symbol ? { symbol: initial.symbol, name: initial.name ?? initial.symbol, quoteType: initial.quoteType ?? "EQUITY" } : undefined,
  );
  const [date, setDate] = useState(initial.date ?? today());
  const [shares, setShares] = useState(str(initial.shares));
  const [price, setPrice] = useState(str(initial.price));
  const [priceTouched, setPriceTouched] = useState(initial.price != null);
  const [fee, setFee] = useState(str(initial.fee));
  const [amount, setAmount] = useState(str(initial.amount));
  const [cashCcy, setCashCcy] = useState(isCashOnly(initial.type) || initial.type === "dividend" ? (initial.currency ?? portfolio.baseCurrency) : portfolio.baseCurrency);
  const usesCash = portfolio.transactions.some((t) => t.type === "deposit");
  // New trades settle in cash if the portfolio tracks cash; edits keep what the trade had.
  const [settle, setSettle] = useState(initial.id != null ? !!initial.cash : (initial.cash ?? usesCash));

  useEffect(() => ref.current?.showModal(), []);

  // Live quote: currency, and the price for trades dated today.
  const quote = useAsync(security && !isCashOnly(type) ? security.symbol : null, () => api.quotes([security!.symbol]).then((r) => r[0]));
  const currency = (editing && initial.symbol === security?.symbol && initial.currency && isTrade(initial.type) ? initial.currency : undefined) ?? quote.data?.currency;

  // Price on a past date, to prefill backdated trades.
  const past = useAsync(security && isTrade(type) && date < today() ? `${security.symbol}@${date}` : null, () =>
    api.history(security!.symbol, daysBefore(date, 10)).then((h) => closeOn(h.points, date)),
  );
  const suggested = date < today() ? past.data : quote.data?.price;
  useEffect(() => {
    if (!priceTouched && suggested != null && isTrade(type)) setPrice(String(+suggested.toFixed(4)));
  }, [suggested, priceTouched, type]);

  // Securities this portfolio has held, for sells and dividends.
  const held = useMemo(() => {
    const ledger = computeLedger(portfolio.transactions.filter((t) => t.id !== initial.id), date);
    return [...ledger.positions.values()];
  }, [portfolio, date, initial.id]);
  const heldNow = security ? (held.find((p) => p.symbol === security.symbol)?.shares ?? 0) : 0;

  useEffect(() => {
    if (type === "dividend" && currency) setCashCcy(currencyUnit(currency)[0]);
  }, [type, currency]);

  const n = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const tx: Transaction | null = (() => {
    const base = { id, type, date, createdAt };
    if (isCashOnly(type)) {
      const a = n(amount);
      return a && a > 0 ? { ...base, currency: cashCcy, amount: a } : null;
    }
    if (!security) return null;
    const sec = { symbol: security.symbol, name: quote.data?.name ?? security.name, quoteType: quote.data?.quoteType ?? security.quoteType };
    if (type === "dividend") {
      const a = n(amount);
      return a && a > 0 ? { ...base, ...sec, currency: cashCcy, amount: a, cash: settle || undefined } : null;
    }
    const s = n(shares), p = n(price), f = n(fee);
    if (!currency || !s || s <= 0 || p == null || p < 0 || (f != null && f < 0)) return null;
    return { ...base, ...sec, currency, shares: s, price: p, fee: f || undefined, cash: settle || undefined };
  })();

  // Reject edits that would leave a sell selling more than was held (now or for any later sell).
  const problem = useMemo(() => {
    if (!tx) return null;
    const others = portfolio.transactions.filter((t) => t.id !== tx.id);
    const before = computeLedger(portfolio.transactions).issues;
    const after = computeLedger([...others, tx]).issues;
    for (const [id, msg] of after) if (!before.has(id)) return id === tx.id ? msg : `This would break a later sell: ${msg}`;
    return null;
  }, [tx, portfolio]);

  const total = tx && isTrade(type) ? (tx.shares! * tx.price! + (type === "buy" ? 1 : -1) * (tx.fee ?? 0)) : undefined;
  const settleLabel = type === "buy" ? "Pay from cash balance" : type === "sell" ? "Add proceeds to cash balance" : "Add to cash balance";

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tx || problem) return;
          onSave(portfolioId, tx);
          onClose();
        }}
      >
        <h2>{editing ? "Edit transaction" : "Add transaction"}</h2>

        {!editing && (
          <div className="segmented wide" role="tablist">
            {TYPES.map((t) => (
              <button key={t.type} type="button" role="tab" aria-selected={type === t.type} className={type === t.type ? "active" : ""} onClick={() => setType(t.type)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {portfolios.length > 1 && !editing && (
          <label>
            Portfolio
            <select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        {!isCashOnly(type) &&
          (security ? (
            <div className="picked">
              <div>
                <strong>{security.symbol}</strong> <span className="tag">{TYPE_LABEL[security.quoteType]}</span>
                <div className="muted small">{quote.data?.name ?? security.name}</div>
              </div>
              <div className="right">
                {quote.data && <div>{money(quote.data.price, quote.data.currency)}</div>}
                {type === "sell" && <div className="muted small">{num(heldNow, 6)} held on {date}</div>}
                {!editing && <button type="button" className="link" onClick={() => setSecurity(undefined)}>Change</button>}
              </div>
            </div>
          ) : type === "buy" ? (
            <SearchBox autoFocus onSelect={(r: SearchResult) => setSecurity(r)} />
          ) : (
            <label>
              Security
              <select value="" onChange={(e) => { const p = held.find((x) => x.symbol === e.target.value); if (p) setSecurity(p); }}>
                <option value="" disabled>Choose a holding…</option>
                {held.filter((p) => p.shares > 0 || type === "dividend").map((p) => (
                  <option key={p.symbol} value={p.symbol}>{p.symbol} — {p.name}{p.shares > 0 ? ` (${num(p.shares, 4)})` : ""}</option>
                ))}
              </select>
              {held.length === 0 && <span className="muted small">Nothing held in this portfolio on {date}.</span>}
            </label>
          ))}

        <label>
          Date
          <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {isTrade(type) && (
          <div className="grid-3">
            <label>
              Shares
              <input type="number" min="0" step="any" required value={shares} onChange={(e) => setShares(e.target.value)} />
              {type === "sell" && heldNow > 0 && (
                <button type="button" className="link small" onClick={() => setShares(String(heldNow))}>Sell all ({num(heldNow, 6)})</button>
              )}
            </label>
            <label>
              Price{currency ? ` (${currency})` : ""}
              <input type="number" min="0" step="any" required value={price} onChange={(e) => { setPrice(e.target.value); setPriceTouched(true); }} />
              {date < today() && past.loading && <span className="muted small">Looking up price…</span>}
              {date < today() && !past.loading && suggested == null && security && <span className="muted small">No price found for that date.</span>}
            </label>
            <label>
              Fee
              <input type="number" min="0" step="any" placeholder="optional" value={fee} onChange={(e) => setFee(e.target.value)} />
            </label>
          </div>
        )}

        {(type === "dividend" || isCashOnly(type)) && (
          <div className="grid-3">
            <label className="span-2">
              Amount
              <input type="number" min="0" step="any" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              Currency
              <select value={cashCcy} onChange={(e) => setCashCcy(e.target.value)}>
                {[...new Set([cashCcy, portfolio.baseCurrency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
        )}

        {!isCashOnly(type) && (
          <label className="check">
            <input type="checkbox" checked={settle} onChange={(e) => setSettle(e.target.checked)} />
            {settleLabel}
          </label>
        )}

        {total != null && currency && (
          <p className="muted small">
            {type === "buy" ? "Total cost" : "Proceeds"}: <strong>{money(total / currencyUnit(currency)[1], currencyUnit(currency)[0])}</strong>
          </p>
        )}
        {problem && <p className="error small">{problem}</p>}
        {!isCashOnly(type) && security && !currency && quote.error && <p className="error small">Couldn't load this security's currency: {quote.error}</p>}

        <div className="row end">
          {editing && (
            <button type="button" className="ghost danger" onClick={() => { if (confirm("Delete this transaction?")) { onDelete(portfolioId, initial.id!); onClose(); } }}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary" disabled={!tx || !!problem}>{editing ? "Save" : "Add"}</button>
        </div>
      </form>
    </dialog>
  );
}
