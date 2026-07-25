# backend/app/dividend_metrics.py
from datetime import date, timedelta

TRAILING_WINDOW = timedelta(days=365)


def payment_frequency(payment_dates: list[date], as_of: date) -> int:
    cutoff = as_of - TRAILING_WINDOW
    return sum(1 for d in payment_dates if d > cutoff)


def dividend_growth_pct(payments: list[tuple[date, float]], as_of: date) -> float | None:
    recent_cutoff = as_of - TRAILING_WINDOW
    prior_cutoff = as_of - (TRAILING_WINDOW * 2)
    recent = sum(amount for payment_date, amount in payments if payment_date > recent_cutoff)
    prior = sum(amount for payment_date, amount in payments if prior_cutoff < payment_date <= recent_cutoff)
    if prior <= 0:
        return None
    return (recent - prior) / prior * 100


def gross_yield_pct(payments: list[tuple[date, float]], price: float | None, as_of: date) -> float | None:
    if price is None or price <= 0:
        return None
    cutoff = as_of - TRAILING_WINDOW
    trailing_sum = sum(amount for payment_date, amount in payments if payment_date > cutoff)
    return trailing_sum / price * 100
