Type: task
Status: resolved

## Question

Warn the user when an upcoming earnings report could invalidate a purely technical read. Data source confirmed while charting this map: `yfinance.Ticker(ticker).calendar` (has `"Earnings Date"`) and `.earnings_dates` both work today with no new API/key needed — verified live against NVDA.

Implementation:
1. Backend: a small function (likely alongside `backend/app/price_service.py` or a new `earnings_service.py`, following that module's existing yfinance-wrapping + caching pattern) that returns the next earnings date for a ticker, or `None` if unavailable/unknown.
2. Expose it via an existing or new lightweight endpoint (check whether it's cheap enough to fold into an existing chart/price call rather than a new round-trip).
3. Frontend: a warning chip near the existing "Live Indicators" row in `DashboardPage.tsx` when the next earnings date falls within a near-term window — recommend 14 calendar days as the default "upcoming" threshold (roughly two weeks — close enough to matter for a technical setup with an ATR-based stop/target measured in days, not months), but treat this as adjustable, not sacred, if it looks wrong once real dates are visible.
4. No earnings date found (e.g. delisted, some ETFs) should render nothing, not an error or a "N/A" chip cluttering the row.

## Answer

Built exactly as scoped:
1. `backend/app/earnings_service.py` — `get_next_earnings_date(ticker)`, TTL-cached (24h) following `price_service.py`'s pattern, wraps `yfinance.Ticker(ticker).calendar["Earnings Date"]` (handles both single-date and date-range shapes yfinance can return; takes the earliest). Returns `None` on any failure (delisted, ETF with no earnings, etc.) — no exceptions escape.
2. New endpoint `GET /market-data/earnings?ticker=X` (`backend/app/routers/market_data.py`) returning `{ticker, next_earnings_date, days_until}`, nulls when unknown.
3. Frontend: `getNextEarnings()` in `api/client.ts`, fetched on ticker change in `DashboardPage.tsx`, rendered as a `badge-amber` chip ("📅 ประกาศงบใน N วัน — ระวังความผันผวน") in the Live Indicators row when `0 <= days_until <= 14` (the recommended default threshold, used as-is — nothing suggested it needed adjusting).
4. Fetch failures/no-data are silently swallowed (`setNextEarnings(null)`) — matches the ticket's "render nothing, not an error" requirement.

Tests: 8 in `test_earnings_service.py`, 2 in `test_market_data_router.py`, 3 in `DashboardPage.test.tsx` (chip shown / chip hidden outside window / chip hidden when no earnings data). Full suites: backend 275/275, frontend 466/466 (up from 462, +4 new: 3 earnings chip tests + the accuracy-disclosure test from ticket 02).

**Verified live**, not just mocked: called through the real running app for NVDA — `GET /market-data/earnings?ticker=NVDA` → 200 OK, `next_earnings_date: 2026-08-27` (21 days out) — chip correctly does NOT render since 21 > 14, confirming the threshold logic against real yfinance data, not just the test fixtures.

