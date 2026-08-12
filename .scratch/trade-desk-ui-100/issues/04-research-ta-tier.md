# 04 — Research: TA signals + TIER algorithm

Type: research
Status: closed
Claimed: hermes/2026-08-12

## Answer

Deliverable: `docs/research/trade-desk-ta-tier-2026-08-12.md`

**TA signals**: 8 types observed — bull trend±12, golden cross+8~15, pullback+8~10, box top-5/bottom+10
**Scoring**: +15(max bullish) to -12(max bearish). 0 = neutral
**Arrows**: ↑ bullish, ↓ bearish, · neutral, ↔ ranging
**TIER**: 1 (BTC/ETH), 2 (SOL/SP500/GOLD), 3 (small caps) — based on volume percentile

**Implementation plan**: add `compute_ta_signals()` + `compute_tier()` to hyperliquid_service.py using mark_price, prev_day_px, MA, ATR.
