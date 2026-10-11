import type { FundHoldings, Meta, Quote, ScreenerList, SearchResult } from "../../shared/types.ts";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const enc = encodeURIComponent;
export const api = {
  meta: () => get<Meta>("/api/meta"),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${enc(q)}`),
  quotes: (symbols: string[]) => get<Quote[]>(`/api/quotes?symbols=${enc(symbols.join(","))}`),
  fx: (from: string[], to: string) => get<Record<string, number>>(`/api/fx?from=${enc(from.join(","))}&to=${enc(to)}`),
  holdings: (symbol: string) => get<FundHoldings>(`/api/holdings/${enc(symbol)}`),
  screener: (id: string) => get<ScreenerList>(`/api/screener/${enc(id)}`),
};
