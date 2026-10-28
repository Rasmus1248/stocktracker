import express, { type NextFunction, type Request, type Response } from "express";
import { DemoProvider } from "./providers/demo.js";
import { SCREENERS, type DataProvider, type ScreenerId } from "./providers/provider.js";
import { YahooProvider } from "./providers/yahoo.js";
import { createStore, storageKey, type SyncDoc } from "./store.js";

const source = process.env.DATA_SOURCE === "demo" ? "demo" : "yahoo";
const provider: DataProvider = source === "demo" ? new DemoProvider() : new YahooProvider();
const store = createStore();

// Tiny in-memory TTL cache so repeated page loads don't hammer the upstream API.
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => cache.delete(key));
  return value;
}

const MIN = 60_000;
const symbolList = (v: unknown) =>
  [...new Set(String(v ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))].sort().slice(0, 100);
const currency = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

type Handler = (req: Request, res: Response) => Promise<unknown>;
/** Wraps an async handler; `cacheSeconds` lets Vercel's CDN (or any proxy) cache the response. */
const route = (fn: Handler, cacheSeconds = 0) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).then((data) => {
    if (cacheSeconds) res.set("Cache-Control", `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}`);
    res.json(data);
  }, next);

const api = express.Router();

api.get("/meta", route(async () => ({ source, sync: store != null })));

api.get("/search", route(async (req) => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (!q) return [];
  return cached(`search:${q.toLowerCase()}`, 10 * MIN, () => provider.search(q));
}, 600));

api.get("/quotes", route(async (req) => {
  const symbols = symbolList(req.query.symbols);
  return cached(`quotes:${symbols.join(",")}`, MIN, () => provider.quotes(symbols));
}, 60));

api.get("/fx", route(async (req) => {
  const to = currency(req.query.to) || "USD";
  const from = [...new Set(String(req.query.from ?? "").split(",").map(currency).filter((c) => c.length === 3))].sort();
  return cached(`fx:${from.join(",")}:${to}`, 10 * MIN, () => provider.fx(from, to));
}, 600));

api.get("/holdings/:symbol", route(async (req) => {
  const symbol = String(req.params.symbol).toUpperCase();
  return cached(`holdings:${symbol}`, 6 * 60 * MIN, () => provider.fundHoldings(symbol));
}, 6 * 3600));

api.get("/screener/:id", route(async (req) => {
  const id = req.params.id as ScreenerId;
  if (!(id in SCREENERS)) throw httpError(404, "Unknown screener");
  return cached(`screener:${id}`, 5 * MIN, () => provider.screener(id));
}, 300));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
api.get("/history/:symbol", route(async (req) => {
  const symbol = String(req.params.symbol).toUpperCase();
  const from = String(req.query.from ?? "");
  if (!DATE.test(from)) throw httpError(400, "`from` must be a date like 2024-01-31");
  return cached(`history:${symbol}:${from}`, 60 * MIN, () => provider.history(symbol, from));
}, 3600));

// --- Cross-device sync. The sync code is the only credential, so it must be long and random.
const CODE = /^[a-z0-9]{4}(-[a-z0-9]{4}){4}$/;
function syncTarget(req: Request) {
  if (!store) throw httpError(503, "Sync storage isn't configured on the server (see README → Deploying to Vercel).");
  const code = String(req.params.code).toLowerCase();
  if (!CODE.test(code)) throw httpError(400, "Invalid sync code");
  return { store, id: storageKey(code) };
}

api.get("/sync/:code", route(async (req, res) => {
  const { store, id } = syncTarget(req);
  res.set("Cache-Control", "no-store");
  const doc = await store.get(id);
  if (!doc) throw httpError(404, "No portfolios saved under this code");
  return doc;
}));

api.put("/sync/:code", express.json({ limit: "1mb" }), route(async (req, res) => {
  const { store, id } = syncTarget(req);
  res.set("Cache-Control", "no-store");
  const { baseVersion, data } = req.body ?? {};
  if (typeof baseVersion !== "number" || !Array.isArray(data?.portfolios)) throw httpError(400, "Invalid sync payload");
  const current = await store.get(id);
  // Optimistic concurrency: reject writes based on an outdated copy so devices don't silently overwrite each other.
  if (current && current.version !== baseVersion) {
    res.status(409);
    return current;
  }
  const doc: SyncDoc = { version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString(), data };
  await store.put(id, doc);
  return { version: doc.version, updatedAt: doc.updatedAt };
}));

api.use((_req, _res, next) => next(httpError(404, "Unknown API route")));

export const app = express();
app.disable("x-powered-by");
app.use("/api", api);
app.use("/api", (err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  if (!err.status) console.error(err);
  res.status(err.status ?? 502).json({ error: err.message || "Upstream data request failed" });
});

export default app;
