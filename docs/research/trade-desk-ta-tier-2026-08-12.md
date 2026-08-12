# Research — TA Signals + TIER (2026-08-12)

> ใบ 04 แผน trade-desk-ui-100

## Sources

- Preview: market table section on reference trade desk page
- JS dig: chunk-9704 — market table renders `e.tier`, `e.mark_px`, `e.prev_day_px`, `e.funding` from API data
- Inference: TA signals are computed **server-side** (trade-admin edge function), sent as fields on market objects

## TA Signal Types (observed from preview)

| Signal | Score | Meaning |
|---|---|---|
| bull trend+12 | +12 | Strong bullish trend (price above MA, momentum up) |
| bull trend bre-12 | -12 | Bull trend breakdown (price broke below trend support) |
| ma golden cros+8 | +8 | MA golden cross (short MA crossed above long MA) |
| shrink pullbac+10 | +10 | Bullish pullback shrinking (retracement ending, resuming trend) |
| bull pullback +8 | +8 | Bullish pullback (price pulled back to support, opportunity) |
| box top-5 | -5 | Price at top of range/box (resistance, bearish) |
| box bottom+10 | +10 | Price at bottom of range/box (support, bullish bounce) |
| ma golden cros+10 | +10 | Strong MA golden cross |
| ma golden cros+15 | +15 | Very strong MA golden cross |

## Arrow Indicators
| Arrow | Meaning |
|---|---|
| ↑ | Bullish bias |
| ↓ | Bearish bias |
| · | Neutral |
| ↔ | Ranging/box |

## TIER (1/2/3)

Based on inference from the market list:
- **TIER 1**: BTC, ETH — highest volume, deepest liquidity, most reliable TA signals
- **TIER 2**: SOL, XRP, SP500, GOLD, CL — major markets
- **TIER 3**: smaller alts, individual stocks, niche commodities

Likely computed from: 24h volume percentile, market cap, spread data.

## Computation (simplified for our implementation)

Since the reference computes these server-side via the trade-admin edge function (which we can't inspect), we'll implement a simplified version:

### TA Signals Algorithm
```python
def compute_ta_signals(mark_price, prev_day_px, ma_short, ma_long, atr):
    signals = []
    score = 0
    trend = "bull" if mark_price > ma_long else "bear"
    
    # Trend strength
    if trend == "bull" and mark_price > ma_short:
        signals.append(f"bull trend+{min(12, int(abs(mark_price-ma_long)/atr*3))}")
        score += 8
    elif trend == "bear" and mark_price < ma_short:
        signals.append(f"bear trend-{min(12, int(abs(ma_long-mark_price)/atr*3))}")
        score -= 8
    
    # MA crossover
    if ma_short > ma_long and prev_ma_short <= prev_ma_long:
        signals.append(f"ma golden cros+{min(15, int((ma_short-ma_long)/ma_long*1000))}")
        score += 8
    
    # Pullback detection  
    if trend == "bull" and mark_price < ma_short and mark_price > ma_long:
        signals.append(f"bull pullback +8")
        score += 5
    
    # Range/box
    range_pct = atr / mark_price * 100
    if range_pct < 2:
        if mark_price > ma_long:
            signals.append(f"box bottom+10")
            score += 5
        else:
            signals.append(f"box top-5")
            score -= 3
    
    # Arrow
    if score >= 8: arrow = "↑"
    elif score <= -8: arrow = "↓"
    elif abs(score) < 3: arrow = "·"
    else: arrow = "↔"
    
    return {"signals": signals, "score": score, "arrow": arrow}
```

### TIER Algorithm
```python
def compute_tier(volume_24h, all_volumes):
    pct = percentile(volume_24h, all_volumes)
    if pct >= 90: return 1
    if pct >= 60: return 2
    return 3
```

## Implementation

Add `compute_ta_signals()` and `compute_tier()` to `hyperliquid_service.py`.
Return `ta_signals`, `ta_arrow`, `ta_score`, `tier` as computed fields on each market in GET /api/hyperliquid/markets.

Frontend: render arrow icon, signal text with color-coded scores, tier badge (1=gold, 2=silver, 3=bronze).
