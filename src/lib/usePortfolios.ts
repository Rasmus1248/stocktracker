import { useCallback, useEffect, useState } from "react";
import type { Holding, Portfolio } from "./portfolio.ts";

const KEY = "stocktracker.v1";

interface Store {
  portfolios: Portfolio[];
  activeId: string;
}

const newId = () => Math.random().toString(36).slice(2, 10);
const blank = (name: string, baseCurrency = "USD"): Portfolio => ({ id: newId(), name, baseCurrency, holdings: [] });

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      if (s.portfolios?.length) return s;
    }
  } catch {
    /* fall through to a fresh store */
  }
  const p = blank("My portfolio");
  return { portfolios: [p], activeId: p.id };
}

/** Portfolios are saved in the browser's localStorage. */
export function usePortfolios() {
  const [store, setStore] = useState<Store>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch {
      /* storage unavailable (private mode); keep working in memory */
    }
  }, [store]);

  const active = store.portfolios.find((p) => p.id === store.activeId) ?? store.portfolios[0];

  const updateActive = useCallback(
    (fn: (p: Portfolio) => Portfolio) =>
      setStore((s) => ({ ...s, portfolios: s.portfolios.map((p) => (p.id === (s.activeId ?? active.id) ? fn(p) : p)) })),
    [active.id],
  );

  return {
    portfolios: store.portfolios,
    active,
    select: (id: string) => setStore((s) => ({ ...s, activeId: id })),
    create: (name: string) => {
      const p = blank(name, active.baseCurrency);
      setStore((s) => ({ portfolios: [...s.portfolios, p], activeId: p.id }));
    },
    rename: (name: string) => updateActive((p) => ({ ...p, name })),
    remove: () =>
      setStore((s) => {
        const rest = s.portfolios.filter((p) => p.id !== s.activeId);
        const portfolios = rest.length ? rest : [blank("My portfolio")];
        return { portfolios, activeId: portfolios[0].id };
      }),
    setBaseCurrency: (baseCurrency: string) => updateActive((p) => ({ ...p, baseCurrency })),
    /** Adding a symbol that's already held merges the lots, averaging the cost basis. */
    addHolding: (h: Holding) =>
      updateActive((p) => {
        const existing = p.holdings.find((x) => x.symbol === h.symbol);
        if (!existing) return { ...p, holdings: [...p.holdings, h] };
        const shares = existing.shares + h.shares;
        const avgCost =
          existing.avgCost != null && h.avgCost != null
            ? (existing.avgCost * existing.shares + h.avgCost * h.shares) / shares
            : (existing.avgCost ?? h.avgCost);
        return { ...p, holdings: p.holdings.map((x) => (x === existing ? { ...x, shares, avgCost } : x)) };
      }),
    updateHolding: (symbol: string, patch: Partial<Holding>) =>
      updateActive((p) => ({ ...p, holdings: p.holdings.map((x) => (x.symbol === symbol ? { ...x, ...patch } : x)) })),
    removeHolding: (symbol: string) =>
      updateActive((p) => ({ ...p, holdings: p.holdings.filter((x) => x.symbol !== symbol) })),
  };
}
