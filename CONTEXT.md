# Portfolio Tracker

A single-user web app for tracking a US stock/ETF investment portfolio: holdings, live pricing, rebalancing, and forward-looking calculators.

## Language

**DCA calculator**:
Recalculates a holding's average cost after adding more shares at the current price, using shares already held. Backed by `frontend/src/utils/dca.ts` / `DcaCalculator.tsx`.
_Avoid_: DCA Projection (a different concept — see below)

**DCA Projection**:
A forward-looking compound-growth projection over N years, driven by an assumed dividend yield % and price growth % (not tied to shares you currently hold). Ported in from the stockvision-app merge.
_Avoid_: DCA calculator (a different concept — see above)
