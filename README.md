# Stock Tracker

A web app for tracking stock portfolios.

- **Every listed security.** Search stocks, ETFs and mutual funds on all major exchanges by name or ticker. The Explore tab also shows the day's most active stocks, top gainers and top losers.
- **Portfolios.** Create as many portfolios as you like, add holdings (shares plus an optional average cost) and edit or remove them. Add a short note to any holding (e.g. "sell at 250") to keep your plan next to the numbers. Each portfolio has a base currency, and holdings in other currencies are converted at live FX rates.
- **Key metrics.** Totals for value, today's change, gain/loss and value-weighted dividend yield. For each holding: price, day change, value, weight, gain/loss, market cap, P/E, EPS, dividend yield and 52-week range. Click a ticker to see more, such as forward P/E, price/book, volume, and expense ratio and top holdings for funds.
- **Allocation chart.** A donut chart and ranked list showing what share of the portfolio each position makes up. If the portfolio holds ETFs or funds, a toggle switches between showing **each fund as one slice** and **splitting funds into the stocks they hold**. In the split view, a stock held both directly and through a fund is merged into one slice. Hover a slice to see where it comes from. Use **Show top 10 / 20 / 50 / 100** to choose how many positions get their own slice; the rest are grouped as "Other".
- **Same portfolios on every device.** Each browser gets a private sync code (Sync devices button, top right). Open the sync link, or enter the code, on another device and your portfolios appear there. Edits save automatically and show up on your other devices within about 30 seconds, or when you switch back to the tab.

Market data comes from Yahoo Finance through the [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) library.

## Running it

Requires Node.js 22+.

```bash
npm install
npm run dev        # API on :3001 and the app on http://localhost:5173
```

No network access, or just want to try it out? `npm run demo` runs the same app on built-in sample data (marked "Demo data" in the header).

Production:

```bash
npm run build
npm start          # serves the app and API on http://localhost:3001 (set PORT to change)
```

Other scripts: `npm test` (unit tests for the valuation and allocation logic) and `npm run typecheck`.

## Deploying to Vercel

The repo is set up for Vercel: the frontend is built to `dist/`, and `api/index.ts` runs the API as a serverless function (`vercel.json` routes `/api/*` to it).

1. Import the repo in Vercel. The settings in `vercel.json` are picked up automatically.
2. **Turn on sync storage:** in the Vercel project, open **Storage → Create / Connect Database → Upstash for Redis** (free plan is enough) and connect it to the project. This adds `KV_REST_API_URL`/`KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`); either pair works.
3. Redeploy so the function picks up the new variables.

Without step 2 the app still works, but each device keeps its own portfolios, and the Sync dialog says "Sync not set up".

On a regular Node host (Render, Railway, a VPS), run `npm run build` then `npm start`. Sync then saves to `data/sync/` on disk (change with `SYNC_DIR`), or to Redis if the variables above are set.

## Notes and limitations

- Yahoo Finance has no official API; quotes may be delayed and fields vary by security. All data access goes through `server/providers/`, so another provider can be added there.
- Sync codes act as passwords: anyone with the code can see and edit those portfolios. If two devices edit at the same moment, the one that saves first wins and the other reloads its copy.
- Fund breakdowns use the **top 10 holdings** Yahoo reports for each fund. The rest of the fund is shown as a "<fund> · other" slice, and the chart notes how much of each fund is covered.
- London (GBp) and other minor-unit listings are converted to whole currency units. Enter average cost in the same units the price is quoted in.

## Layout

```
api/index.ts       Vercel serverless entry point
server/            Express API (search, quotes, FX, fund holdings, screeners, sync) with an in-memory cache
  store.ts         Sync storage: Upstash Redis or local JSON files
  providers/       yahoo.ts (live data) and demo.ts (offline sample data)
shared/types.ts    Types shared by server and client
src/lib/           Portfolio maths (portfolio.ts + tests), API client, portfolio store with sync
src/components/    React UI
```
