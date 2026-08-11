Label: wayfinder:map
Status: complete

## Destination

Five investor-requested enhancements on top of the now-shipped AI Technical Signal feature (see the prior, complete map at [.scratch/ai-signal-upgrade/map.md](../ai-signal-upgrade/map.md) — this is a fresh, separate effort building on that work, not reopening it):

1. **Per-ticker historical pattern lookup**: "has NVDA been in a situation like this before, and how did it turn out?" — surface the currently-selected ticker's own history, not just the aggregate 31-basket backtest finding.
2. **Accuracy disclosure**: show the fitted model's real historical accuracy (from the existing backtest) directly in the UI, so the confidence score isn't presented with more certainty than it's earned.
3. **Earnings-date awareness**: warn when an upcoming earnings report could invalidate a purely technical read.
4. **AI track-record accountability**: log every AI narrative call made, later resolve whether it was right, and show the tally — self-correcting trust instead of a black box.
5. **Position-sizing guidance**: turn the existing entry/target/stop into a concrete "how many shares" recommendation, sized against a chosen portfolio's cash and a configurable risk-per-trade %.

Reaching the end of this map means: all five are implemented, wired into the live dashboard, and verified working with real data — working code, not a spec.

## Notes

- Domain: personal finance / stock technical analysis (same as the prior map).
- Skills to consult: `/grilling`, `/domain-modeling` for design tickets.
- **This map carries execution** — same standing decision as the prior map; tickets build real working code.
- **Locked decisions** (resolved via direct confirmation before charting, not re-litigated in tickets):
  - Item 4's "was the AI right?" check uses the **same hit-target-before-stop definition** the backtest engine already uses (see the prior map's ticket 03/06) — not a new success metric.
  - Item 5 lets the user **pick which portfolio** to size against (dropdown) and set a **configurable risk-per-trade %** (not a hardcoded default) — the app has multiple portfolios, defaulting to "the first one" would risk sizing against the wrong account.
- **Fact found while charting**: yfinance already exposes earnings-date data via `Ticker(...).calendar` / `.earnings_dates` (verified live against NVDA) — item 3 needs no new external data source or API integration.
- Backend/architecture precedent to reuse, not reinvent: `backend/app/backtest/` (walk-forward engine, indicator port) for item 1; `backend/app/models.py`'s `Portfolio`/`Holding` (has `cash_usd`) for item 5.

## Decisions so far

- [แสดงความแม่นยำจริงในอดีต](issues/02-accuracy-disclosure.md) — always-visible muted line under the confidence score bar, numbers read from `model_fit_report.md`: "แม่นยำในอดีตประมาณ 62-63%... ไม่ใช่การรับประกันผลในอนาคต". 29/29 → verified live.
- [เตือนวันประกาศงบ](issues/03-earnings-awareness.md) — `earnings_service.py` wraps `yfinance.Ticker().calendar` (confirmed working, no new API needed), new `GET /market-data/earnings` endpoint, amber chip in Live Indicators when earnings fall within 14 days. Verified live against real NVDA data (21 days out → correctly no chip).
- [Position Sizing](issues/05-position-sizing.md) — `PositionSizingCalculator.tsx`: portfolio dropdown + adjustable risk-%, `shares = floor(cash_usd*risk_pct/100 / (entry-stop))`, sized against cash only. Verified live with real portfolio + real NVDA data, arithmetic matched by hand (3 shares, $657.66, $100 risk).
- [ออกแบบวิธี pattern-match backtest เฉพาะหุ้น](issues/01-per-ticker-pattern-methodology.md) — match on `signal_type` badge (broad, primary) + supplementary exact-conflict count when a conflict is active; computed live on-demand (~2-5s, bounded to 10-12y history, not "max"); shows count/win-rate/avg-win-loss (reuses existing expectancy logic); minimum 5 occurrences before showing a %. Graduated into [เพิ่ม pattern-match lookup เฉพาะหุ้นจริง](issues/06-per-ticker-pattern-implementation.md).
- [เพิ่ม pattern-match lookup เฉพาะหุ้นจริง](issues/06-per-ticker-pattern-implementation.md) — **DONE, shipped.** `per_ticker_lookup.py` (~0.9s per call, real-tested), separate `GET /ai-narrative/pattern-history` endpoint (works independently of Ollama), triggered once the AI narrative call succeeds. Verified live: NVDA showed "1720 ครั้ง, ชนะ 82%", matching a standalone test exactly. Backend 285/285, frontend 477/477.

## Not yet specified

*(none — every ticket the map surfaced has resolved or been ruled out of scope; see Decisions so far / Out of scope)*

## Out of scope

- **Item 4, AI track-record accountability** — [ออกแบบระบบติดตาม track record](issues/04-track-record-methodology.md) closed unresolved: after the ticket's scope (logging every call, resolving outcomes later, showing a tally) was explained back to the user, they decided not to pursue it. Items 1/2/3/5 all shipped as planned; this is the one destination item dropped, not a resolved decision.
