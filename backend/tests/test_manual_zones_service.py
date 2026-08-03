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
