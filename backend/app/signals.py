# backend/app/signals.py
def percent_change(closes: list[float], periods: int) -> float | None:
    if len(closes) < periods + 1:
        return None
    start = closes[-(periods + 1)]
    end = closes[-1]
    if start <= 0:
        return None
    return (end - start) / start * 100


def rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    recent = changes[-period:]
    gains = [c for c in recent if c > 0]
    losses = [-c for c in recent if c < 0]
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_gain == 0 and avg_loss == 0:
        # No movement at all over the whole window (e.g. a halted or stale-data ticker) is not
        # the same thing as "every change was a gain" — returning 100 here would fabricate the
        # single strongest possible overbought reading out of an absence of data.
        return None
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def volume_ratio(volumes: list[float], period: int = 20) -> float | None:
    if len(volumes) < period + 1:
        return None
    latest = volumes[-1]
    average = sum(volumes[-(period + 1) : -1]) / period
    if average <= 0:
        return None
    return latest / average


def distance_from_sma(closes: list[float], period: int = 50) -> float | None:
    if len(closes) < period:
        return None
    average = sum(closes[-period:]) / period
    if average <= 0:
        return None
    return (closes[-1] - average) / average * 100
