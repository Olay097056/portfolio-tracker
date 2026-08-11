# backend/scratch_ta_prototype.py
"""TA scoring prototype — ticket 03.

Recomputes the reference site's ta_snapshot (6 conditions, ta_score 0-100)
from 60 daily candles and compares against the REAL values captured from the
reference Supabase `trading_signals.ta_snapshot` (2026-08-05..07).

Run:  python scratch_ta_prototype.py   (from backend/, venv activated)
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta

import yfinance as yf

# ---------------------------------------------------------------------------
# Reference values captured from Supabase trading_signals (2026-08-08)
# asset -> dict(entry, ta_score, conditions{key:(score,max)}, indicators{...})
# ---------------------------------------------------------------------------
REF: dict[str, dict] = {
    "US30": {
        "yf": "^DJI", "dir": "long", "entry": 54012.37, "ta": 83,
        "created": "2026-08-07",
        "rsi": 63.6, "ema20": 52864.98, "sma50": 52056.16,
        "stoch": (77.1, 79.3), "atr14": 631.9,
        "bb": (52653.09, 51049.69, 54256.49),
        "macd": (520.62, 346.80, 173.81, 175.64),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 20,
                  "macd_state": 10, "bb_room": 20, "stoch_confirm": 7.5},
    },
    "NAS100": {
        "yf": "^NDX", "dir": "long", "entry": 29692.17, "ta": 73,
        "created": "2026-08-05",
        "rsi": 57.3, "ema20": 28843.47, "sma50": 29390.97,
        "stoch": (90.8, 82.9), "atr14": 634.3,
        "bb": (28822.08, 27355.16, 30289.01),
        "macd": (-137.03, -291.62, 154.59, 89.70),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 0, "rsi_zone": 20,
                  "macd_state": 20, "bb_room": 10, "stoch_confirm": 7.5},
    },
    "USDJPY": {
        "yf": "JPY=X", "dir": "short", "entry": 157.67, "ta": 63,
        "created": "2026-08-05",
        "rsi": 25.4, "ema20": 161.23, "sma50": 161.29,
        "stoch": (27.4, 26.7), "atr14": 1.41,
        "bb": (161.92, 157.93, 165.92),
        "macd": (-0.66, 0.10, -0.75, -0.69),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 0,
                  "macd_state": 20, "bb_room": 10, "stoch_confirm": 7.5},
    },
    "US500": {
        "yf": "^GSPC", "dir": "long", "entry": 7653.5, "ta": 83,
        "created": "2026-08-06",
        "rsi": 62.6, "ema20": 7487.07, "sma50": 7479.11,
        "stoch": (100.0, 87.5), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 20,
                  "macd_state": 20, "bb_room": 10, "stoch_confirm": 7.5},
    },
    "XAUUSD": {
        "yf": "GC=F", "dir": "long", "entry": 4012, "ta": 65,
        "created": "2026-08-06",
        "rsi": 40.0, "ema20": None, "sma50": None,
        "stoch": (20.9, 17.3), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 10,
                  "macd_state": 20, "bb_room": 20, "stoch_confirm": 15},
    },
    "USOIL": {
        "yf": "CL=F", "dir": "long", "entry": 87.379, "ta": 90,
        "created": "2026-08-05",
        "rsi": 57.4, "ema20": 82.13, "sma50": 82.25,
        "stoch": (57.4, 56.7), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 0, "rsi_zone": 20,
                  "macd_state": 20, "bb_room": 20, "stoch_confirm": 15},
    },
    "EURUSD": {
        "yf": "EURUSD=X", "dir": "long", "entry": 1.1508, "ta": 73,
        "created": "2026-08-05",
        "rsi": 59.0, "ema20": 1.14, "sma50": 1.15,
        "stoch": (85.6, 58.0), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 0, "rsi_zone": 20,
                  "macd_state": 20, "bb_room": 10, "stoch_confirm": 7.5},
    },
    "GBPUSD": {
        "yf": "GBPUSD=X", "dir": "long", "entry": 1.3432, "ta": 80,
        "created": "2026-08-05",
        "rsi": 55.0, "ema20": 1.34, "sma50": 1.34,
        "stoch": (58.4, 23.3), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 20,
                  "macd_state": 10, "bb_room": 10, "stoch_confirm": 15},
    },
    "BTC": {
        "yf": "BTC-USD", "dir": "long", "entry": 64409.92, "ta": 73,
        "created": "2026-08-05",
        "rsi": 50.3, "ema20": 64281.22, "sma50": 63176.91,
        "stoch": (51.4, 53.5), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 20,
                  "macd_state": 10, "bb_room": 10, "stoch_confirm": 7.5},
    },
    "DXY": {
        "yf": "DX-Y.NYB", "dir": "long", "entry": 104.32, "ta": 58,
        "created": "2026-08-06",
        "rsi": 49.9, "ema20": None, "sma50": None,
        "stoch": (20.3, 20.6), "atr14": None,
        "bb": (None, None, None),
        "macd": (None, None, None, None),
        "conds": {"price_vs_ema20": 15, "ema20_vs_sma50": 10, "rsi_zone": 20,
                  "macd_state": 0, "bb_room": 20, "stoch_confirm": 7.5},
    },
}

# The reference captured entries on their signal dates; yfinance data ends
# today, so compute on the LAST 60 daily candles ending at the signal date.
SIGNAL_DATE = "2026-08-07"  # fallback when an asset has no created date


# ---------------------------------------------------------------------------
# Indicator math (pure python, no TA-lib dependency)
# ---------------------------------------------------------------------------
def ema(values: list[float], span: int) -> list[float]:
    out, k = [], 2.0 / (span + 1)
    prev = None
    for v in values:
        prev = v if prev is None else v * k + prev * (1 - k)
        out.append(prev)
    return out


def sma(values: list[float], window: int) -> list[float]:
    out = []
    for i in range(len(values)):
        if i + 1 < window:
            out.append(None)
        else:
            out.append(sum(values[i + 1 - window:i + 1]) / window)
    return out


def rsi14(closes: list[float]) -> list[float]:
    out = [None] * len(closes)
    gains, losses = [], []
    for i in range(1, len(closes)):
        chg = closes[i] - closes[i - 1]
        gains.append(max(chg, 0.0))
        losses.append(max(-chg, 0.0))
        if i >= 14:
            ag = sum(gains[i - 14:i]) / 14
            al = sum(losses[i - 14:i]) / 14
            out[i] = 100.0 if al == 0 else 100 - 100 / (1 + ag / al)
    return out


def macd(closes: list[float], fast=12, slow=26, signal=9):
    ef, es = ema(closes, fast), ema(closes, slow)
    line = [a - b for a, b in zip(ef, es)]
    sig = ema(line, signal)
    hist = [a - b for a, b in zip(line, sig)]
    return line, sig, hist


def bollinger(closes: list[float], window=20, mult=2.0):
    mid, up, lo = [], [], []
    for i in range(len(closes)):
        if i + 1 < window:
            mid.append(None); up.append(None); lo.append(None)
            continue
        win = closes[i + 1 - window:i + 1]
        m = sum(win) / window
        var = sum((x - m) ** 2 for x in win) / window
        sd = var ** 0.5
        mid.append(m); up.append(m + mult * sd); lo.append(m - mult * sd)
    return mid, up, lo


def atr14(highs, lows, closes) -> list[float]:
    out = [None] * len(closes)
    trs = []
    for i in range(1, len(closes)):
        tr = max(highs[i] - lows[i],
                 abs(highs[i] - closes[i - 1]),
                 abs(lows[i] - closes[i - 1]))
        trs.append(tr)
        if len(trs) >= 14:
            out[i] = sum(trs[-14:]) / 14
    return out


def stoch(highs, lows, closes, k_period=14, k_smooth=3, d_period=3):
    k_raw, k_out, d_out = [], [], []
    for i in range(len(closes)):
        if i + 1 < k_period:
            k_raw.append(None); k_out.append(None); d_out.append(None)
            continue
        hh = max(highs[i + 1 - k_period:i + 1])
        ll = min(lows[i + 1 - k_period:i + 1])
        k_raw.append(100.0 if hh == ll else (closes[i] - ll) / (hh - ll) * 100)
    # smooth %K (3-period SMA), then %D (3-period SMA of %K)
    for i in range(len(k_raw)):
        if k_raw[i] is None:
            k_out.append(None); d_out.append(None)
            continue
        if i + 1 >= k_smooth:
            kk = sum(x for x in k_raw[i + 1 - k_smooth:i + 1] if x is not None) / k_smooth
        else:
            kk = k_raw[i]
        k_out.append(kk)
        vals = [x for x in k_out if x is not None]
        if len(vals) >= d_period:
            d_out.append(sum(vals[-d_period:]) / d_period)
        else:
            d_out.append(None)
    return k_out, d_out


def swing_levels(highs, lows, lookback=10):
    """Fractal swing highs/lows: a bar whose high exceeds the N bars on each
    side is a swing high; symmetric for lows. Returns (resistances, supports)
    above/below the current price, most recent first."""
    n = len(highs)
    piv_hi, piv_lo = [], []
    for i in range(lookback, n - lookback):
        win_h = highs[i - lookback:i] + highs[i + 1:i + 1 + lookback]
        win_l = lows[i - lookback:i] + lows[i + 1:i + 1 + lookback]
        if highs[i] > max(win_h):
            piv_hi.append((i, highs[i]))
        if lows[i] < min(win_l):
            piv_lo.append((i, lows[i]))
    price = (highs[-1] + lows[-1]) / 2
    res = sorted({h for _, h in piv_hi if h > price}, reverse=True)[:3]
    sup = sorted({l for _, l in piv_lo if l < price}, reverse=True)[:3]
    return res, sup


# ---------------------------------------------------------------------------
# Condition scoring (rules inferred from 15 reference snapshots)
# ---------------------------------------------------------------------------
def score_price_vs_ema20(price, ema20v, direction):
    if price is None or ema20v is None:
        return 0, "—"
    above = price >= ema20v
    good = above if direction == "long" else not above
    return (15, f"{price:.4g} vs EMA20 {ema20v:.4g}") if good else (0, f"{price:.4g} vs EMA20 {ema20v:.4g}")


def score_ema_vs_sma(ema20v, sma50v, direction):
    if ema20v is None or sma50v is None:
        return 0, "—"
    good = (ema20v >= sma50v) if direction == "long" else (ema20v <= sma50v)
    return (10, f"EMA20 {ema20v:.4g} vs SMA50 {sma50v:.4g}") if good else (0, f"EMA20 {ema20v:.4g} vs SMA50 {sma50v:.4g}")


def score_rsi_zone(rsi, direction):
    if rsi is None:
        return 0, "—"
    # Reference data: RSI 25.4 -> 0, 40.0 -> 10, 41.9 -> 10, 47.4-63.6 -> 20
    if rsi < 30 or rsi > 75:
        return 0, f"RSI {rsi:.1f}"
    if rsi < 45 or rsi > 68:
        return 10, f"RSI {rsi:.1f}"
    return 20, f"RSI {rsi:.1f}"


def score_macd_state(line, sig, hist, hist_prev, direction):
    if line is None or sig is None or hist is None or hist_prev is None:
        return 0, "—"
    line_good = (line >= sig) if direction == "long" else (line <= sig)
    # improving = hist moving in the trade's direction: for long, hist more
    # positive than before (or turning positive); for short, more negative.
    if direction == "long":
        improving = hist >= hist_prev
    else:
        improving = hist <= hist_prev
    if line_good and improving:
        return 20, "line ✓, hist improving"
    if line_good:
        return 10, "line ✓, hist weakening"
    if improving:
        return 10, "line ✗, hist improving"
    return 0, "line ✗, hist weakening"


def score_bb_room(price, bb_mid, bb_up, bb_lo, atr, direction, res, sup):
    if price is None or bb_mid is None or atr is None or atr == 0:
        return 0, "—"
    # Reference 'room' is measured to the nearest swing level, not the band
    # edge: US30 price 54012, resistance 54744 -> room 732/631 = 1.16 ATR
    # -> 20; NAS100 resistance 29771 vs price 29692 -> 0.12 ATR -> 10.
    if direction == "long":
        if not res:
            return 0, "no resistance"
        room = (res[0] - price) / atr
    else:
        if not sup:
            return 0, "no support"
        room = (price - sup[0]) / atr
    if room >= 1.0:
        return 20, "inside band, room ≥1×ATR"
    if room >= 0.25:
        return 10, "inside band, level near"
    return 0, "chasing, room ≥1×ATR"


def score_stoch_confirm(k, d, direction):
    if k is None or d is None:
        return 0, "—"
    # Reference: %K 20.9/33.5/34.5/57.4/58.4/67.9 -> 15; %K 11.5/20.3/27.4/
    # 42.7/51.4/77.1/85.6/90.8/100 -> 7.5.  Oversold <20 bounce or mid-range
    # k>d gives full; extremes (k>75 or k<18) or k<d mid gives half.
    if k < 18 or k > 75:
        return 7.5, f"%K {k:.1f} %D {d:.1f}"
    if k > d:
        return 15, f"%K {k:.1f} %D {d:.1f}"
    return 7.5, f"%K {k:.1f} %D {d:.1f}"


# ---------------------------------------------------------------------------
def compute_ta(candles, direction):
    """candles: list of (date, o, h, l, c) ascending. Returns (ta_score, conditions, indicators)."""
    closes = [c for _, _, _, _, c in candles]
    highs = [h for _, _, h, _, _ in candles]
    lows = [l for _, _, _, l, _ in candles]
    price = closes[-1]

    ema20v = ema(closes, 20)[-1]
    sma50v = sma(closes, 50)[-1]
    rsi = rsi14(closes)[-1]
    line, sig, hist = macd(closes)
    hist_prev = hist[-2] if len(hist) > 1 else None
    bb_mid, bb_up, bb_lo = bollinger(closes)
    atr = atr14(highs, lows, closes)[-1]
    k, d = stoch(highs, lows, closes)
    res, sup = swing_levels(highs, lows)

    conds = [
        ("price_vs_ema20", *score_price_vs_ema20(price, ema20v, direction)),
        ("ema20_vs_sma50", *score_ema_vs_sma(ema20v, sma50v, direction)),
        ("rsi_zone", *score_rsi_zone(rsi, direction)),
        ("macd_state", *score_macd_state(line[-1], sig[-1], hist[-1], hist_prev, direction)),
        ("bb_room", *score_bb_room(price, bb_mid[-1], bb_up[-1], bb_lo[-1], atr, direction, res, sup)),
        ("stoch_confirm", *score_stoch_confirm(k[-1], d[-1], direction)),
    ]
    ta_score = round(sum(c[1] for c in conds))
    indicators = {
        "ema20": ema20v, "sma50": sma50v, "rsi14": rsi,
        "macd": {"line": line[-1], "signal": sig[-1], "hist": hist[-1], "hist_prev": hist_prev},
        "bb": {"mid": bb_mid[-1], "upper": bb_up[-1], "lower": bb_lo[-1]},
        "atr14": atr, "stoch": {"k": k[-1], "d": d[-1]},
    }
    return ta_score, conds, indicators


def main() -> None:
    print(f"{'asset':9s} {'ref':>3} {'calc':>3}  {'Δ':>4}  per-condition (ref/calc)")
    print("-" * 100)
    total_err = 0
    for asset, spec in REF.items():
        sig_date = spec.get("created") or SIGNAL_DATE
        end = datetime.strptime(sig_date, "%Y-%m-%d") + timedelta(days=1)
        start = end - timedelta(days=140)  # 60 candles + warmup
        try:
            df = yf.Ticker(spec["yf"]).history(start=start, end=end, auto_adjust=True)
            if df is None or len(df) < 60:
                print(f"{asset:9s}  no data (yf returned {0 if df is None else len(df)} rows)")
                continue
            candles = [(str(d.date()), float(r.Open), float(r.High), float(r.Low), float(r.Close))
                       for d, r in df.iterrows()]
            calc_score, conds, ind = compute_ta(candles[-60:], spec["dir"])
            ref = spec["conds"]
            parts = []
            for key, score, val in conds:
                r = ref.get(key, 0)
                parts.append(f"{key.split('_')[0][:4]}={r}/{score}")
            err = abs(calc_score - spec["ta"])
            total_err += err
            print(f"{asset:9s} {spec['ta']:>3} {calc_score:>3}  {err:>+4}  {' '.join(parts)}")
        except Exception as e:
            print(f"{asset:9s}  ERROR {type(e).__name__}: {e}")
    print("-" * 100)
    print(f"mean |Δ| over {len(REF)} assets: {total_err / len(REF):.1f}")


if __name__ == "__main__":
    sys.exit(main())
