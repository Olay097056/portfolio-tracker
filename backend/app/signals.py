# backend/app/signals.py
def percent_change(closes: list[float], periods: int) -> float | None:
    if len(closes) < periods + 1:
        return None
    start = closes[-(periods + 1)]
    end = closes[-1]
    if start <= 0:
        return None
    return (end - start) / start * 100
