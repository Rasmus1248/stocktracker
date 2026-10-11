import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoProvider } from "./providers/demo.ts";
import { SCREENERS, type DataProvider, type ScreenerId } from "./providers/provider.ts";
import { YahooProvider } from "./providers/yahoo.ts";

const source = process.env.DATA_SOURCE === "demo" ? "demo" : "yahoo";
const provider: DataProvider = source === "demo" ? new DemoProvider() : new YahooProvider();

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

const app = express();
const api = express.Router();
type Handler = (req: Request) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req).then((data) => res.json(data), next);

api.get("/meta", route(async () => ({ source })));

api.get("/search", route(async (req) => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  if (!q) return [];
  return cached(`search:${q.toLowerCase()}`, 10 * MIN, () => provider.search(q));
}));

api.get("/quotes", route(async (req) => {
  const symbols = symbolList(req.query.symbols);
  return cached(`quotes:${symbols.join(",")}`, MIN, () => provider.quotes(symbols));
}));

api.get("/fx", route(async (req) => {
  const to = currency(req.query.to) || "USD";
  const from = [...new Set(String(req.query.from ?? "").split(",").map(currency).filter((c) => c.length === 3))].sort();
  return cached(`fx:${from.join(",")}:${to}`, 10 * MIN, () => provider.fx(from, to));
}));

api.get("/holdings/:symbol", route(async (req) => {
  const symbol = String(req.params.symbol).toUpperCase();
  return cached(`holdings:${symbol}`, 6 * 60 * MIN, () => provider.fundHoldings(symbol));
}));

api.get("/screener/:id", route(async (req) => {
  const id = req.params.id as ScreenerId;
  if (!(id in SCREENERS)) throw Object.assign(new Error("Unknown screener"), { status: 404 });
  return cached(`screener:${id}`, 5 * MIN, () => provider.screener(id));
}));

app.use("/api", api);

// In production, serve the built frontend from the same server.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
app.use(express.static(dist));
app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(err.status ?? 502).json({ error: err.message || "Upstream data request failed" });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Stock tracker API on http://localhost:${port} (data source: ${source})`));
