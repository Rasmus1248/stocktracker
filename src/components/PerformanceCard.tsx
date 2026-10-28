import { useMemo } from "react";
import type { PriceHistory } from "../../shared/types";
import { api } from "../lib/api";
import { money, pct, signedMoney, trend } from "../lib/format";
import { historyNeeds, makeLookup, yearlyPerformance } from "../lib/performance";
import type { Portfolio } from "../lib/portfolio";
import { today } from "../lib/usePortfolios";
import { useAsync } from "../lib/useAsync";

interface Props {
  portfolios: Portfolio[];
  currency: string;
  /** Today's total value, or undefined while a quote is missing. */
  liveValue?: number;
}

/** Gain per calendar year, counting everything: holdings, positions sold during the year, dividends and cash. */
export function PerformanceCard({ portfolios, currency, liveValue }: Props) {
  const date = today();
  const needs = useMemo(() => historyNeeds(portfolios, currency, date), [portfolios, currency, date]);
  const history = useAsync(needs ? `${needs.from}|${needs.symbols.join(",")}` : "none", async () => {
    if (!needs) return {};
    const results = await Promise.allSettled(needs.symbols.map((s) => api.history(s, needs.from)));
    return Object.fromEntries(results.map((r, i) => [needs.symbols[i], r.status === "fulfilled" ? r.value : undefined])) as Record<string, PriceHistory | undefined>;
  });

  const rows = useMemo(
    () => (history.data ? yearlyPerformance(portfolios, currency, makeLookup(history.data, currency), date, liveValue) : []),
    [portfolios, currency, history.data, date, liveValue],
  );
  const failed = needs && history.data ? needs.symbols.filter((s) => !history.data![s]) : [];

  return (
    <section className="card">
      <header className="card-head">
        <h2>Gain by year</h2>
        {history.loading && <span className="muted small">Loading price history…</span>}
      </header>
      {portfolios.every((p) => p.transactions.length === 0) ? (
        <p className="muted">Add trades to see how much you gained each year.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="perf">
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="num">Value at start</th>
                  <th className="num">Money in / out</th>
                  <th className="num">Value at end</th>
                  <th className="num">Gain</th>
                  <th className="num">Return</th>
                  <th className="num">Realized</th>
                  <th className="num">Dividends</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year}>
                    <td>
                      <strong>{r.year}</strong>
                      {r.year === +date.slice(0, 4) && <span className="muted small"> so far</span>}
                    </td>
                    <td className="num">{money(r.startValue, currency)}</td>
                    <td className="num">{signedMoney(r.netFlows, currency)}</td>
                    <td className="num">{money(r.endValue, currency)}</td>
                    <td className={`num delta ${trend(r.gain)}`}>
                      <strong>{r.complete ? signedMoney(r.gain, currency) : "—"}</strong>
                      {r.estimated && <span className="muted" title="Includes holdings without a purchase price, valued at that day's market price."> *</span>}
                    </td>
                    <td className={`num delta ${trend(r.returnPct)}`}>{pct(r.returnPct, 1, true)}</td>
                    <td className={`num delta ${trend(r.realized)}`}>{r.realized ? signedMoney(r.realized, currency) : "—"}</td>
                    <td className="num">{r.dividends ? money(r.dividends, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            <strong>Gain</strong> = value at end − value at start − money you put in (or + money you took out). It includes
            positions you sold during the year, dividends and cash. <strong>Return</strong> weights deposits by how long they were
            invested. <strong>Realized</strong> is the gain locked in by sells that year, measured against your average purchase price.
            Past values use closing prices on 31 December.
          </p>
          {failed.length > 0 && <p className="warn small">No price history for {failed.join(", ")}, so some years can't be calculated.</p>}
          {rows.some((r) => r.estimated) && <p className="muted small">* Includes holdings with no purchase price, valued at the market price on the day they were added.</p>}
        </>
      )}
    </section>
  );
}
