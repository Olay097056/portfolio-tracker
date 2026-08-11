"""Tests for the CME zone service (bond-crisis-100 ticket 07).

External fetches (ZQ futures, CME volume API, Deribit, macro dashboard) are
stubbed with known fixtures; the FedWatch math and payload assembly are
tested for real.
"""

import pytest

from app import cme_service


@pytest.fixture(autouse=True)
def _stub_fetches(monkeypatch):
    monkeypatch.setattr(cme_service, "_fetch_zq_futures", lambda: 96.24)
    monkeypatch.setattr(cme_service, "_fetch_gold_flow", lambda days=15: {
        "trade_date": "20260810", "future_volume": 142327,
        "option_volume": 51472, "future_oi": 400331, "option_oi": 797501,
    })
    monkeypatch.setattr(cme_service, "_fetch_deribit_iv",
                        lambda c: {"instrument": f"{c}-XX", "iv": 58.11 if c == "BTC" else 67.52,
                                   "oi": 100.0})
    monkeypatch.setattr(cme_service, "_cot_series", lambda: [{
        "series_id": "cot_gold_mm_net", "name_th": "COT ทองคำ", "value": 130766,
    }])
    cme_service.cache_set(cme_service._CME_CACHE_KEY, None, -1)
    yield
    cme_service.cache_set(cme_service._CME_CACHE_KEY, None, -1)


def test_fedwatch_math():
    fw = cme_service._fedwatch(96.24)
    assert fw["implied_rate"] == pytest.approx(3.76, abs=0.01)
    assert fw["diff_bp"] == pytest.approx(13.0, abs=0.5)
    # 13bp of 25bp -> ~52% hike, rest hold, no cut
    assert fw["prob_hike_pct"] == pytest.approx(52.0, abs=2)
    assert fw["prob_cut_pct"] == 0.0
    assert fw["outcome"] == "hike"
    assert fw["size"] == "+25bp"


def test_fedwatch_hold_when_flat():
    fw = cme_service._fedwatch(96.37)  # implied == EFFR
    assert fw["outcome"] == "hold"
    assert fw["diff_bp"] == pytest.approx(0.0, abs=0.5)


def test_fedwatch_none_on_missing_price():
    assert cme_service._fedwatch(None) is None


def test_gold_flow_matches_reference():
    c = cme_service.build_cme()
    gf = c["gold_flow"]
    # exact values the reference site showed on 2026-08-11
    assert gf["future_oi"] == 400331
    assert gf["option_oi"] == 797501
    assert gf["future_volume"] == 142327


def test_crypto_iv():
    c = cme_service.build_cme()
    assert c["crypto_iv"]["BTC"]["iv"] == 58.11
    assert c["crypto_iv"]["ETH"]["iv"] == 67.52
    # SOL/XRP have no Deribit options — honest None, never fabricated
    assert c["crypto_iv"]["SOL"] is None
    assert c["crypto_iv"]["XRP"] is None


def test_cot_reused_from_macro():
    c = cme_service.build_cme()
    assert any(s["series_id"] == "cot_gold_mm_net" for s in c["cot"])
