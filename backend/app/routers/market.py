import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.chart_service import ChartRange, get_chart_data
from app.database import get_db
from app.manual_zones_service import add_zone, delete_all_zones, delete_zone, freeze_zones, list_manual_zones, move_zone
from app.schemas import ChartOut, FreezeZonesRequest, ManualZoneCreate, ManualZoneUpdate, TrendingOut, ZoneOut
from app.trending_service import get_gainers, get_losers, get_most_active

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/trending", response_model=TrendingOut)
def get_trending():
    api_key_configured = bool(os.environ.get("FMP_API_KEY"))
    if not api_key_configured:
        return TrendingOut(gainers=None, losers=None, most_active=None, api_key_configured=False)
    return TrendingOut(
        gainers=get_gainers(),
        losers=get_losers(),
        most_active=get_most_active(),
        api_key_configured=True,
    )


@router.get("/chart", response_model=ChartOut)
def get_chart(ticker: str, range: ChartRange = "1Y", db: Session = Depends(get_db)):
    result = get_chart_data(ticker, range)
    points = result["points"] if result is not None else None

    manual_rows = list_manual_zones(db, ticker, range)
    if manual_rows:
        zones_out = [
            ZoneOut(id=row.id, price=row.price, kind=row.kind, strength=None, source="manual")
            for row in manual_rows
        ]
    elif result is not None:
        zones_out = [
            ZoneOut(id=None, price=zone["price"], kind=zone["kind"], strength=zone["strength"], source="auto")
            for zone in result["zones"]
        ]
    else:
        zones_out = []

    return ChartOut(points=points, zones=zones_out)


@router.post("/chart/zones/freeze", response_model=list[ZoneOut])
def freeze_chart_zones(payload: FreezeZonesRequest, db: Session = Depends(get_db)):
    rows = freeze_zones(db, payload.ticker, payload.range, [(zone.kind, zone.price) for zone in payload.zones])
    return [ZoneOut(id=row.id, price=row.price, kind=row.kind, strength=None, source="manual") for row in rows]


@router.post("/chart/zones", response_model=ZoneOut, status_code=201)
def create_chart_zone(payload: ManualZoneCreate, db: Session = Depends(get_db)):
    row = add_zone(db, payload.ticker, payload.range, payload.kind, payload.price)
    return ZoneOut(id=row.id, price=row.price, kind=row.kind, strength=None, source="manual")


@router.patch("/chart/zones/{zone_id}", response_model=ZoneOut)
def update_chart_zone(zone_id: int, payload: ManualZoneUpdate, db: Session = Depends(get_db)):
    row = move_zone(db, zone_id, payload.price)
    if row is None:
        raise HTTPException(status_code=404, detail="Manual zone not found")
    return ZoneOut(id=row.id, price=row.price, kind=row.kind, strength=None, source="manual")


@router.delete("/chart/zones/{zone_id}", status_code=204)
def delete_chart_zone(zone_id: int, db: Session = Depends(get_db)):
    deleted = delete_zone(db, zone_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Manual zone not found")


@router.delete("/chart/zones", status_code=204)
def delete_all_chart_zones(ticker: str, range: ChartRange, db: Session = Depends(get_db)):
    delete_all_zones(db, ticker, range)
