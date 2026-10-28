import { useMemo, useState } from "react";
import { money, num, signedMoney, trend } from "../lib/format";
import { byDate, computeLedger, currencyUnit, type Transaction, type TxType } from "../lib/ledger";
import type { Portfolio } from "../lib/portfolio";

const LABEL: Record<TxType, string> = { buy: "Buy", sell: "Sell", dividend: "Dividend", deposit: "Deposit", withdrawal: "Withdrawal" };

interface Props {
  portfolios: Portfolio[];
  showPortfolio: boolean;
  onEdit: (portfolioId: string, tx: Transaction) => void;
  onAdd: () => void;
}

export function TransactionsCard({ portfolios, showPortfolio, onEdit, onAdd }: Props) {
  const [symbol, setSymbol] = useState("");
  const [year, setYear] = useState("");

  const rows = useMemo(() => {
    const out: { tx: Transaction; portfolio: Portfolio; gain?: number; issue?: string }[] = [];
    for (const p of portfolios) {
      const ledger = computeLedger(p.transactions);
      const gains = new Map(ledger.sales.map((s) => [s.tx.id, s.gain]));
      for (const tx of p.transactions) out.push({ tx, portfolio: p, gain: gains.get(tx.id), issue: ledger.issues.get(tx.id) });
    }
    return out.sort((a, b) => byDate(b.tx, a.tx));
  }, [portfolios]);

  const symbols = [...new Set(rows.map((r) => r.tx.symbol).filter(Boolean) as string[])].sort();
  const years = [...new Set(rows.map((r) => r.tx.date.slice(0, 4)))].sort().reverse();
  const shown = rows.filter((r) => (!symbol || r.tx.symbol === symbol) && (!year || r.tx.date.startsWith(year)));

  return (
    <section className="card">
      <header className="card-head">
        <h2>Transactions</h2>
        <div className="row wrap">
          <select aria-label="Filter by security" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="">All securities</option>
            {symbols.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="Filter by year" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {years.map((y) => <option key={y}>{y}</option>)}
          </select>
          <button className="primary" onClick={onAdd}>+ Add past trade</button>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="muted">No transactions yet. Add your past buys and sells to build a full history — pick any date.</p>
      ) : (
        <div className="table-wrap">
          <table className="txs">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Security</th>
                {showPortfolio && <th>Portfolio</th>}
                <th className="num">Shares</th>
                <th className="num">Price</th>
                <th className="num">Fee</th>
                <th className="num">Total</th>
                <th className="num">Realized</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ tx, portfolio, gain, issue }) => {
                const [ccy, unit] = currencyUnit(tx.currency || "USD");
                const total =
                  tx.amount ?? (tx.price != null ? ((tx.shares ?? 0) * tx.price + (tx.type === "buy" ? 1 : -1) * (tx.fee ?? 0)) / unit : undefined);
                return (
                  <tr key={tx.id} className={issue ? "has-issue" : ""}>
                    <td className="nowrap">{tx.date}</td>
                    <td>
                      <span className={`tx-type ${tx.type}`}>{LABEL[tx.type]}</span>
                      {tx.cash && <span className="muted small" title="Settled against the cash balance"> · cash</span>}
                    </td>
                    <td>
                      {tx.symbol ? <span className="sym">{tx.symbol}</span> : <span className="muted">Cash ({tx.currency})</span>}
                      {issue && <div className="error small">⚠ {issue}</div>}
                      {tx.symbol && tx.price == null && tx.type === "buy" && <div className="muted small">Imported holding · no purchase price</div>}
                    </td>
                    {showPortfolio && <td className="muted">{portfolio.name}</td>}
                    <td className="num">{tx.shares != null ? num(tx.shares, 6) : "—"}</td>
                    <td className="num">{tx.price != null ? money(tx.price, tx.currency) : "—"}</td>
                    <td className="num">{tx.fee ? money(tx.fee, tx.currency) : "—"}</td>
                    <td className="num">{money(total, ccy)}</td>
                    <td className={`num delta ${trend(gain)}`}>{gain != null ? signedMoney(gain / unit, ccy) : "—"}</td>
                    <td className="actions">
                      <button className="ghost small" onClick={() => onEdit(portfolio.id, tx)}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
