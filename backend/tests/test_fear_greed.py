# backend/tests/test_fear_greed.py
# Fear & Greed reads CNN's index first and falls back to a smaller composite computed
# here. Every test stubs both layers -- nothing touches the network.
import httpx
import pytest

from app import fear_greed_service as fg
import app.routers.fear_greed as fg_router


@pytest.fixture(autouse=True)
def _clear_cache():
    
    yield
    


# Shape captured from CNN's live response on 2026-08-08.
CNN_PAYLOAD = {
    "fear_and_greed": {
        "score": 63.6857142857143,
        "rating": "greed",
        "timestamp": "2026-08-07T23:59:47+00:00",
        "previous_close": 59.7142857142857,
        "previous_1_week": 45.2285714285714,
        "previous_1_month": 39.771428571428565,
        "previous_1_year": 54.71428571428572,
    },
    "fear_and_greed_historical": {
        "data": [
            {"x": 1754611200000.0, "y": 58.37142857142857, "rating": "greed"},
            {"x": 1786147187000.0, "y": 63.6857142857143, "rating": "greed"},
        ]
    },
    "market_momentum_sp500": {
        "score": 79.8,
        "rating": "extreme greed",
        "data": [{"x": 1786135824000.0, "y": 7757.64, "rating": "extreme greed"}],
    },
    "market_volatility_vix": {
        "score": 50.0,
        "rating": "neutral",
        # Live data tags this calm 14.9 VIX reading "extreme fear" at the point level --
        # the parser must not carry that through.
        "data": [{"x": 1786133701000.0, "y": 14.9, "rating": "extreme fear"}],
    },
}


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def _stub_cnn(monkeypatch, payload, status_code=200):
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _FakeResponse(payload, status_code))


def _stub_no_market_data(monkeypatch):
    monkeypatch.setattr(fg, "_closes", lambda *a, **k: [])


# --- rating bands --------------------------------------------------------------------


@pytest.mark.parametrize(
    "score,expected",
    [
        (0, "extreme fear"),
        (24.9, "extreme fear"),
        (25, "fear"),
        (44.9, "fear"),
        (45, "neutral"),
        (55, "neutral"),
        (55.1, "greed"),
        (75, "greed"),
        (75.1, "extreme greed"),
        (100, "extreme greed"),
    ],
)
def test_rating_bands_match_cnns(score, expected):
    assert fg.rating_for_score(score) == expected


def test_rating_is_absent_for_a_missing_score():
    assert fg.rating_for_score(None) is None


# --- CNN parsing ---------------------------------------------------------------------


def test_parses_cnn_score_ratings_and_comparison_points(monkeypatch):
    _stub_cnn(monkeypatch, CNN_PAYLOAD)

    data = fg.fetch_cnn()

    assert data["source"] == "cnn"
    assert data["score"] == pytest.approx(63.6857, rel=1e-4)
    assert data["rating"] == "greed"
    assert data["previous_1_month"] == pytest.approx(39.7714, rel=1e-4)
    assert len(data["history"]) == 2
    assert data["history"][0] == {"t": 1754611200000, "value": pytest.approx(58.3714, rel=1e-4)}


def test_indicator_series_drops_cnns_unreliable_per_point_rating(monkeypatch):
    """CNN tags a 14.9 VIX -- a calm reading -- as "extreme fear" at the point level,
    disagreeing with its own block rating of neutral. Carrying that through would label
    the chart with something the data does not support."""
    _stub_cnn(monkeypatch, CNN_PAYLOAD)

    data = fg.fetch_cnn()
    vix = next(i for i in data["indicators"] if i["key"] == "market_volatility")

    assert vix["rating"] == "neutral"
    assert vix["latest_value"] == 14.9
    assert vix["series"] == [{"t": 1786133701000, "value": 14.9}]
    assert "rating" not in vix["series"][0]


def test_only_indicators_present_upstream_are_returned(monkeypatch):
    _stub_cnn(monkeypatch, CNN_PAYLOAD)

    keys = {i["key"] for i in fg.fetch_cnn()["indicators"]}

    assert keys == {"market_momentum", "market_volatility"}


def test_fetch_cnn_returns_none_on_non_200(monkeypatch):
    _stub_cnn(monkeypatch, CNN_PAYLOAD, status_code=503)
    assert fg.fetch_cnn() is None


def test_fetch_cnn_returns_none_on_unrecognisable_payload(monkeypatch):
    _stub_cnn(monkeypatch, {"unexpected": "shape"})
    assert fg.fetch_cnn() is None

    _stub_cnn(monkeypatch, {"fear_and_greed": {"rating": "greed"}})  # no score
    assert fg.fetch_cnn() is None


def test_fetch_cnn_returns_none_when_unreachable(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "get", boom)
    assert fg.fetch_cnn() is None


# --- computed fallback ---------------------------------------------------------------


def test_fallback_scores_a_rising_market_as_greed(monkeypatch):
    """S&P well above its long average, VIX below its own, stocks beating bonds and junk
    beating investment grade -- every input points the same way."""
    rising = [100.0 + i for i in range(300)]        # steadily up
    calm_vix = [20.0] * 260 + [14.0]                # latest below its 50-day average
    bonds_flat = [100.0] * 300

    def closes(symbol, period="1y"):
        return {"^GSPC": rising, "^VIX": calm_vix, "SPY": rising, "TLT": bonds_flat,
                "HYG": rising, "LQD": bonds_flat}[symbol]

    monkeypatch.setattr(fg, "_closes", closes)

    data = fg.compute_fallback()

    assert data["source"] == "computed"
    assert data["score"] > 55
    assert data["rating"] in ("greed", "extreme greed")
    assert {i["key"] for i in data["indicators"]} == {
        "market_momentum", "market_volatility", "safe_haven_demand", "junk_bond_demand"
    }


def test_fallback_scores_a_falling_panicky_market_as_fear(monkeypatch):
    falling = [400.0 - i for i in range(300)]
    spiking_vix = [15.0] * 260 + [40.0]             # far above its 50-day average
    bonds_up = [100.0 + i * 0.5 for i in range(300)]

    def closes(symbol, period="1y"):
        return {"^GSPC": falling, "^VIX": spiking_vix, "SPY": falling, "TLT": bonds_up,
                "HYG": falling, "LQD": bonds_up}[symbol]

    monkeypatch.setattr(fg, "_closes", closes)

    data = fg.compute_fallback()

    assert data["score"] < 45
    assert data["rating"] in ("fear", "extreme fear")


def test_fallback_skips_inputs_whose_data_is_missing(monkeypatch):
    """A symbol that fails to fetch contributes no indicator at all -- it is not scored 50
    and folded into the mean, which would quietly drag the composite toward neutral."""
    rising = [100.0 + i for i in range(300)]

    def closes(symbol, period="1y"):
        return rising if symbol in ("^GSPC", "SPY", "TLT") else []

    monkeypatch.setattr(fg, "_closes", closes)

    data = fg.compute_fallback()
    keys = {i["key"] for i in data["indicators"]}

    assert "market_momentum" in keys
    assert "market_volatility" not in keys
    assert "junk_bond_demand" not in keys


def test_fallback_returns_none_when_no_input_resolves(monkeypatch):
    _stub_no_market_data(monkeypatch)
    assert fg.compute_fallback() is None


def test_fallback_leaves_comparison_points_absent_rather_than_inventing_them(monkeypatch):
    """CNN supplies previous close / 1w / 1m / 1y. This composite keeps no history, so
    those must be null instead of back-filled."""
    rising = [100.0 + i for i in range(300)]
    monkeypatch.setattr(fg, "_closes", lambda *a, **k: rising)

    data = fg.compute_fallback()

    assert data["previous_close"] is None
    assert data["previous_1_year"] is None
    assert data["history"] == []


def test_fallback_scores_are_clamped_to_the_0_100_range(monkeypatch):
    """One runaway input must not push the composite off the scale."""
    absurd_rise = [1.0] * 200 + [1_000_000.0]
    monkeypatch.setattr(fg, "_closes", lambda *a, **k: absurd_rise)

    data = fg.compute_fallback()

    assert all(0 <= i["score"] <= 100 for i in data["indicators"])
    assert 0 <= data["score"] <= 100


# --- endpoint ------------------------------------------------------------------------


def test_endpoint_prefers_cnn(client, monkeypatch):
    monkeypatch.setattr(fg, "fetch_cnn", lambda: {**CNN_PARSED})

    def explode():
        raise AssertionError("fallback must not run when CNN answers")

    monkeypatch.setattr(fg, "compute_fallback", explode)

    body = client.get("/api/fear-greed").json()

    assert body["source"] == "cnn"
    assert body["score"] == 63.7


CNN_PARSED = {
    "score": 63.7,
    "rating": "greed",
    "updated_at": "2026-08-07T23:59:47+00:00",
    "previous_close": 59.7,
    "previous_1_week": 45.2,
    "previous_1_month": 39.8,
    "previous_1_year": 54.7,
    "history": [{"t": 1754611200000, "value": 58.4}],
    "indicators": [
        {"key": "market_momentum", "label": "Market Momentum", "score": 79.8,
         "rating": "extreme greed", "latest_value": 7757.64, "series": []}
    ],
    "source": "cnn",
}

COMPUTED_PARSED = {
    "score": 71.2,
    "rating": "greed",
    "updated_at": "2026-08-08T00:00:00+00:00",
    "previous_close": None,
    "previous_1_week": None,
    "previous_1_month": None,
    "previous_1_year": None,
    "history": [],
    "indicators": [
        {"key": "market_momentum", "label": "Market Momentum", "score": 90.0,
         "rating": "extreme greed", "latest_value": 8.13, "series": []}
    ],
    "source": "computed",
}


def test_endpoint_falls_back_when_cnn_is_unavailable(client, monkeypatch):
    monkeypatch.setattr(fg, "fetch_cnn", lambda: None)
    monkeypatch.setattr(fg, "compute_fallback", lambda: {**COMPUTED_PARSED})

    body = client.get("/api/fear-greed").json()

    assert body["source"] == "computed"
    assert body["score"] == 71.2
    # The UI needs to be able to say "no comparison points on this source".
    assert body["previous_1_year"] is None


def test_endpoint_503s_when_no_source_produces_anything(client, monkeypatch):
    monkeypatch.setattr(fg, "fetch_cnn", lambda: None)
    monkeypatch.setattr(fg, "compute_fallback", lambda: None)

    assert client.get("/api/fear-greed").status_code == 503


def test_endpoint_is_cached(client, monkeypatch):
    calls = {"n": 0}

    def counting():
        calls["n"] += 1
        return {**CNN_PARSED}

    monkeypatch.setattr(fg, "fetch_cnn", counting)

    client.get("/api/fear-greed")
    client.get("/api/fear-greed")

    assert calls["n"] == 1
