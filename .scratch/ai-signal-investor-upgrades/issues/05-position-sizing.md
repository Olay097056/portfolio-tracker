Type: task
Status: resolved

## Question

Turn the existing entry/target/stop-loss trading setup into a concrete "how many shares" recommendation. Decisions already locked (see map Notes): user picks which portfolio to size against (dropdown), and sets a configurable risk-per-trade % (not hardcoded).

Implementation:
1. UI: a small control near the existing Trading Setup cards in `DashboardPage.tsx` — a portfolio picker (reuse whatever the app already uses to list the user's portfolios) and a risk-% input (suggest defaulting the input to 1% with a visible note that it's adjustable, not silently fixed).
2. Formula (standard position sizing, not something to redesign): `risk_amount = portfolio.cash_usd * (risk_pct / 100)`; `risk_per_share = entry_price - stop_loss_price` (from the existing `aiSignal.tradingSetup`); `shares = floor(risk_amount / risk_per_share)`. Guard division by zero / a stop-loss at or above entry (shouldn't happen given `calcTradingSetup`'s existing clamps, but don't trust that blindly here — show a clear "-" rather than Infinity/NaN if it does).
3. Decide whether sizing is computed against `cash_usd` alone or against total portfolio value (`cash_usd` + current holdings' market value) — cash-only is simpler and avoids needing a live portfolio valuation call from this component; recommend cash-only unless it looks wrong once real portfolios have holdings in them.
4. No portfolios exist yet in this app's data today — the empty state (no portfolio to pick) should be handled gracefully, not crash or show a broken dropdown.

## Answer

Built as scoped: `frontend/src/components/PositionSizingCalculator.tsx` — portfolio dropdown (reuses `usePortfolios()`, already loaded in `DashboardPage.tsx`, no new fetch) + a risk-% number input (starts at 1%, freely adjustable, never silently fixed). Formula exactly as specified: `risk_amount = cash_usd * risk_pct/100`, `risk_per_share = entryZone.max - stopLoss.price`, `shares = floor(risk_amount / risk_per_share)`. Sized against `cash_usd` alone (not total portfolio value), per the ticket's recommended default. Guards a non-positive `risk_per_share` (stop at/above entry) with an explicit "คำนวณไม่ได้" message — never NaN/Infinity. Empty-portfolios state handled explicitly ("ยังไม่มีพอร์ต — สร้างพอร์ตก่อน").

Tests: 5 in `PositionSizingCalculator.test.tsx` (empty state, default-portfolio math, portfolio switch, risk-% adjustment, the divide-by-zero guard) — all passing. Full suites: backend 275/275; frontend 470/471 (1 failure was the same pre-existing flaky drag-zone timing test seen earlier in this session, confirmed passing in isolation — not a regression).

**Verified live with real data**: created a test portfolio ($10,000 cash) via a direct API call (the on-page "+ Add portfolio" form didn't submit through browser-automation's synthetic events — a tooling quirk, not a code bug in this ticket's scope) and confirmed the empty state, the portfolio-selected state, and the exact arithmetic against real NVDA data: entry $219.22, stop $192.51 → risk/share $26.71, 1% of $10,000 = $100 risk → 3 shares (`floor(100/26.71)`), $657.66 total cost (3 × $219.22) — matched by hand.

