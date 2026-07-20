Type: prototype
Blocked by: 03
Status: resolved

## Question

What should the main dashboard screen look like and how should it behave?

Build a rough, clickable mockup of the primary layout (portfolio summary sidebar, selected-stock chart panel with S/R overlays, holding detail / add-to-portfolio panel, rebalancing calculator) informed by the wethaiinvest.com and Google Finance layouts, adapted to this app's confirmed v1 scope. Resolve open layout questions (panel placement, information density, dark theme palette) by reacting to the mockup.

## Answer

Three structurally different variants were built as a throwaway, switchable static HTML mockup: [prototype-06-dashboard/index.html](../prototype-06-dashboard/index.html) (`?variant=A|B|C`).

- **A — Trading terminal, fixed 3-column** (portfolio/holdings/watchlist sidebar left, chart center, manage-holding + DCA calculator panel right): closest to the wethaiinvest.com reference layout, always-visible panels.
- **B — Top summary strip + tabs, single column**: totals/alerts strip up top, Overview/Holdings/Chart/Watchlist as tabs.
- **C — Modular card grid** (Mint/YNAB-style): independent cards for value, alerts, watchlist, holdings, DCA calculator, and chart, no persistent chrome.

**Chosen: Variant A** (fixed 3-column trading-terminal layout). This is the layout the v1 spec's UI section should describe: left sidebar (portfolio switcher + total value + currency toggle, holdings list with rebalance-severity color bars per ticket 04, watchlist below), center panel (selected ticker header, range/interval controls, price chart with auto/manual S/R overlay per ticket 02), right sidebar (manage-holding form, DCA/average-cost calculator per the confirmed schema in ticket 03).

The prototype file is kept as a reference asset in `.scratch/planning/` — not production code; it should be rewritten properly (React + TradingView Lightweight Charts per the Destination's stack) when the app is actually built.
