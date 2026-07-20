Type: grilling
Status: resolved

## Question

How does USD/THB conversion work in the app?

Decide the exchange-rate source (free FX API vs. a manually-entered rate), how often it refreshes, and everywhere it needs to appear (portfolio total value, per-holding cost basis, P&L) given the app's base currency is USD but the user thinks in THB.

## Answer

**Source**: a free FX API (e.g. exchangerate-api.com or Frankfurter — no key needed), with a manual-override fallback field in case the API is unreachable (mirrors the "1 USD = 33.611 THB" readout already shown in the reference UI).

**Refresh cadence**: once per day, cached — not re-fetched on every page load; FX rates don't move fast enough to justify real-time polling for a tracking tool.

**Where it applies**: only at the **portfolio-level summary** — total portfolio value and total P&L get a THB/USD toggle. Per-holding numbers (avg cost, current price, per-share P&L) stay in USD always, since the underlying market data is USD-native; converting every individual figure would add noise without adding value for a tracking tool.
