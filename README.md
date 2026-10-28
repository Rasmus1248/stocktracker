# Stock Tracker

A web app for tracking stock portfolios.

- **Every listed security.** Search stocks, ETFs and mutual funds on all major exchanges by name or ticker. The Explore tab also shows the day's most active stocks, top gainers and top losers.
- **Portfolios.** Create as many portfolios as you like, or pick **All portfolios** to see everything combined in one currency. Add a short note to any holding (e.g. "sell at 250") to keep your plan next to the numbers. Each portfolio has a base currency, and holdings in other currencies are converted at live FX rates.
- **Trades and full history.** Record buys and sells (including partial sells and buying more), dividends, and cash deposits and withdrawals, on any date, so you can backfill your whole history. Backdated trades are prefilled with that day's closing price. Holdings, average cost (fees included), realized gains and cash balances are all worked out from the trades. A sell that would exceed the shares held on that date is rejected.
- **Cash.** Deposit cash, then choose per trade whether it's paid from (or paid into) the cash balance. Cash shows up as a holding and in the allocation chart.
- **Gain by year.** For every calendar year: value at the start and end, money put in or taken out, the gain (including positions sold during the year and dividends), the return, and realized gains.
- **Key metrics.** Totals for value, today's change, unrealized and realized gain, and value-weighted dividend yield. For each holding: price, day change, value, weight, gain/loss, market cap, P/E, EPS, dividend yield and 52-week range. Click a ticker to see more, such as forward P/E, price/book, volume, and expense ratio and top holdings for funds.
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
- Yearly gain = value at year end − value at year start − net money added. Past values use 31 December closing prices from Yahoo, converted at that day's exchange rate. Realized gains use the average-cost method.
- Stock splits aren't applied to your share counts automatically. After a split, record it as a sell of the old shares and a buy of the new ones at the same total value (or edit your past trades to split-adjusted numbers).
- Holdings added before trade tracking existed were turned into buys dated the day you first opened this version. Edit their date and price under Transactions to make the yearly figures accurate.
- London (GBp) and other minor-unit listings are converted to whole currency units. Enter average cost in the same units the price is quoted in.

## Layout

```
api/index.ts       Vercel serverless entry point
server/            Express API (search, quotes, FX, price history, fund holdings, screeners, sync) with an in-memory cache
  store.ts         Sync storage: Upstash Redis or local JSON files
  providers/       yahoo.ts (live data) and demo.ts (offline sample data)
shared/types.ts    Types shared by server and client
src/lib/           ledger.ts (trades → holdings, cost, realized gains, cash), performance.ts (gain by year),
                   portfolio.ts (valuation, allocation), API client, portfolio store with sync — all with tests
src/components/    React UI
```
