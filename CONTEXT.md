# Portfolio Tracker

A single-user web app for tracking a US stock/ETF investment portfolio: holdings, live pricing, rebalancing, and forward-looking calculators.

## Language

**DCA calculator**:
Recalculates a holding's average cost after adding more shares at the current price, using shares already held. Backed by `frontend/src/utils/dca.ts` / `DcaCalculator.tsx`.
_Avoid_: DCA Projection (a different concept — see below)

**DCA Projection**:
A forward-looking compound-growth projection over N years, driven by an assumed dividend yield % and price growth % (not tied to shares you currently hold). Ported in from the stockvision-app merge.
_Avoid_: DCA calculator (a different concept — see above)

**Watchlist**:
A list of tickers the user is following but does not own. It carries no share count and no cost basis. It is the scanning universe every Scanner works over.
_Avoid_: Portfolio (what the user actually owns — has shares and average cost)

**Scanner**:
A tab that fetches market data for every ticker in the Watchlist and presents computed signals across all of them at once.
_Avoid_: calculator (a Tools tab that takes user-entered assumptions and projects forward; fetches no market data per ticker)

**Raw signal**:
One numeric measurement with a single traceable source, shown as its own sortable column. Deliberately never folded together with other signals into a single number.
_Avoid_: score (implies a validated weighting that this project does not have)

**Pre-squeeze**:
A state where a ticker's volatility has contracted relative to *its own* recent history — not relative to other tickers.
_Avoid_: relative strength / momentum (a comparison against other tickers or the market, not a ticker's own history)
