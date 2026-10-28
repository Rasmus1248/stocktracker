import type { FundHoldings, Meta, PriceHistory, Quote, ScreenerList, SearchResult } from "../../shared/types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // A non-JSON 404 means the request never reached our API (e.g. only the static frontend was deployed).
    if (!body) throw new Error(`the data API isn't reachable at /api (HTTP ${res.status}). Check that the server is deployed — see the README.`);
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

const enc = encodeURIComponent;
export const api = {
  meta: () => get<Meta>("/api/meta"),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${enc(q)}`),
  quotes: (symbols: string[]) => get<Quote[]>(`/api/quotes?symbols=${enc(symbols.join(","))}`),
  fx: (from: string[], to: string) => get<Record<string, number>>(`/api/fx?from=${enc(from.join(","))}&to=${enc(to)}`),
  holdings: (symbol: string) => get<FundHoldings>(`/api/holdings/${enc(symbol)}`),
  history: (symbol: string, from: string) => get<PriceHistory>(`/api/history/${enc(symbol)}?from=${enc(from)}`),
  screener: (id: string) => get<ScreenerList>(`/api/screener/${enc(id)}`),
};
