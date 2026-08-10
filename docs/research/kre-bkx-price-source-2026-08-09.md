# KRE / BKX Price Source — findings (2026-08-09)

Result of wayfinder ticket **KRE / BKX price source**: the exact yfinance
source for the two banking equity cards on the reference `/banking` page.

## The two tickers (verified live from this host)

| Card | Display (reference) | yfinance symbol | Last | 1D chg | Notes |
|---|---|---|---|---|---|
| KRE | KRE (Regional Banks) | `KRE` | 76.21 | -0.37% | ✅ SPDR S&P Regional Banking ETF, works as-is |
| BKX | BKX (KBW Banks) | **`^BKX`** | 189.99 | +0.17% | ✅ KBW Nasdaq Bank Index — the **caret form is required** |

## Why `^BKX`, not `BKX`

`BKX` (no caret) returns **"possibly delisted; no price data found"** in
yfinance — checked at period=5d, 1mo and 3mo; it consistently yields zero
rows. The reference page labels the card "BKX (KBW Banks)" and BKX is an
*index* (not an ETF), so the index symbol `^BKX` is both the correct
instrument and the one that actually resolves. `Ticker("^BKX").fast_info.last_price`
works (189.99 on 2026-08-09).

## Fetch recipe (matches the app's yfinance pattern)

```python
import yfinance as yf

def _banking_prices() -> dict:
    out = {}
    for sym in ("KRE", "^BKX"):
        h = yf.Ticker(sym).history(period="5d")
        if len(h) < 2:
            out[sym] = None  # never fabricate
            continue
        last = h["Close"].iloc[-1]
        prev = h["Close"].iloc[-2]
        out[sym] = {"price": round(float(last), 2),
                    "change_pct": round((last - prev) / prev * 100, 2)}
    return out
```

- 1D change computed from the last two daily closes (same convention as
  macro_service's `_fill_from_yfinance`).
- `period="5d"` is enough for price + 1D change; a longer window (e.g. 3mo)
  is available for a sparkline if the frontend wants one (reference's
  `market_prices` carries a sparkline, but it is optional for parity — the
  stat cards only display price + 1D %).
- Fallbacks if KRE/BKX ever fail: `KBE` (SPDR Bank ETF, 69.97, -0.26%) and
  `XLF` (Financial Select SPDR, 57.60, -0.36%) both resolve — but the
  reference names KRE and BKX specifically, so use them first.

## Implications for the backend ticket

- Add `KRE` and `^BKX` to the banking payload fetch (yfinance, parallel with
  the existing fetchers — the macro dashboard's parallel-wave lesson).
- No new dependency; same `yf.Ticker().history()` call the app already uses.
