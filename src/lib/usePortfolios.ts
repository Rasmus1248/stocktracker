import { useCallback, useEffect, useRef, useState } from "react";
import type { Holding, Portfolio } from "./portfolio";
import { generateCode, normalizeCode } from "./syncCode";

const KEY = "stocktracker.v1";
const SYNC_KEY = "stocktracker.sync";

interface Store {
  portfolios: Portfolio[];
  activeId: string;
}

export type SyncStatus = "connecting" | "saving" | "synced" | "offline" | "unavailable";
export interface SyncState {
  code: string;
  status: SyncStatus;
  error?: string;
  /** Shown briefly when another device's changes were loaded. */
  notice?: string;
}

interface RemoteDoc {
  version: number;
  data: { portfolios: Portfolio[] };
}

const newId = () => Math.random().toString(36).slice(2, 10);
const blank = (name: string, baseCurrency = "USD"): Portfolio => ({ id: newId(), name, baseCurrency, holdings: [] });

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode); keep working in memory */
  }
}

function loadStore(): Store {
  const s = readJson<Store>(KEY);
  if (s?.portfolios?.length) return s;
  const p = blank("My portfolio");
  return { portfolios: [p], activeId: p.id };
}

/** A `#sync=<code>` link opened on this device takes precedence over the stored code. */
function codeFromUrl(): string | null {
  const m = location.hash.match(/sync=([^&]+)/);
  if (!m) return null;
  history.replaceState(null, "", location.pathname + location.search);
  return normalizeCode(decodeURIComponent(m[1]));
}

async function request(method: "GET" | "PUT", code: string, body?: unknown) {
  const res = await fetch(`/api/sync/${code}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/**
 * Portfolios live in localStorage for instant loading and offline use, and are synced through the
 * server under a private sync code so the same portfolios appear on every device that uses the code.
 */
export function usePortfolios() {
  const [store, setStore] = useState<Store>(loadStore);
  const savedSync = readJson<{ code: string; version: number }>(SYNC_KEY);
  const [sync, setSync] = useState<SyncState>(() => ({ code: savedSync?.code ?? generateCode(), status: "connecting" }));

  const version = useRef(savedSync?.version ?? 0);
  const dirty = useRef(false); // local edits not yet saved to the server
  const storeRef = useRef(store);
  storeRef.current = store;
  const codeRef = useRef(sync.code);

  useEffect(() => writeJson(KEY, store), [store]);
  const persistSync = () => writeJson(SYNC_KEY, { code: codeRef.current, version: version.current });

  const adopt = useCallback((doc: RemoteDoc) => {
    if (!doc.data?.portfolios?.length) return;
    version.current = doc.version;
    persistSync();
    setStore((s) => ({
      portfolios: doc.data.portfolios,
      activeId: doc.data.portfolios.some((p) => p.id === s.activeId) ? s.activeId : doc.data.portfolios[0].id,
    }));
  }, []);

  const fail = (status: number, json: { error?: string } | null) =>
    setSync((s) => ({ ...s, status: status === 503 ? "unavailable" : "offline", error: json?.error }));

  const push = useCallback(async () => {
    const code = codeRef.current;
    setSync((s) => ({ ...s, status: "saving" }));
    dirty.current = false;
    try {
      const { status, json } = await request("PUT", code, { baseVersion: version.current, data: { portfolios: storeRef.current.portfolios } });
      if (code !== codeRef.current) return;
      if (status === 200) {
        version.current = json.version;
        persistSync();
        setSync((s) => ({ ...s, status: "synced", error: undefined }));
      } else if (status === 409) {
        // Another device saved first; its copy wins and this edit is dropped.
        adopt(json);
        setSync((s) => ({ ...s, status: "synced", notice: "Another device changed these portfolios, so its version was loaded." }));
      } else {
        dirty.current = true;
        fail(status, json);
      }
    } catch {
      dirty.current = true;
      setSync((s) => ({ ...s, status: "offline" }));
    }
  }, [adopt]);

  /** Fetch the server copy. If none exists yet, upload this device's portfolios under the code. */
  const pull = useCallback(async () => {
    const code = codeRef.current;
    try {
      const { status, json } = await request("GET", code);
      if (code !== codeRef.current || dirty.current) return;
      if (status === 200) {
        if (json.version !== version.current) adopt(json);
        setSync((s) => ({ ...s, status: "synced", error: undefined }));
      } else if (status === 404) {
        version.current = 0;
        await push();
      } else fail(status, json);
    } catch {
      setSync((s) => ({ ...s, status: "offline" }));
    }
  }, [adopt, push]);

  // Initial connect, plus refresh when the tab regains focus and every 30 seconds.
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      const linked = codeFromUrl();
      if (linked && linked !== codeRef.current) {
        codeRef.current = linked;
        version.current = -1; // force adopting whatever the link points to
        setSync({ code: linked, status: "connecting" });
      }
      persistSync();
      void pull();
    }
    const refresh = () => document.visibilityState === "visible" && (dirty.current ? void push() : void pull());
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [pull, push]);

  // Save edits shortly after they happen.
  const editCount = useRef(0);
  const [edits, setEdits] = useState(0);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => void push(), 600);
    return () => clearTimeout(t);
  }, [edits, push]);

  const edit = useCallback((fn: (s: Store) => Store) => {
    dirty.current = true;
    setStore(fn);
    setEdits(++editCount.current);
  }, []);
  const updateActive = useCallback(
    (fn: (p: Portfolio) => Portfolio) => edit((s) => ({ ...s, portfolios: s.portfolios.map((p) => (p.id === s.activeId ? fn(p) : p)) })),
    [edit],
  );

  const active = store.portfolios.find((p) => p.id === store.activeId) ?? store.portfolios[0];

  return {
    portfolios: store.portfolios,
    active,
    sync: {
      ...sync,
      /** Switch this device to another device's code; its portfolios replace the ones here. */
      async switchCode(input: string): Promise<string | null> {
        const code = normalizeCode(input);
        if (!code) return "That doesn't look like a sync code (20 letters and numbers).";
        const { status, json } = await request("GET", code).catch(() => ({ status: 0, json: null }));
        if (status === 404) return "No portfolios are saved under that code.";
        if (status !== 200) return json?.error ?? "Couldn't reach the server.";
        codeRef.current = code;
        dirty.current = false;
        adopt(json);
        setSync({ code, status: "synced" });
        return null;
      },
      dismissNotice: () => setSync((s) => ({ ...s, notice: undefined })),
      retry: () => void (dirty.current ? push() : pull()),
    },
    select: (id: string) => setStore((s) => ({ ...s, activeId: id })),
    create: (name: string) => {
      const p = blank(name, active.baseCurrency);
      edit((s) => ({ portfolios: [...s.portfolios, p], activeId: p.id }));
    },
    rename: (name: string) => updateActive((p) => ({ ...p, name })),
    remove: () =>
      edit((s) => {
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
