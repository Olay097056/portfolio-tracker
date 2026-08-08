# backend/tests/test_macro_router.py
# Macro dashboard reads FRED's public CSV endpoint and yfinance. Every test here
# stubs both layers -- nothing touches the network.
import httpx
import pytest

from app import macro_service
import app.routers.macro as macro_router


@pytest.fixture(autouse=True)
def _clear_cache():
    macro_router._cache.clear()
    macro_service._clear_dashboard_cache()
    yield
    macro_router._cache.clear()
    macro_service._clear_dashboard_cache()


# Real FRED values captured 2026-08-08 (fredgraph.csv).
FRED_ROWS: dict[str, list[tuple[str, float]]] = {
    "DGS3MO": [("2026-08-04", 3.70), ("2026-08-05", 3.71), ("2026-08-06", 3.71)],
    "DGS1": [("2026-08-04", 4.04), ("2026-08-05", 4.05), ("2026-08-06", 4.06)],
    "DGS2": [("2026-08-04", 4.18), ("2026-08-05", 4.18), ("2026-08-06", 4.25)],
    "DGS5": [("2026-08-04", 4.33), ("2026-08-05", 4.34), ("2026-08-06", 4.36)],
    "DGS10": [("2026-08-04", 4.63), ("2026-08-05", 4.63), ("2026-08-06", 4.69)],
    "DGS20": [("2026-08-04", 5.19), ("2026-08-05", 5.21), ("2026-08-06", 5.22)],
    "DGS30": [("2026-08-04", 5.19), ("2026-08-05", 5.20), ("2026-08-06", 5.21)],
    "BAMLH0A0HYM2": [("2026-08-05", 2.75), ("2026-08-06", 2.71)],
    "BAMLC0A0CM": [("2026-08-05", 0.78), ("2026-08-06", 0.78)],
    "SOFR": [("2026-08-05", 3.64), ("2026-08-06", 3.65)],
    "DFF": [("2026-08-05", 3.63), ("2026-08-06", 3.63)],
    "OBFR": [("2026-08-05", 3.63), ("2026-08-06", 3.63)],
    "RRPONTSYD": [("2026-08-06", 1.5), ("2026-08-07", 1.4)],
    "H41RESPPALDKNWW": [("2026-04-29", 0), ("2026-05-06", 0)],
    "STLFSI4": [("2026-07-24", -0.62), ("2026-07-31", -0.51)],
    "WRESBAL": [("2026-07-29", 2984570), ("2026-08-05", 2993349)],
    "DPSACBW027SBOG": [("2026-07-15", 19466615.8), ("2026-07-22", 19401114.7)],
    "DPSSCBW027SBOG": [("2026-07-15", 5644.2), ("2026-07-22", 5635.9)],
    "DFII10": [("2026-08-04", 2.40), ("2026-08-05", 2.42), ("2026-08-06", 2.43)],
    "T10YIE": [("2026-08-05", 2.24), ("2026-08-06", 2.25)],
    "T5YIE": [("2026-08-05", 2.21), ("2026-08-06", 2.22)],
    "UNRATE": [("2026-06-01", 4.2), ("2026-07-01", 4.1)],
    "GFDEGDQ188S": [("2025-10-01", 121.5), ("2026-01-01", 122.59)],
    "HDTGPDUSQ163N": [("2025-04-01", 68.1), ("2025-07-01", 68.55)],
    "DRTSCILM": [("2026-04-01", 4.2), ("2026-07-01", 0.0)],
    "RIFSPPNAAD90NB": [("2026-08-05", 3.75), ("2026-08-06", 3.76)],
    "WLRRAFOIAL": [("2026-07-29", 315000), ("2026-08-05", 317718)],
    "H41RESPPALGTRFNWW": [("2026-07-29", 0), ("2026-08-05", 0)],
    "CPIAUCSL": [("2025-06-01", 330.0), ("2026-05-01", 341.0), ("2026-06-01", 341.8)],
    "PCEPI": [("2025-06-01", 130.0), ("2026-05-01", 134.6), ("2026-06-01", 134.8)],
    "CPILFESL": [("2025-06-01", 320.0), ("2026-05-01", 328.0), ("2026-06-01", 328.2)],
    "GFDEBTN": [("2025-10-01", 38514009), ("2026-01-01", 39065421)],
    "FYFSD": [("2024-09-30", -1815377), ("2025-09-30", -1774684)],
    "GDP": [("2025-10-01", 31422.526), ("2026-01-01", 31865.721)],
}

# TGA opening balance ($M, fiscaldata API) + 10Y auction bid-to-cover
# (TreasuryDirect TA_WS) captured 2026-08-08.
TGA_ROWS: list[tuple[str, float]] = [("2026-08-04", 924219.0), ("2026-08-05", 929325.0)]
AUCTION_ROWS: list[tuple[str, float]] = [("2026-05-12", 2.40), ("2026-07-08", 2.59)]

YF_HISTORY: dict[str, list[tuple[str, float]]] = {
    "DX-Y.NYB": [("2026-08-05", 99.97), ("2026-08-06", 99.60)],
    "^VIX": [("2026-08-05", 15.15), ("2026-08-06", 14.90)],
    "^MOVE": [("2026-08-05", 71.99), ("2026-08-06", 72.03)],
    "GC=F": [("2026-08-05", 4242.00), ("2026-08-06", 4340.70)],
    "SI=F": [("2026-08-05", 61.45), ("2026-08-06", 63.33)],
    "CL=F": [("2026-08-05", 77.29), ("2026-08-06", 78.18)],
    "BZ=F": [("2026-08-05", 80.10), ("2026-08-06", 81.35)],
}


def _stub_fred(monkeypatch):
    monkeypatch.setattr(macro_service, "_fetch_fred_series_map", lambda ids: {i: FRED_ROWS.get(i) for i in ids})


def _stub_yfinance(monkeypatch):
    monkeypatch.setattr(macro_service, "_yf_history", lambda ticker: YF_HISTORY.get(ticker, []))


def _stub_extras(monkeypatch):
    monkeypatch.setattr(macro_service, "_fetch_tga", lambda: TGA_ROWS)
    monkeypatch.setattr(macro_service, "_fetch_auction_bid_to_cover", lambda term="10-Year": AUCTION_ROWS)
    monkeypatch.setattr(macro_service, "_fetch_auction_indirect_share", lambda term="10-Year": [("2026-07-08", 65.2)])
    monkeypatch.setattr(macro_service, "_fetch_cftc", lambda dataset="disagg": COT_DISAGG if dataset == "disagg" else COT_TFF)
    monkeypatch.setattr(macro_service, "_fetch_tic", lambda: TIC_ROWS)
    monkeypatch.setattr(macro_service, "_fetch_eia", lambda series_id: EIA_ROWS.get(series_id))


# COT fixture rows (CFTC Socrata shape): gold money-manager long/short,
# UST 10Y TFF leveraged long/short + asset-manager long/short.
COT_DISAGG: list[dict] = [
    {"cftc_contract_market_code": "088691", "report_date_as_yyyy_mm_dd": "2026-08-04T00:00:00.000",
     "m_money_positions_long_all": "139809", "m_money_positions_short_all": "9043"},
]
COT_TFF: list[dict] = [
    {"cftc_contract_market_code": "043602", "report_date_as_yyyy_mm_dd": "2026-08-04T00:00:00.000",
     "lev_money_positions_long": "50000", "lev_money_positions_short": "30000",
     "asset_mgr_positions_long": "200000", "asset_mgr_positions_short": "150000"},
    {"cftc_contract_market_code": "098662", "report_date_as_yyyy_mm_dd": "2026-08-04T00:00:00.000",
     "lev_money_positions_long": "40000", "lev_money_positions_short": "45000"},
]
# TIC mfh.txt summary lines: (normalised key, latest $B value)
TIC_ROWS: list[tuple[str, float]] = [("grand_total", 7402.5), ("foreign_official", 3713.9)]
EIA_ROWS: dict[str, list[tuple[str, float]]] = {
    "WCESTUS1": [("2026-07-31", 425.0), ("2026-08-07", 418.0)],
    "WGTSTUS1": [("2026-07-31", 210.0), ("2026-08-07", 212.0)],
    "WDISTUS1": [("2026-07-31", 105.0), ("2026-08-07", 104.0)],
}


def _client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)


# --- Happy path ---------------------------------------------------------------


def test_happy_path_all_sections_populated(monkeypatch):
    _stub_fred(monkeypatch)
    _stub_yfinance(monkeypatch)
    _stub_extras(monkeypatch)
    response = _client().get("/api/macro")
    assert response.status_code == 200
    body = response.json()

    # Yield curve panel
    curve = body["yield_curve"]
    tenors = [p["tenor"] for p in curve["points"]]
    assert tenors == ["13W", "1Y", "2Y", "5Y", "10Y", "20Y", "30Y"]
    assert all(p["available"] for p in curve["points"])
    ten_year = next(p for p in curve["points"] if p["tenor"] == "10Y")
    assert ten_year["yield"] == 4.69
    assert ten_year["change_bps"] == 6.0
    # 10Y - 2Y = 4.69 - 4.25 = 0.44 -> 44 bps, not inverted
    assert curve["spread_10y2y_bps"] == 44.0
    assert curve["inverted"] is False

    # Six sections in the reference page's order (positioning is new)
    keys = [s["key"] for s in body["sections"]]
    assert keys == ["treasuryYields", "moneyMarketRates", "macroIndicators", "creditSpreads",
                    "positioning", "bankingIndicators"]

    by_key = {s["key"]: s for s in body["sections"]}
    assert by_key["treasuryYields"]["title_th"] == "ผลตอบแทนพันธบัตรสหรัฐ"

    # HY spread card: FRED % -> bps (2.71% -> 271 bps, -4 bps change)
    hy = next(i for i in by_key["creditSpreads"]["items"] if i["series_id"] == "us_hy_spread")
    assert hy["value"] == 271.0
    assert hy["change_val"] == -4.0
    assert hy["unit"] == "bps"

    # SOFR-EFFR spread card is computed: (3.65 - 3.63) * 100 = 2 bps
    spread = next(i for i in by_key["moneyMarketRates"]["items"] if i["series_id"] == "us_sofr_effr_spread")
    assert spread["value"] == 2.0

    # YoY inflation: CPIAUCSL 341.8 vs 330.0 a year ago -> 3.58%
    cpi = next(i for i in by_key["macroIndicators"]["items"] if i["series_id"] == "us_cpi_yoy")
    assert cpi["value"] == pytest.approx(3.58, abs=0.01)

    # Debt/GDP: GFDEBTN millions -> billions, ratio vs GDP
    debt = next(i for i in by_key["creditSpreads"]["items"] if i["series_id"] == "us_debt_gdp")
    assert debt["value"] == pytest.approx(39065.421 / 31865.721 * 100, abs=0.1)

    # Bank reserves: WRESBAL millions -> $B
    reserves = next(i for i in by_key["bankingIndicators"]["items"] if i["series_id"] == "us_bank_reserves")
    assert reserves["value"] == pytest.approx(2993.3, abs=0.1)
    assert reserves["unit"] == "$B"

    # yfinance-backed cards
    dxy = next(i for i in by_key["macroIndicators"]["items"] if i["series_id"] == "dxy")
    assert dxy["value"] == 99.60
    assert dxy["change_pct"] == pytest.approx(-0.37, abs=0.01)

    # Bank deposits: FRED DPSACBW027SBOG millions -> $B (19401.1 B)
    deposits = next(i for i in by_key["bankingIndicators"]["items"] if i["series_id"] == "us_bank_deposits")
    assert deposits["value"] == pytest.approx(19401.1, abs=0.1)
    assert deposits["available"]

    # TGA from the Treasury Fiscal Data API: $M -> $B (929.3 B)
    tga = next(i for i in by_key["moneyMarketRates"]["items"] if i["series_id"] == "us_tga")
    assert tga["available"]
    assert tga["value"] == pytest.approx(929.3, abs=0.1)

    # 10Y auction bid-to-cover from TreasuryDirect TA_WS
    auction = next(i for i in by_key["creditSpreads"]["items"] if i["series_id"] == "us_auction_btc")
    assert auction["available"]
    assert auction["value"] == pytest.approx(2.59, abs=0.01)

    # MOVE index via yfinance
    move = next(i for i in by_key["macroIndicators"]["items"] if i["series_id"] == "move")
    assert move["available"]
    assert move["value"] == pytest.approx(72.03, abs=0.01)

    # COT gold money-manager net: 139,809 - 9,043 contracts
    cot_gold = next(i for i in by_key["positioning"]["items"] if i["series_id"] == "cot_gold_mm_net")
    assert cot_gold["available"]
    assert cot_gold["value"] == pytest.approx(130766, abs=1)

    # COT UST 10Y leveraged net: 50,000 - 30,000
    cot_10y_lev = next(i for i in by_key["positioning"]["items"] if i["series_id"] == "cot_ust10y_lev_net")
    assert cot_10y_lev["available"]
    assert cot_10y_lev["value"] == pytest.approx(20000, abs=1)

    # TIC totals ($B)
    tic_total = next(i for i in by_key["positioning"]["items"] if i["series_id"] == "foreign_ust_total")
    assert tic_total["available"]
    assert tic_total["value"] == pytest.approx(7402.5, abs=0.1)

    # Real yield + unemployment from FRED
    real10y = next(i for i in by_key["macroIndicators"]["items"] if i["series_id"] == "us_10y_real")
    assert real10y["available"]
    unemployment = next(i for i in by_key["macroIndicators"]["items"] if i["series_id"] == "us_unemployment")
    assert unemployment["available"]

    # EIA inventory + WoW change
    crude = next(i for i in by_key["bankingIndicators"]["items"] if i["series_id"] == "us_crude_inventory")
    assert crude["available"]
    assert crude["value"] == pytest.approx(418.0, abs=0.1)
    crude_chg = next(i for i in by_key["bankingIndicators"]["items"] if i["series_id"] == "us_crude_inventory_chg")
    assert crude_chg["available"]
    assert crude_chg["value"] == pytest.approx(-7.0, abs=0.1)

    assert any("FRED" in s for s in body["data_sources"])
    assert any("Yahoo Finance" in s for s in body["data_sources"])
    assert any("fiscaldata.treasury.gov" in s for s in body["data_sources"])
    assert any("TreasuryDirect" in s for s in body["data_sources"])
    assert any("CFTC" in s for s in body["data_sources"])
    assert any("Treasury International Capital" in s for s in body["data_sources"])
    assert any("EIA" in s for s in body["data_sources"])
    assert body["gold_cme"]["available"] is False
    assert body["gold_cme"]["note"]


def test_router_caches_within_ttl(monkeypatch):
    _stub_fred(monkeypatch)
    _stub_yfinance(monkeypatch)
    _stub_extras(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real_build = macro_service.build_dashboard

    def counting_build(force: bool = False):
        calls["n"] += 1
        return real_build(force=force)

    monkeypatch.setattr(macro_service, "build_dashboard", counting_build)

    client.get("/api/macro")
    client.get("/api/macro")
    assert calls["n"] == 1


# --- Inverted curve -----------------------------------------------------------


def test_inverted_curve_flag_when_10y_below_2y(monkeypatch):
    rows = {k: list(v) for k, v in FRED_ROWS.items()}
    rows["DGS10"] = [("2026-08-04", 4.10), ("2026-08-05", 4.10), ("2026-08-06", 4.10)]
    monkeypatch.setattr(macro_service, "_fetch_fred_series_map", lambda ids: {i: rows.get(i) for i in ids})
    _stub_yfinance(monkeypatch)
    _stub_extras(monkeypatch)

    body = _client().get("/api/macro").json()
    assert body["yield_curve"]["spread_10y2y_bps"] == -15.0
    assert body["yield_curve"]["inverted"] is True


# --- FRED down: yfinance fallback for yields ----------------------------------


def test_fred_down_falls_back_to_yfinance_tickers(monkeypatch):
    monkeypatch.setattr(macro_service, "_fetch_fred_series_map", lambda ids: {})
    _stub_extras(monkeypatch)
    # Only the CBOE treasury tickers + assets have yfinance rows in this scenario.
    monkeypatch.setattr(
        macro_service,
        "_yf_history",
        lambda ticker: {
            "^IRX": [("2026-08-05", 3.70), ("2026-08-06", 3.72)],
            "^TNX": [("2026-08-05", 4.63), ("2026-08-06", 4.70)],
            "^FVX": [("2026-08-05", 4.33), ("2026-08-06", 4.35)],
            "^TYX": [("2026-08-05", 5.19), ("2026-08-06", 5.20)],
        }.get(ticker, []),
    )

    response = _client().get("/api/macro")
    assert response.status_code == 200
    body = response.json()
    curve = {p["tenor"]: p for p in body["yield_curve"]["points"]}

    # Tenors CBOE/yfinance can provide are real; the rest are honestly unavailable.
    assert curve["13W"]["available"] and curve["13W"]["yield"] == 3.72
    assert curve["10Y"]["available"] and curve["10Y"]["yield"] == 4.70
    assert curve["10Y"]["change_bps"] == 7.0
    for tenor in ("1Y", "2Y", "20Y"):
        assert not curve[tenor]["available"]
        assert curve[tenor]["yield"] is None

    # The yields came from yfinance, so FRED must not be named as a source.
    assert not any("FRED" in s for s in body["data_sources"])


# --- Total failure ------------------------------------------------------------


def test_both_sources_down_returns_200_with_unavailable_sections(monkeypatch):
    monkeypatch.setattr(macro_service, "_fetch_fred_series_map", lambda ids: {})
    monkeypatch.setattr(macro_service, "_yf_history", lambda ticker: [])
    monkeypatch.setattr(macro_service, "_fetch_tga", lambda: None)
    monkeypatch.setattr(macro_service, "_fetch_auction_bid_to_cover", lambda term="10-Year": None)
    monkeypatch.setattr(macro_service, "_fetch_auction_indirect_share", lambda term="10-Year": None)
    monkeypatch.setattr(macro_service, "_fetch_cftc", lambda dataset="disagg": None)
    monkeypatch.setattr(macro_service, "_fetch_tic", lambda: None)
    monkeypatch.setattr(macro_service, "_fetch_eia", lambda series_id: None)

    response = _client().get("/api/macro")
    assert response.status_code == 200
    body = response.json()
    assert all(not p["available"] for p in body["yield_curve"]["points"])
    assert body["yield_curve"]["spread_10y2y_bps"] is None
    for section in body["sections"]:
        assert all(not i["available"] for i in section["items"])
    assert body["data_sources"] == []


# --- CSV parsing: '.' missing-day rows ---------------------------------------


class _FakeTextResponse:
    def __init__(self, text: str, status_code: int = 200):
        self.text = text
        self.status_code = status_code


def test_fred_csv_parser_skips_dot_rows(monkeypatch):
    csv_text = (
        "observation_date,DGS10\n"
        "2026-08-04,4.63\n"
        "2026-08-05,.\n"  # missing day (holiday) -- must be skipped, not read as 0
        "2026-08-06,4.69\n"
    )
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _FakeTextResponse(csv_text))

    rows = macro_service._fetch_fred_series("DGS10")
    assert rows == [("2026-08-04", 4.63), ("2026-08-06", 4.69)]
    assert macro_service._last_two(rows) == ("2026-08-06", 4.69, 4.63)


def test_fred_csv_parser_returns_none_on_error(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(httpx, "get", boom)
    assert macro_service._fetch_fred_series("DGS10") is None


# --- TGA parser: only the opening-balance row counts -------------------------


class _FakeJsonResponse:
    def __init__(self, payload, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def test_tga_parser_keeps_only_opening_balance_rows(monkeypatch):
    """The DTS endpoint returns 4 rows per day (opening / deposits / withdrawals /
    closing); only the TGA Opening Balance row is a balance we can display."""
    payload = {
        "data": [
            {"record_date": "2026-08-06", "account_type": "Treasury General Account (TGA) Opening Balance",
             "open_today_bal": "929325"},
            {"record_date": "2026-08-06", "account_type": "Total TGA Deposits (Table II)", "open_today_bal": "350416"},
            {"record_date": "2026-08-06", "account_type": "Total TGA Withdrawals (Table II) (-)", "open_today_bal": "318015"},
            {"record_date": "2026-08-06", "account_type": "Treasury General Account (TGA) Closing Balance",
             "open_today_bal": "961726"},
            {"record_date": "2026-08-05", "account_type": "Treasury General Account (TGA) Opening Balance",
             "open_today_bal": "924219"},
        ]
    }
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _FakeJsonResponse(payload))
    rows = macro_service._fetch_tga()
    assert rows == [("2026-08-05", 924219.0), ("2026-08-06", 929325.0)]


# --- Refresh endpoint ---------------------------------------------------------


def test_refresh_invalidates_cache(monkeypatch):
    _stub_fred(monkeypatch)
    _stub_yfinance(monkeypatch)
    _stub_extras(monkeypatch)
    client = _client()
    calls = {"n": 0}
    real_build = macro_service.build_dashboard

    def counting_build(force: bool = False):
        calls["n"] += 1
        return real_build(force=force)

    monkeypatch.setattr(macro_service, "build_dashboard", counting_build)

    client.get("/api/macro")
    client.get("/api/macro")
    assert calls["n"] == 1

    response = client.post("/api/macro/refresh")
    assert response.status_code == 200
    assert calls["n"] == 2
