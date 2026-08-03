# Manual Support/Resistance Zones (No Drag) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user add, precisely reposition, and delete support/resistance/freestyle zones for a ticker+range, persisted to the database — with the first edit to a still-auto ticker+range pair freezing that pair's entire zone set (every currently-shown zone preserved, auto-recompute stopped) — all through S/R/Freestyle buttons and a side list, with no mouse-drag interaction yet.

**Architecture:** A new `ManualZone` database table (one row per zone) backs a new `manual_zones_service.py` (list/freeze/add/move/delete pure DB operations, mirroring this codebase's existing service-layer convention). `GET /market/chart`'s existing read path gains one branch: if any manual zones exist for the requested `(ticker, range)`, return those (`source: "manual"`) instead of the existing auto-computed path — `points` is untouched either way. Five new endpoints under the existing `market` router handle the writes. The frontend gets a small `useZoneEditing` hook that decides, per edit, whether to call the "freeze" endpoint (first edit for a still-auto pair) or a plain add/move/delete (pair already manual) — this decision logic lives in exactly one place so no component has to reimplement it — plus a `ZoneList` side-panel component and S/R/Freestyle buttons wired into `DashboardPage`.

**Tech Stack:** FastAPI, SQLAlchemy, pytest (backend); React 19, TypeScript, Vitest (frontend). No new dependencies.

## Global Constraints

- Zone kind widens from `"support" | "resistance"` to `"support" | "resistance" | "freestyle"` everywhere it appears (backend `Literal`, frontend TS union).
- `strength` becomes nullable everywhere it appears. A manual or freestyle zone's `strength` is always `null` — never a carried-over or fabricated touch count.
- The freeze semantics apply to the *entire* zone set for one `(ticker, range)` pair, never per-zone: the first edit to a still-auto pair must preserve every zone currently shown (not just the one being edited), and after that the pair is manual until the user explicitly resets it via "Recompute defaults."
- `points` (the chart's price line) is never affected by manual zones — only which zones accompany it in the response changes.
- No new dependency, no drag interaction in this ticket — new zones are added at the ticker's current price and only repositioned via the side list's editable price input.
- "Recompute defaults" requires confirmation before it deletes anything — this is the app's first confirmation dialog; use the browser's native `window.confirm()`, no custom modal.

---

### Task 1: Backend — manual zone persistence, service layer, and API

**Files:**
- Modify: `backend/app/models.py`
- Create: `backend/app/manual_zones_service.py`
- Modify: `backend/app/schemas.py`
- Modify: `backend/app/routers/market.py`
- Modify: `backend/tests/test_market_router.py`
- Create: `backend/tests/test_manual_zones_service.py`

**Interfaces:**
- Consumes: nothing from another task — this task is backend-only and self-contained.
- Produces the following HTTP contract, which Task 2 (frontend) consumes only through HTTP, not these Python types directly:
  - `GET /market/chart?ticker=X&range=Y` — unchanged path/params, response `zones` items now include `id: int | null` and `strength: int | null`, and `kind` accepts `"freestyle"`.
  - `POST /market/chart/zones/freeze` — body `{"ticker": str, "range": str, "zones": [{"kind": str, "price": float}, ...]}` → `list[ZoneOut]`, every item `source: "manual"` with a real `id`.
  - `POST /market/chart/zones` — body `{"ticker": str, "range": str, "kind": str, "price": float}` → single `ZoneOut`, `source: "manual"`, status 201.
  - `PATCH /market/chart/zones/{zone_id}` — body `{"price": float}` → single `ZoneOut`; 404 if the id doesn't exist.
  - `DELETE /market/chart/zones/{zone_id}` — 204; 404 if the id doesn't exist.
  - `DELETE /market/chart/zones?ticker=X&range=Y` — 204; removes every manual zone for that pair (used for "Recompute defaults").

Read `backend/app/models.py`, `backend/app/schemas.py`, and `backend/app/routers/market.py` in full before editing — you are widening existing files, not rewriting them.

- [ ] **Step 1: Write the failing tests for `manual_zones_service.py`**

Create `backend/tests/test_manual_zones_service.py`:

```python
# backend/tests/test_manual_zones_service.py
from app import manual_zones_service


def test_list_manual_zones_returns_only_matching_ticker_and_range(db_session):
    manual_zones_service.add_zone(db_session, "VTI", "1Y", "support", 90.0)
    manual_zones_service.add_zone(db_session, "VTI", "5Y", "support", 80.0)
    manual_zones_service.add_zone(db_session, "SPY", "1Y", "support", 400.0)

    result = manual_zones_service.list_manual_zones(db_session, "VTI", "1Y")

    assert len(result) == 1
    assert result[0].ticker == "VTI"
    assert result[0].range == "1Y"
    assert result[0].price == 90.0


def test_has_manual_zones_false_when_none_exist(db_session):
    assert manual_zones_service.has_manual_zones(db_session, "VTI", "1Y") is False


def test_has_manual_zones_true_when_some_exist(db_session):
    manual_zones_service.add_zone(db_session, "VTI", "1Y", "resistance", 110.0)

    assert manual_zones_service.has_manual_zones(db_session, "VTI", "1Y") is True


def test_freeze_zones_creates_exactly_the_given_list(db_session):
    rows = manual_zones_service.freeze_zones(
        db_session, "VTI", "1Y", [("support", 90.0), ("resistance", 110.0), ("freestyle", 100.0)]
    )

    assert len(rows) == 3
    assert {(row.kind, row.price) for row in rows} == {("support", 90.0), ("resistance", 110.0), ("freestyle", 100.0)}
    assert all(row.id is not None for row in rows)


def test_freeze_zones_replaces_any_existing_rows_for_the_pair(db_session):
    manual_zones_service.add_zone(db_session, "VTI", "1Y", "support", 85.0)

    rows = manual_zones_service.freeze_zones(db_session, "VTI", "1Y", [("support", 90.0)])

    assert len(rows) == 1
    assert rows[0].price == 90.0
    all_rows = manual_zones_service.list_manual_zones(db_session, "VTI", "1Y")
    assert len(all_rows) == 1


def test_add_zone_creates_one_row(db_session):
    row = manual_zones_service.add_zone(db_session, "VTI", "1Y", "freestyle", 120.0)

    assert row.id is not None
    assert row.ticker == "VTI"
    assert row.range == "1Y"
    assert row.kind == "freestyle"
    assert row.price == 120.0


def test_move_zone_updates_price(db_session):
    row = manual_zones_service.add_zone(db_session, "VTI", "1Y", "support", 90.0)

    updated = manual_zones_service.move_zone(db_session, row.id, 92.5)

    assert updated is not None
    assert updated.id == row.id
    assert updated.price == 92.5


def test_move_zone_returns_none_for_unknown_id(db_session):
    assert manual_zones_service.move_zone(db_session, 999999, 100.0) is None


def test_delete_zone_removes_the_row(db_session):
    row = manual_zones_service.add_zone(db_session, "VTI", "1Y", "support", 90.0)

    deleted = manual_zones_service.delete_zone(db_session, row.id)

    assert deleted is True
    assert manual_zones_service.list_manual_zones(db_session, "VTI", "1Y") == []


def test_delete_zone_returns_false_for_unknown_id(db_session):
    assert manual_zones_service.delete_zone(db_session, 999999) is False


def test_delete_all_zones_removes_only_matching_ticker_and_range(db_session):
    manual_zones_service.add_zone(db_session, "VTI", "1Y", "support", 90.0)
    manual_zones_service.add_zone(db_session, "VTI", "5Y", "support", 80.0)

    manual_zones_service.delete_all_zones(db_session, "VTI", "1Y")

    assert manual_zones_service.list_manual_zones(db_session, "VTI", "1Y") == []
    assert len(manual_zones_service.list_manual_zones(db_session, "VTI", "5Y")) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_manual_zones_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.manual_zones_service'`. (The `db_session` fixture used here already exists in `backend/tests/conftest.py` — it's the same fixture the `client` fixture is built on, and it's valid to request it directly in a test that doesn't need the HTTP layer.)

- [ ] **Step 3: Add the `ManualZone` model**

In `backend/app/models.py`, find the end of the file (after the `WatchlistItem` class) and append:

```python


class ManualZone(Base):
    __tablename__ = "manual_zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String, nullable=False)
    range: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_utcnow, onupdate=_utcnow)
```

(`Base`, `Mapped`, `mapped_column`, `Float`, `String`, `UTCDateTime`, `datetime`, and `_utcnow` are all already imported/defined earlier in this file — no new imports needed.)

- [ ] **Step 4: Implement `manual_zones_service.py`**

Create `backend/app/manual_zones_service.py`:

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_manual_zones_service.py -v`
Expected: PASS (11 tests)

- [ ] **Step 6: Widen `schemas.py`**

Read `backend/app/schemas.py` in full first. Find the `ZoneOut` and `ChartOut` classes and replace:

```python
class ZoneOut(BaseModel):
    price: float
    kind: Literal["support", "resistance"]
    strength: int
    source: Literal["auto"]


class ChartOut(BaseModel):
    points: list[ChartPointOut] | None
    zones: list[ZoneOut]
```

with:

```python
class ZoneOut(BaseModel):
    id: int | None
    price: float
    kind: Literal["support", "resistance", "freestyle"]
    strength: int | None
    source: Literal["auto", "manual"]


class ChartOut(BaseModel):
    points: list[ChartPointOut] | None
    zones: list[ZoneOut]


class ZoneInput(BaseModel):
    kind: Literal["support", "resistance", "freestyle"]
    price: float


class FreezeZonesRequest(BaseModel):
    ticker: str
    range: ChartRange
    zones: list[ZoneInput]


class ManualZoneCreate(BaseModel):
    ticker: str
    range: ChartRange
    kind: Literal["support", "resistance", "freestyle"]
    price: float


class ManualZoneUpdate(BaseModel):
    price: float
```

Add `ChartRange` to this file's imports — find the top of `backend/app/schemas.py` and add, near the other imports:

```python
from app.chart_service import ChartRange
```

- [ ] **Step 7: Write the failing tests for the widened read path and the new write endpoints**

Read `backend/tests/test_market_router.py` in full first — you are updating one existing test and adding new ones, not rewriting the file.

In `backend/tests/test_market_router.py`, replace the existing `test_get_chart_returns_points_and_zones_for_a_ticker` (its mocked `get_chart_data` return value is unchanged — a `Zone` from `support_resistance.py` never had an `id` and still doesn't — only the *response* assertion changes, since the router now always constructs an explicit `id` field):

```python
def test_get_chart_returns_points_and_zones_for_a_ticker(client):
    points = [{"time": "2026-01-02", "close": 100.0}, {"time": "2026-01-05", "close": 101.5}]
    zones = [{"price": 95.0, "kind": "support", "strength": 3, "source": "auto"}]

    with patch("app.routers.market.get_chart_data", return_value={"points": points, "zones": zones}):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    assert response.status_code == 200
    assert response.json() == {
        "points": points,
        "zones": [{"id": None, "price": 95.0, "kind": "support", "strength": 3, "source": "auto"}],
    }
```

Append these new tests to `backend/tests/test_market_router.py`:

```python
def test_get_chart_returns_manual_zones_once_frozen_ignoring_auto(client):
    freeze_response = client.post(
        "/market/chart/zones/freeze",
        json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "support", "price": 90.0}]},
    )
    assert freeze_response.status_code == 200

    # A different auto result is mocked here specifically to prove it's ignored once manual
    # zones exist for this pair — if the read path fell through to auto anyway, this assertion
    # would fail with the auto zone's price (99.0) instead of the frozen manual one (90.0).
    auto_zones = [{"price": 99.0, "kind": "resistance", "strength": 5, "source": "auto"}]
    with patch(
        "app.routers.market.get_chart_data", return_value={"points": [], "zones": auto_zones}
    ):
        response = client.get("/market/chart?ticker=VTI&range=1Y")

    body = response.json()
    assert len(body["zones"]) == 1
    assert body["zones"][0]["price"] == 90.0
    assert body["zones"][0]["source"] == "manual"
    assert body["zones"][0]["id"] is not None


def test_post_freeze_creates_the_given_zones_as_manual(client):
    response = client.post(
        "/market/chart/zones/freeze",
        json={
            "ticker": "VTI",
            "range": "1Y",
            "zones": [{"kind": "support", "price": 90.0}, {"kind": "resistance", "price": 110.0}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(zone["source"] == "manual" for zone in body)
    assert all(zone["id"] is not None for zone in body)
    assert all(zone["strength"] is None for zone in body)
    assert {(zone["kind"], zone["price"]) for zone in body} == {("support", 90.0), ("resistance", 110.0)}


def test_post_freeze_accepts_a_freestyle_zone(client):
    response = client.post(
        "/market/chart/zones/freeze",
        json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "freestyle", "price": 100.0}]},
    )

    assert response.status_code == 200
    assert response.json()[0]["kind"] == "freestyle"


def test_post_zones_adds_one_manual_zone(client):
    response = client.post(
        "/market/chart/zones", json={"ticker": "VTI", "range": "1Y", "kind": "freestyle", "price": 105.0}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["kind"] == "freestyle"
    assert body["price"] == 105.0
    assert body["source"] == "manual"
    assert body["strength"] is None
    assert body["id"] is not None


def test_patch_zone_updates_the_price(client):
    created = client.post(
        "/market/chart/zones", json={"ticker": "VTI", "range": "1Y", "kind": "support", "price": 90.0}
    ).json()

    response = client.patch(f"/market/chart/zones/{created['id']}", json={"price": 92.5})

    assert response.status_code == 200
    assert response.json()["price"] == 92.5
    assert response.json()["id"] == created["id"]


def test_patch_zone_returns_404_for_unknown_id(client):
    response = client.patch("/market/chart/zones/999999", json={"price": 100.0})

    assert response.status_code == 404


def test_delete_zone_removes_it(client):
    created = client.post(
        "/market/chart/zones", json={"ticker": "VTI", "range": "1Y", "kind": "support", "price": 90.0}
    ).json()

    response = client.delete(f"/market/chart/zones/{created['id']}")
    assert response.status_code == 204

    with patch("app.routers.market.get_chart_data", return_value={"points": [], "zones": []}):
        follow_up = client.get("/market/chart?ticker=VTI&range=1Y")
    assert follow_up.json()["zones"] == []


def test_delete_zone_returns_404_for_unknown_id(client):
    response = client.delete("/market/chart/zones/999999")

    assert response.status_code == 404


def test_delete_all_zones_reverts_the_pair_to_auto(client):
    client.post("/market/chart/zones/freeze", json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "support", "price": 90.0}]})

    response = client.delete("/market/chart/zones?ticker=VTI&range=1Y")
    assert response.status_code == 204

    auto_zones = [{"price": 99.0, "kind": "resistance", "strength": 5, "source": "auto"}]
    with patch(
        "app.routers.market.get_chart_data", return_value={"points": [], "zones": auto_zones}
    ):
        follow_up = client.get("/market/chart?ticker=VTI&range=1Y")
    assert follow_up.json()["zones"][0]["price"] == 99.0
    assert follow_up.json()["zones"][0]["source"] == "auto"


def test_delete_all_zones_only_affects_the_given_ticker_and_range(client):
    client.post("/market/chart/zones/freeze", json={"ticker": "VTI", "range": "1Y", "zones": [{"kind": "support", "price": 90.0}]})
    client.post("/market/chart/zones/freeze", json={"ticker": "VTI", "range": "5Y", "zones": [{"kind": "support", "price": 80.0}]})

    client.delete("/market/chart/zones?ticker=VTI&range=1Y")

    with patch("app.routers.market.get_chart_data", return_value={"points": [], "zones": []}):
        response = client.get("/market/chart?ticker=VTI&range=5Y")
    assert len(response.json()["zones"]) == 1
    assert response.json()["zones"][0]["price"] == 80.0
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_market_router.py -v`
Expected: FAIL — `404 Not Found` for every request to a `/market/chart/zones...` path (none of the new endpoints exist yet), and the updated `test_get_chart_returns_points_and_zones_for_a_ticker` fails on the missing `"id": None` key.

- [ ] **Step 9: Widen `routers/market.py`**

Read `backend/app/routers/market.py` in full first.

Replace the full contents of `backend/app/routers/market.py` with:

```python
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
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_market_router.py -v`
Expected: PASS (all tests in this file — 9 pre-existing + 10 new = 19).

- [ ] **Step 11: Run the full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: all PASS (187 pre-existing + 11 new service tests + 10 new router tests = 208).

- [ ] **Step 12: Commit**

```bash
git add backend/app/models.py backend/app/manual_zones_service.py backend/app/schemas.py backend/app/routers/market.py backend/tests/test_manual_zones_service.py backend/tests/test_market_router.py
git commit -m "feat: add manual support/resistance zone persistence and API"
```

---

### Task 2: Frontend — types, client functions, `useChartData` refetch, and `useZoneEditing`

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/client.test.ts`
- Modify: `frontend/src/hooks/useChartData.ts`
- Modify: `frontend/src/hooks/useChartData.test.tsx`
- Create: `frontend/src/hooks/useZoneEditing.ts`
- Create: `frontend/src/hooks/useZoneEditing.test.tsx`

**Interfaces:**
- Consumes: the HTTP contract from Task 1 (`GET /market/chart` with widened `zones`, plus the four write endpoints).
- Produces: `useChartData(ticker, range)` now also returns `refetch: () => void`. `useZoneEditing(ticker, range, zones, onZonesChanged)` returns `{ error, isManual, addZone(kind, price), removeZone(zoneId), editZonePrice(zoneId, price), recomputeDefaults() }`. Task 3 (`ZoneList`, S/R/Freestyle buttons, `DashboardPage`) consumes both of these hooks directly.

Read `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, and `frontend/src/hooks/useChartData.ts` in full first — you are widening all three, not rewriting them.

- [ ] **Step 1: Write the failing test for the widened `Zone` type**

Read `frontend/src/api/client.test.ts`'s existing `getChartData` tests for style, then append:

```ts
  it('getChartData passes a manual zone with an id and null strength through unchanged', async () => {
    mockFetchOnce({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 7, price: 95, kind: 'freestyle', strength: null, source: 'manual' }],
    });

    const result = await getChartData('VTI', '1Y');

    expect(result.zones).toEqual([{ id: 7, price: 95, kind: 'freestyle', strength: null, source: 'manual' }]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — TypeScript error, `Zone` has no `id` field and `kind`/`source`/`strength` don't accept these values yet (or a runtime mismatch if esbuild doesn't type-check — either failure mode confirms red).

- [ ] **Step 3: Widen the `Zone` type and add `ZoneInput`**

In `frontend/src/api/types.ts`, replace:

```ts
export interface Zone {
  price: number;
  kind: 'support' | 'resistance';
  strength: number;
  source: 'auto';
}
```

with:

```ts
export interface Zone {
  id: number | null;
  price: number;
  kind: 'support' | 'resistance' | 'freestyle';
  strength: number | null;
  source: 'auto' | 'manual';
}

export interface ZoneInput {
  kind: 'support' | 'resistance' | 'freestyle';
  price: number;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/api/client.test.ts && cd .. && cd frontend && npx tsc -b`
Expected: vitest PASS, `tsc -b` clean.

- [ ] **Step 5: Write the failing tests for the new client functions**

Append to `frontend/src/api/client.test.ts` (adding `freezeZones`, `createZone`, `updateZone`, `deleteZone`, `deleteAllZones`, and `Zone`/`ZoneInput` to the existing import block from `'./client'` first):

```ts
  it('freezeZones calls POST /market/chart/zones/freeze with ticker, range, and zones', async () => {
    mockFetchOnce([{ id: 1, price: 90, kind: 'support', strength: null, source: 'manual' }]);

    const result = await freezeZones('VTI', '1Y', [{ kind: 'support', price: 90 }]);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones/freeze',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: 'VTI', range: '1Y', zones: [{ kind: 'support', price: 90 }] }),
      }),
    );
    expect(result).toEqual([{ id: 1, price: 90, kind: 'support', strength: null, source: 'manual' }]);
  });

  it('createZone calls POST /market/chart/zones with ticker, range, kind, and price', async () => {
    mockFetchOnce({ id: 2, price: 105, kind: 'freestyle', strength: null, source: 'manual' }, { status: 201 });

    const result = await createZone('VTI', '1Y', 'freestyle', 105);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ticker: 'VTI', range: '1Y', kind: 'freestyle', price: 105 }),
      }),
    );
    expect(result.id).toBe(2);
  });

  it('updateZone calls PATCH /market/chart/zones/:id with the new price', async () => {
    mockFetchOnce({ id: 2, price: 106, kind: 'freestyle', strength: null, source: 'manual' });

    const result = await updateZone(2, 106);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones/2',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ price: 106 }) }),
    );
    expect(result.price).toBe(106);
  });

  it('deleteZone calls DELETE /market/chart/zones/:id', async () => {
    mockFetchOnce(undefined, { status: 204 });

    await deleteZone(2);

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/market/chart/zones/2', expect.objectContaining({ method: 'DELETE' }));
  });

  it('deleteAllZones calls DELETE /market/chart/zones with ticker and range as query params', async () => {
    mockFetchOnce(undefined, { status: 204 });

    await deleteAllZones('VTI', '1Y');

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8000/market/chart/zones?ticker=VTI&range=1Y',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api/client.test.ts`
Expected: FAIL — `freezeZones is not defined` (and similarly for the other four functions).

- [ ] **Step 7: Implement the client functions**

In `frontend/src/api/client.ts`, add `Zone` and `ZoneInput` to the existing `import type { ... } from './types'` block, then append at the end of the file:

```ts
export function freezeZones(ticker: string, range: ChartRange, zones: ZoneInput[]): Promise<Zone[]> {
  return request<Zone[]>('/market/chart/zones/freeze', {
    method: 'POST',
    body: JSON.stringify({ ticker, range, zones }),
  });
}

export function createZone(ticker: string, range: ChartRange, kind: Zone['kind'], price: number): Promise<Zone> {
  return request<Zone>('/market/chart/zones', {
    method: 'POST',
    body: JSON.stringify({ ticker, range, kind, price }),
  });
}

export function updateZone(zoneId: number, price: number): Promise<Zone> {
  return request<Zone>(`/market/chart/zones/${zoneId}`, { method: 'PATCH', body: JSON.stringify({ price }) });
}

export function deleteZone(zoneId: number): Promise<void> {
  return request<void>(`/market/chart/zones/${zoneId}`, { method: 'DELETE' });
}

export function deleteAllZones(ticker: string, range: ChartRange): Promise<void> {
  return request<void>(`/market/chart/zones?ticker=${encodeURIComponent(ticker)}&range=${range}`, { method: 'DELETE' });
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/api/client.test.ts && cd .. && cd frontend && npx tsc -b`
Expected: vitest PASS (all tests in this file — 19 pre-existing + 1 (Step 1) + 5 (Step 5) = 25), `tsc -b` clean.

- [ ] **Step 9: Write the failing test for `useChartData`'s `refetch`**

Read `frontend/src/hooks/useChartData.ts` in full — you are extracting its existing fetch logic into a named, re-callable function, not changing its behavior.

Append to `frontend/src/hooks/useChartData.test.tsx`:

```ts
  it('exposes a refetch function that re-fetches without waiting for ticker or range to change', async () => {
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 105 }], zones: [] });

    const { result } = renderHook(() => useChartData('VTI', '1Y'));
    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 100 }]));

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.points).toEqual([{ time: '2026-01-02', close: 105 }]));
    expect(client.getChartData).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx -t "refetch"`
Expected: FAIL — `result.current.refetch is not a function`.

- [ ] **Step 11: Add `refetch` to `useChartData`**

In `frontend/src/hooks/useChartData.ts`, add `useCallback` to the existing `import { useEffect, useRef, useState } from 'react';` line, making it `import { useCallback, useEffect, useRef, useState } from 'react';`.

Replace the existing `useEffect` block:

```ts
  useEffect(() => {
    if (ticker === null) {
      setPoints(null);
      setLoading(false);
      setError(null);
      setZones([]);
      return;
    }

    const thisRequestId = ++requestId.current;
    setLoading(true);
    setError(null);

    getChartData(ticker, range)
      .then((data) => {
        if (requestId.current !== thisRequestId) return;
        if (data.points === null) {
          setPoints(null);
          setError(`No chart data available for ${ticker}.`);
        } else {
          setPoints(data.points);
        }
        setZones(data.zones ?? []);
      })
      .catch((err) => {
        if (requestId.current !== thisRequestId) return;
        setPoints(null);
        setError(toMessage(err));
        setZones([]);
      })
      .finally(() => {
        if (requestId.current !== thisRequestId) return;
        setLoading(false);
      });
  }, [ticker, range]);

  return { points, loading, error, zones };
```

with:

```ts
  const fetchChartData = useCallback(() => {
    if (ticker === null) {
      setPoints(null);
      setLoading(false);
      setError(null);
      setZones([]);
      return;
    }

    const thisRequestId = ++requestId.current;
    setLoading(true);
    setError(null);

    getChartData(ticker, range)
      .then((data) => {
        if (requestId.current !== thisRequestId) return;
        if (data.points === null) {
          setPoints(null);
          setError(`No chart data available for ${ticker}.`);
        } else {
          setPoints(data.points);
        }
        setZones(data.zones ?? []);
      })
      .catch((err) => {
        if (requestId.current !== thisRequestId) return;
        setPoints(null);
        setError(toMessage(err));
        setZones([]);
      })
      .finally(() => {
        if (requestId.current !== thisRequestId) return;
        setLoading(false);
      });
  }, [ticker, range]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  return { points, loading, error, zones, refetch: fetchChartData };
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useChartData.test.tsx`
Expected: PASS (all tests in this file — 13 pre-existing + 1 new = 14).

- [ ] **Step 13: Write the failing tests for `useZoneEditing`**

Create `frontend/src/hooks/useZoneEditing.test.tsx`:

```tsx
// frontend/src/hooks/useZoneEditing.test.tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { useZoneEditing } from './useZoneEditing';

const autoZone = { id: null, price: 95, kind: 'support' as const, strength: 3, source: 'auto' as const };
const manualZone = { id: 5, price: 95, kind: 'support' as const, strength: null, source: 'manual' as const };

describe('useZoneEditing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports isManual as false when zones is empty or all-auto', () => {
    const { result: empty } = renderHook(() => useZoneEditing('VTI', '1Y', [], vi.fn()));
    expect(empty.current.isManual).toBe(false);

    const { result: auto } = renderHook(() => useZoneEditing('VTI', '1Y', [autoZone], vi.fn()));
    expect(auto.current.isManual).toBe(false);
  });

  it('reports isManual as true when zones has a manual zone', () => {
    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], vi.fn()));
    expect(result.current.isManual).toBe(true);
  });

  it('addZone calls freezeZones with every current zone plus the new one when not yet manual', async () => {
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([]);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [autoZone], onZonesChanged));

    await act(async () => {
      await result.current.addZone('resistance', 110);
    });

    expect(freezeSpy).toHaveBeenCalledWith('VTI', '1Y', [
      { kind: 'support', price: 95 },
      { kind: 'resistance', price: 110 },
    ]);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('addZone calls createZone directly when already manual', async () => {
    const createSpy = vi.spyOn(client, 'createZone').mockResolvedValue(manualZone);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.addZone('resistance', 110);
    });

    expect(createSpy).toHaveBeenCalledWith('VTI', '1Y', 'resistance', 110);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('editZonePrice calls updateZone and reports the request through onZonesChanged', async () => {
    vi.spyOn(client, 'updateZone').mockResolvedValue({ ...manualZone, price: 97 });
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.editZonePrice(5, 97);
    });

    expect(client.updateZone).toHaveBeenCalledWith(5, 97);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('removeZone calls deleteZone', async () => {
    vi.spyOn(client, 'deleteZone').mockResolvedValue(undefined);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.removeZone(5);
    });

    expect(client.deleteZone).toHaveBeenCalledWith(5);
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('recomputeDefaults calls deleteAllZones with the current ticker and range', async () => {
    vi.spyOn(client, 'deleteAllZones').mockResolvedValue(undefined);
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    await act(async () => {
      await result.current.recomputeDefaults();
    });

    expect(client.deleteAllZones).toHaveBeenCalledWith('VTI', '1Y');
    expect(onZonesChanged).toHaveBeenCalledTimes(1);
  });

  it('sets an error and re-throws when a mutation fails', async () => {
    vi.spyOn(client, 'deleteZone').mockRejectedValue(new client.ApiError(404, 'Manual zone not found'));
    const onZonesChanged = vi.fn();

    const { result } = renderHook(() => useZoneEditing('VTI', '1Y', [manualZone], onZonesChanged));

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.removeZone(5);
      } catch (err) {
        thrown = err;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    await waitFor(() => expect(result.current.error).toBe('Manual zone not found'));
    expect(onZonesChanged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/hooks/useZoneEditing.test.tsx`
Expected: FAIL — `Failed to resolve import "./useZoneEditing"`.

- [ ] **Step 15: Implement `useZoneEditing`**

Create `frontend/src/hooks/useZoneEditing.ts`:

```ts
// frontend/src/hooks/useZoneEditing.ts
import { useState } from 'react';
import { createZone, deleteAllZones, deleteZone, freezeZones, updateZone } from '../api/client';
import type { ChartRange, Zone, ZoneInput } from '../api/types';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useZoneEditing(ticker: string | null, range: ChartRange, zones: Zone[], onZonesChanged: () => void) {
  const [error, setError] = useState<string | null>(null);

  const isManual = zones.some((zone) => zone.source === 'manual');

  const addZone = async (kind: Zone['kind'], price: number) => {
    if (ticker === null) return;
    try {
      if (isManual) {
        await createZone(ticker, range, kind, price);
      } else {
        const existing: ZoneInput[] = zones.map((zone) => ({ kind: zone.kind, price: zone.price }));
        await freezeZones(ticker, range, [...existing, { kind, price }]);
      }
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  const editZonePrice = async (zoneId: number, price: number) => {
    try {
      await updateZone(zoneId, price);
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  const removeZone = async (zoneId: number) => {
    try {
      await deleteZone(zoneId);
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  const recomputeDefaults = async () => {
    if (ticker === null) return;
    try {
      await deleteAllZones(ticker, range);
      setError(null);
      onZonesChanged();
    } catch (err) {
      setError(toMessage(err));
      throw err;
    }
  };

  return { error, isManual, addZone, editZonePrice, removeZone, recomputeDefaults };
}
```

- [ ] **Step 16: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/hooks/useZoneEditing.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 17: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS (262 pre-existing + 1 client.test.ts (Step 1) + 5 client.test.ts (Step 5) + 1 useChartData.test.tsx + 8 useZoneEditing.test.tsx = 277), `tsc -b` exits with no output.

- [ ] **Step 18: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/hooks/useChartData.ts frontend/src/hooks/useChartData.test.tsx frontend/src/hooks/useZoneEditing.ts frontend/src/hooks/useZoneEditing.test.tsx
git commit -m "feat: add zone-editing client functions and the useZoneEditing hook"
```

---

### Task 3: Frontend — S/R/Freestyle buttons, the zone list, Recompute defaults, and page wiring

**Files:**
- Create: `frontend/src/components/ZoneList.tsx`
- Create: `frontend/src/components/ZoneList.test.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/pages/DashboardPage.test.tsx`

**Interfaces:**
- Consumes: `useZoneEditing` and `useChartData`'s `refetch` from Task 2; `Zone` type from `frontend/src/api/types.ts`.
- Produces: nothing consumed by a later task — this is the final task of this ticket.

Read `frontend/src/pages/DashboardPage.tsx` and `frontend/src/utils/signalFormatting.ts` in full first.

- [ ] **Step 1: Write the failing tests for `ZoneList`**

Create `frontend/src/components/ZoneList.test.tsx`:

```tsx
// frontend/src/components/ZoneList.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Zone } from '../api/types';
import { ZoneList } from './ZoneList';

const autoZone: Zone = { id: null, price: 95, kind: 'support', strength: 3, source: 'auto' };
const manualZone: Zone = { id: 5, price: 100, kind: 'freestyle', strength: null, source: 'manual' };

describe('ZoneList', () => {
  it('shows a message when there are no zones', () => {
    render(<ZoneList zones={[]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText(/no support\/resistance zones/i)).toBeInTheDocument();
  });

  it('shows an auto zone as read-only price text with no edit or delete controls', () => {
    render(<ZoneList zones={[autoZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByText('95.00')).toBeInTheDocument();
    expect(screen.getByText('support')).toBeInTheDocument();
    expect(screen.queryByLabelText(/support zone price/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows a manual zone with an editable price input and a delete button', () => {
    render(<ZoneList zones={[manualZone]} onEditPrice={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByLabelText(/freestyle zone price/i)).toHaveValue(100);
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('calls onEditPrice with the zone id and the new price when the price input loses focus with a changed value', () => {
    const onEditPrice = vi.fn();
    render(<ZoneList zones={[manualZone]} onEditPrice={onEditPrice} onDelete={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/freestyle zone price/i), { target: { value: '103' } });
    fireEvent.blur(screen.getByLabelText(/freestyle zone price/i));

    expect(onEditPrice).toHaveBeenCalledWith(5, 103);
  });

  it('does not call onEditPrice when the price input loses focus with the value unchanged', () => {
    const onEditPrice = vi.fn();
    render(<ZoneList zones={[manualZone]} onEditPrice={onEditPrice} onDelete={vi.fn()} />);

    fireEvent.blur(screen.getByLabelText(/freestyle zone price/i));

    expect(onEditPrice).not.toHaveBeenCalled();
  });

  it('calls onDelete with the zone id when the delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<ZoneList zones={[manualZone]} onEditPrice={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ZoneList.test.tsx`
Expected: FAIL — `Failed to resolve import "./ZoneList"`.

- [ ] **Step 3: Implement `ZoneList`**

Create `frontend/src/components/ZoneList.tsx`:

```tsx
// frontend/src/components/ZoneList.tsx
import type { Zone } from '../api/types';
import { formatNumber } from '../utils/signalFormatting';

interface ZoneListProps {
  zones: Zone[];
  onEditPrice: (zoneId: number, price: number) => void;
  onDelete: (zoneId: number) => void;
}

export function ZoneList({ zones, onEditPrice, onDelete }: ZoneListProps) {
  if (zones.length === 0) {
    return <p>No support/resistance zones yet.</p>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Price</th>
          <th>Kind</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {zones.map((zone) => (
          <tr key={zone.id ?? `auto-${zone.kind}-${zone.price}`}>
            <td>
              {zone.source === 'manual' && zone.id !== null ? (
                <input
                  type="number"
                  aria-label={`${zone.kind} zone price`}
                  defaultValue={zone.price}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (!Number.isNaN(value) && value !== zone.price) {
                      onEditPrice(zone.id as number, value);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
              ) : (
                formatNumber(zone.price)
              )}
            </td>
            <td>{zone.kind}</td>
            <td>
              {zone.source === 'manual' && zone.id !== null && (
                <button type="button" onClick={() => onDelete(zone.id as number)}>
                  Delete
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ZoneList.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing tests for the S/R/Freestyle buttons and Recompute defaults on `DashboardPage`**

Read `frontend/src/pages/DashboardPage.tsx` and `frontend/src/pages/DashboardPage.test.tsx` in full first — you are adding buttons, a `ZoneList`, and a confirm-gated reset action, not restructuring the existing selectors/chart.

Append to `frontend/src/pages/DashboardPage.test.tsx`:

```tsx
  it('shows S, R, and Freestyle buttons and a zone list once a ticker is selected', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({ points: [{ time: '2026-01-02', close: 100 }], zones: [] });

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });

    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^r$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /freestyle/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeInTheDocument();
    expect(screen.getByText(/no support\/resistance zones/i)).toBeInTheDocument();
  });

  it('clicking S adds a support zone at the last point\'s close price and refetches', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData')
      .mockResolvedValueOnce({ points: [{ time: '2026-01-02', close: 100 }], zones: [] })
      .mockResolvedValueOnce({
        points: [{ time: '2026-01-02', close: 100 }],
        zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
      });
    const freezeSpy = vi.spyOn(client, 'freezeZones').mockResolvedValue([
      { id: 1, price: 100, kind: 'support', strength: null, source: 'manual' },
    ]);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /^s$/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^s$/i }));

    await waitFor(() => expect(freezeSpy).toHaveBeenCalledWith('AAPL', '1Y', [{ kind: 'support', price: 100 }]));
    await waitFor(() => expect(client.getChartData).toHaveBeenCalledTimes(2));
  });

  it('Recompute defaults does nothing without confirmation and clears zones when confirmed', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
    });
    const deleteAllSpy = vi.spyOn(client, 'deleteAllZones').mockResolvedValue(undefined);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /recompute defaults/i })).toBeInTheDocument());

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: /recompute defaults/i }));
    expect(deleteAllSpy).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: /recompute defaults/i }));
    await waitFor(() => expect(deleteAllSpy).toHaveBeenCalledWith('AAPL', '1Y'));
  });

  it('deleting a zone from the list calls deleteZone and refetches', async () => {
    vi.spyOn(client, 'listPortfolios').mockResolvedValue([]);
    vi.spyOn(client, 'listWatchlist').mockResolvedValue([{ id: 1, ticker: 'AAPL', category: null, created_at: '2026-01-01T00:00:00Z' }]);
    vi.spyOn(client, 'getChartData').mockResolvedValue({
      points: [{ time: '2026-01-02', close: 100 }],
      zones: [{ id: 1, price: 100, kind: 'support', strength: null, source: 'manual' }],
    });
    const deleteSpy = vi.spyOn(client, 'deleteZone').mockResolvedValue(undefined);

    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByLabelText(/ticker/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/ticker/i), { target: { value: 'AAPL' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1));
  });
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: FAIL — no button named "S"/"R"/"Freestyle"/"Recompute defaults" exists yet, and no zone list is rendered.

- [ ] **Step 7: Wire the buttons, `ZoneList`, and Recompute defaults into `DashboardPage`**

Replace the full contents of `frontend/src/pages/DashboardPage.tsx` with:

```tsx
// frontend/src/pages/DashboardPage.tsx
import { useState } from 'react';
import type { ChartRange } from '../api/types';
import { PriceChart } from '../components/PriceChart';
import { ZoneList } from '../components/ZoneList';
import { chartIdentityKey, useChartData } from '../hooks/useChartData';
import { useDashboardTickers } from '../hooks/useDashboardTickers';
import { useZoneEditing } from '../hooks/useZoneEditing';

const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '5D', label: '5 days' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: 'YTD', label: 'Year to date' },
  { value: '1Y', label: '1 year' },
  { value: '5Y', label: '5 years' },
];

export function DashboardPage() {
  const { tickers, loading: tickersLoading, error: tickersError } = useDashboardTickers();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>('1Y');
  const { points, loading, error, zones, refetch } = useChartData(selectedTicker, range);
  const zoneEditing = useZoneEditing(selectedTicker, range, zones, refetch);

  const currentPrice = points !== null && points.length > 0 ? points[points.length - 1].close : null;

  function handleAddZone(kind: 'support' | 'resistance' | 'freestyle') {
    if (currentPrice === null) return;
    void zoneEditing.addZone(kind, currentPrice);
  }

  function handleRecomputeDefaults() {
    if (!window.confirm('This will discard every zone you have placed for this ticker and range. Continue?')) {
      return;
    }
    void zoneEditing.recomputeDefaults();
  }

  return (
    <div>
      <h2>Dashboard</h2>

      {tickersError ? (
        <div role="alert">{tickersError}</div>
      ) : tickersLoading ? (
        <div>Loading tickers…</div>
      ) : tickers.length === 0 ? (
        <p>No tickers to chart yet — add a holding or a Watchlist ticker first.</p>
      ) : (
        <>
          <label htmlFor="dashboard-ticker">Ticker</label>
          <select id="dashboard-ticker" value={selectedTicker ?? ''} onChange={(e) => setSelectedTicker(e.target.value || null)}>
            <option value="">Select a ticker…</option>
            {tickers.map((ticker) => (
              <option key={ticker} value={ticker}>
                {ticker}
              </option>
            ))}
          </select>

          {selectedTicker && (
            <>
              <label htmlFor="dashboard-range">Range</label>
              <select id="dashboard-range" value={range} onChange={(e) => setRange(e.target.value as ChartRange)}>
                {RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              <PriceChart key={chartIdentityKey(selectedTicker, range)} points={points} loading={loading} error={error} zones={zones} />

              {zoneEditing.error && <div role="alert">{zoneEditing.error}</div>}

              <button type="button" onClick={() => handleAddZone('support')}>
                S
              </button>
              <button type="button" onClick={() => handleAddZone('resistance')}>
                R
              </button>
              <button type="button" onClick={() => handleAddZone('freestyle')}>
                Freestyle
              </button>
              <button type="button" onClick={handleRecomputeDefaults}>
                Recompute defaults
              </button>

              <ZoneList zones={zones} onEditPrice={zoneEditing.editZonePrice} onDelete={zoneEditing.removeZone} />
            </>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/DashboardPage.test.tsx`
Expected: PASS (all tests in this file — 12 pre-existing + 4 new = 16).

- [ ] **Step 9: Run the full frontend suite and type check**

Run: `cd frontend && npx vitest run && npx tsc -b`
Expected: all tests PASS (277 pre-existing + 6 ZoneList.test.tsx + 4 DashboardPage.test.tsx = 287), `tsc -b` exits with no output.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ZoneList.tsx frontend/src/components/ZoneList.test.tsx frontend/src/pages/DashboardPage.tsx frontend/src/pages/DashboardPage.test.tsx
git commit -m "feat: add S/R/Freestyle buttons, the zone list, and Recompute defaults"
```

---

## Final Verification

- [ ] `cd backend && python -m pytest -q` → all pass (208)
- [ ] `cd frontend && npx vitest run` → all pass (287)
- [ ] `cd frontend && npx tsc -b` → no output (clean)
- [ ] Manually confirm: open the app, select a ticker, click S/R/Freestyle to add zones, edit a price in the list, delete one, then click Recompute defaults (with confirm) and see the chart return to auto-computed zones — requires a real backend + real yfinance access, which the automated tests (all of which mock `_fetch_from_provider`/`getChartData`/the zone-mutation client functions) cannot verify.
