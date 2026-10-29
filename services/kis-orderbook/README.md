# HFM KIS realtime order book worker

This is a **separate** persistent Railway Node service. Do not modify or migrate the legacy Railway Postgres database. The worker must connect to **the same Neon PostgreSQL** instance used by HFM KOREA member site.

## Railway configuration
- Root directory: `/services/kis-orderbook`
- Start command: `npm start`
- Required environment variables (set in Railway UI, never commit values):
  - `DATABASE_URL` — HFM Neon URL with minimum necessary permissions
  - `KIS_APP_KEY` — official market-data application key
  - `KIS_APP_SECRET` — matching secret
  - `KIS_WS_URL` — optional; default `ws://ops.koreainvestment.com:21000`
- Runtime Node.js 22+.

The worker maintains one KIS H0STASP0 WebSocket connection and subscribed symbols seen in the last 90 seconds. Incoming data is written to `km_kis_orderbook_live` in Neon. Existing Vercel `/api/stocks/orderbook` serves only snapshots newer than eight seconds; otherwise it falls back to existing REST KIS order book. Browser reads update every two seconds when live snapshots are available, otherwise use 15-second REST fallback.

No KIS order calls or external trades are made. KIS redistribution rights and operational permissions must be verified before enabling for users.

## Verification
1. Configure required values and deploy worker.
2. View worker log for WebSocket subscription and connection status.
3. Load stock symbol 005930 on the member site, confirm active subscriptions and live snapshots.
4. Switch symbols; verify old symbol is unsubscribed after 90 seconds.
5. Disconnect worker; verify REST fallback and no stale quotes.
