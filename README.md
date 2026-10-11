# Stock Tracker

A web app for tracking stock portfolios.

- **Every listed security.** Search stocks, ETFs and mutual funds on all major exchanges by name or ticker. The Explore tab also shows the day's most active stocks, top gainers and top losers.
- **Portfolios.** Create as many portfolios as you like, add holdings (shares plus an optional average cost) and edit or remove them. Each portfolio has a base currency, and holdings in other currencies are converted at live FX rates.
- **Key metrics.** Totals for value, today's change, gain/loss and value-weighted dividend yield. For each holding: price, day change, value, weight, gain/loss, market cap, P/E, EPS, dividend yield and 52-week range. Click a ticker to see more, such as forward P/E, price/book, volume, and expense ratio and top holdings for funds.
- **Allocation chart.** A donut chart and ranked list showing what share of the portfolio each position makes up. If the portfolio holds ETFs or funds, a toggle switches between showing **each fund as one slice** and **splitting funds into the stocks they hold**. In the split view, a stock held both directly and through a fund is merged into one slice. Hover a slice to see where it comes from.

Market data comes from Yahoo Finance through the [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) library. Portfolios are saved in your browser's localStorage.

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

## Notes and limitations

- Yahoo Finance has no official API; quotes may be delayed and fields vary by security.
- Fund breakdowns use the **top 10 holdings** Yahoo reports for each fund. The rest of the fund is shown as a "<fund> · other" slice, and the chart notes how much of each fund is covered.
- London (GBp) and other minor-unit listings are converted to whole currency units. Enter average cost in the same units the price is quoted in.

## Layout

```
server/            Express API (search, quotes, FX, fund holdings, screeners) with an in-memory cache
  providers/       yahoo.ts (live data) and demo.ts (offline sample data)
shared/types.ts    Types shared by server and client
src/lib/           Portfolio maths (portfolio.ts + tests), API client, localStorage store
src/components/    React UI
```
