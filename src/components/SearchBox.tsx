import { useEffect, useState } from "react";
import type { SearchResult } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { TYPE_LABEL } from "../lib/format.ts";

interface Props {
  onSelect: (r: SearchResult) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

/** Searches every security Yahoo Finance knows about: stocks, ETFs and funds on all major exchanges. */
export function SearchBox({ onSelect, autoFocus, placeholder = "Search any stock, ETF or fund — name or ticker" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      setStatus("loading");
      api.search(q).then(
        (r) => alive && (setResults(r), setCursor(0), setStatus("idle")),
        () => alive && setStatus("error"),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const pick = (r: SearchResult) => {
    onSelect(r);
    setQuery("");
    setResults([]);
  };

  return (
    <div className="search">
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label="Search securities"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, results.length - 1));
          else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
          else if (e.key === "Enter" && results[cursor]) pick(results[cursor]);
          else return;
          e.preventDefault();
        }}
      />
      {query.trim() && (
        <ul className="search-results" role="listbox">
          {status === "loading" && results.length === 0 && <li className="muted">Searching…</li>}
          {status === "error" && <li className="muted">Search failed. Is the server running?</li>}
          {status === "idle" && results.length === 0 && <li className="muted">No matches</li>}
          {results.map((r, i) => (
            <li
              key={r.symbol}
              role="option"
              aria-selected={i === cursor}
              className={i === cursor ? "active" : ""}
              onMouseEnter={() => setCursor(i)}
              onMouseDown={(e) => (e.preventDefault(), pick(r))}
            >
              <span className="sym">{r.symbol}</span>
              <span className="name">{r.name}</span>
              <span className="tag">{TYPE_LABEL[r.quoteType]}</span>
              <span className="muted small">{r.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
