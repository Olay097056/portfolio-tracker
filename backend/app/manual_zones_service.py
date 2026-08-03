# backend/app/manual_zones_service.py
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import ManualZone


def list_manual_zones(db: Session, ticker: str, range_: str) -> list[ManualZone]:
    return list(
        db.execute(select(ManualZone).where(ManualZone.ticker == ticker, ManualZone.range == range_)).scalars()
    )


def has_manual_zones(db: Session, ticker: str, range_: str) -> bool:
    return (
        db.execute(
            select(ManualZone.id).where(ManualZone.ticker == ticker, ManualZone.range == range_).limit(1)
        ).scalar_one_or_none()
        is not None
    )


def freeze_zones(db: Session, ticker: str, range_: str, zones: list[tuple[str, float]]) -> list[ManualZone]:
    """Replace whatever manual zones exist for (ticker, range) with exactly this list.

    Used for the first edit to a still-auto ticker+range pair: the caller passes every
    currently-shown zone (auto, unchanged) plus the one edit, and this becomes the new manual
    set. Deleting any pre-existing rows first keeps this idempotent even if called more than
    once for the same pair, though after the first call the pair is manual and later edits use
    add_zone/move_zone instead.
    """
    db.execute(delete(ManualZone).where(ManualZone.ticker == ticker, ManualZone.range == range_))
    rows = [ManualZone(ticker=ticker, range=range_, kind=kind, price=price) for kind, price in zones]
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def add_zone(db: Session, ticker: str, range_: str, kind: str, price: float) -> ManualZone:
    row = ManualZone(ticker=ticker, range=range_, kind=kind, price=price)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def move_zone(db: Session, zone_id: int, price: float) -> ManualZone | None:
    row = db.get(ManualZone, zone_id)
    if row is None:
        return None
    row.price = price
    db.commit()
    db.refresh(row)
    return row


def delete_zone(db: Session, zone_id: int) -> bool:
    row = db.get(ManualZone, zone_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def delete_all_zones(db: Session, ticker: str, range_: str) -> None:
    db.execute(delete(ManualZone).where(ManualZone.ticker == ticker, ManualZone.range == range_))
    db.commit()
