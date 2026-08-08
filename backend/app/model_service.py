# backend/app/model_service.py
"""Profit models for the Bond-crisis tab — mirrors the reference site's
/models page ("โมเดลทำกำไร"): six regime models, each scored 0-100 from
live macro inputs, with an expandable card (conditions, trade direction,
signal map) and a 30-day score history.

The six models, their Thai/English names, concepts, indicator weights and
signal maps are captured verbatim from the reference site's public frontend
bundle (2026-08-08); the scoring itself is computed here from the same real
data sources the macro dashboard uses (FRED / yfinance / CFTC / TIC /
TreasuryDirect). Nothing is scraped from the reference site at runtime.

Scoring follows the reference formula (shown on the page):
    Total = โครงสร้างตลาด + มหภาค + ข่าว + ยืนยัน + บทลงโทษ (0-100)
with factor caps market_structure=25, macro=30, news=15, confirmation=20,
risk_penalty=15. Each indicator is scored 0-100 and blended by weight;
indicators whose input data is unavailable are dropped (never guessed).
Status follows the reference thresholds: >=40 building, >=60 active.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from app import macro_service

# ---------------------------------------------------------------------------
# Factor caps — the reference page's scoring formula.
# ---------------------------------------------------------------------------
FACTOR_CAPS = {
    "market_structure": 25.0,
    "macro": 30.0,
    "news": 15.0,
    "confirmation": 20.0,
    "risk_penalty": 15.0,
}
FACTOR_ORDER = ["market_structure", "macro", "news", "confirmation", "risk_penalty"]
FACTOR_LABELS_TH = {
    "market_structure": "โครงสร้างตลาด",
    "macro": "ข้อมูลมหภาค",
    "news": "ข่าวสาร",
    "confirmation": "สัญญาณยืนยัน",
    "risk_penalty": "บทลงโทษความเสี่ยง",
}

# Reference thresholds: score >= 60 = active, >= 40 = building.
BUILDING_THRESHOLD = 40.0
ACTIVE_THRESHOLD = 60.0

# Reference model colours (from the site's bundle).
MODEL_COLORS = {
    "recovery-reflation": "#38bdf8",
    "inflation-oil": "#f59e0b",
    "fed-pivot": "#a78bfa",
    "yield-shock": "#f97316",
    "credit-panic": "#f87171",
    "bank-run": "#34d399",
}

STATUS_META = {
    "inactive": {"en": "Inactive", "th": "ไม่ทำงาน"},
    "building": {"en": "Building", "th": "กำลังก่อตัว"},
    "active": {"en": "Active", "th": "ทำงาน"},
    "fading": {"en": "Fading", "th": "อ่อนแรง"},
}


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def _score_linear(x: float, lo: float, hi: float, invert: bool = False) -> float:
    """Map x in [lo, hi] -> [0, 100]. Below lo -> 0, above hi -> 100
    (or the reverse when invert=True)."""
    if hi == lo:
        return 50.0
    t = (x - lo) / (hi - lo)
    t = max(0.0, min(1.0, t))
    return _clamp((1.0 - t) * 100.0 if invert else t * 100.0)


def _pct_change(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or not b:
        return None
    return (a / b - 1.0) * 100.0


# ---------------------------------------------------------------------------
# Indicator scoring — one function per indicator id, scored from the live
# context (a dict of values assembled from the macro dashboard's cards).
# Each returns 0-100 or None when its input is unavailable.
# ---------------------------------------------------------------------------

def _ctx_value(ctx: dict, *keys: str) -> float | None:
    for k in keys:
        v = ctx.get(k)
        if v is not None:
            return v
    return None


def _score_hy_narrowing(ctx: dict) -> float | None:
    hy = _ctx_value(ctx, "hy_spread_bps")
    return _score_linear(hy, 150.0, 400.0, invert=True) if hy is not None else None


def _score_hy_blowout(ctx: dict) -> float | None:
    hy = _ctx_value(ctx, "hy_spread_bps")
    return _score_linear(hy, 250.0, 500.0) if hy is not None else None


def _score_vix_calm(ctx: dict) -> float | None:
    vix = _ctx_value(ctx, "vix")
    if vix is None:
        return None
    return 100.0 if vix < 18.0 else _score_linear(vix, 18.0, 30.0, invert=True)


def _score_vix_panic(ctx: dict) -> float | None:
    vix = _ctx_value(ctx, "vix")
    if vix is None:
        return None
    return 100.0 if vix >= 25.0 else _score_linear(vix, 12.0, 25.0)


def _score_dxy_weak(ctx: dict) -> float | None:
    dxy = _ctx_value(ctx, "dxy")
    return _score_linear(dxy, 98.0, 106.0, invert=True) if dxy is not None else None


def _score_dxy_strong(ctx: dict) -> float | None:
    dxy = _ctx_value(ctx, "dxy")
    return _score_linear(dxy, 98.0, 106.0) if dxy is not None else None


def _score_us10y_falling(ctx: dict) -> float | None:
    y = _ctx_value(ctx, "us10y")
    return _score_linear(y, 3.4, 4.8, invert=True) if y is not None else None


def _score_us10y_shock(ctx: dict) -> float | None:
    y = _ctx_value(ctx, "us10y")
    if y is None:
        return None
    if y > 4.5:
        return 100.0
    return _score_linear(y, 3.6, 4.5)


def _score_us10y_stable(ctx: dict) -> float | None:
    y = _ctx_value(ctx, "us10y")
    return _score_linear(y, 3.4, 4.8, invert=True) if y is not None else None


def _score_curve_uninverting(ctx: dict) -> float | None:
    spread = _ctx_value(ctx, "curve_10y2y_bps")
    return _score_linear(spread, -50.0, 50.0) if spread is not None else None


def _score_move_calm(ctx: dict) -> float | None:
    move = _ctx_value(ctx, "move")
    if move is None:
        return None
    return 100.0 if move < 100.0 else _score_linear(move, 100.0, 130.0, invert=True)


def _score_move_stress(ctx: dict) -> float | None:
    move = _ctx_value(ctx, "move")
    if move is None:
        return None
    return 100.0 if move >= 100.0 else _score_linear(move, 60.0, 100.0)


def _score_oil_high(ctx: dict) -> float | None:
    oil = _ctx_value(ctx, "usoil")
    if oil is None:
        return None
    return 100.0 if oil >= 85.0 else _score_linear(oil, 60.0, 85.0)


def _score_core_pce_high(ctx: dict) -> float | None:
    pce = _ctx_value(ctx, "us_pce_yoy")
    if pce is None:
        return None
    return 100.0 if pce > 2.0 else _score_linear(pce, 1.0, 3.0)


def _score_cpi_accel(ctx: dict) -> float | None:
    cpi = _ctx_value(ctx, "us_cpi_yoy")
    return _score_linear(cpi, 1.5, 4.0) if cpi is not None else None


def _score_cpi_slow(ctx: dict) -> float | None:
    cpi = _ctx_value(ctx, "us_cpi_yoy")
    return _score_linear(cpi, 1.5, 4.0, invert=True) if cpi is not None else None


def _score_real_yield_high(ctx: dict) -> float | None:
    ry = _ctx_value(ctx, "us_10y_real")
    return _score_linear(ry, 0.5, 2.5) if ry is not None else None


def _score_gold_rising(ctx: dict) -> float | None:
    gold = _ctx_value(ctx, "xauusd")
    chg = _ctx_value(ctx, "gold_chg_pct")
    if gold is None and chg is None:
        return None
    if gold is not None and chg is None:
        return 50.0
    return _score_linear(chg, -1.5, 1.5) if chg is not None else None


def _score_gold_crowded(ctx: dict) -> float | None:
    """Managed-money gold net > 200k contracts = crowded = risk (deduct)."""
    net = _ctx_value(ctx, "cot_gold_mm_net")
    return _score_linear(net, 100000.0, 250000.0) if net is not None else None


def _score_auction_demand_weak(ctx: dict) -> float | None:
    btc = _ctx_value(ctx, "auction_btc")
    if btc is None:
        return None
    return 100.0 if btc < 2.4 else _score_linear(btc, 2.4, 3.0, invert=True)


def _score_deposits_shrinking(ctx: dict) -> float | None:
    chg = _ctx_value(ctx, "deposits_chg_pct")
    if chg is None:
        return None
    return _score_linear(chg, -1.0, 0.5, invert=True)


def _score_discount_window_spike(ctx: dict) -> float | None:
    dw = _ctx_value(ctx, "discount_window_b")
    return _score_linear(dw, 0.0, 5.0) if dw is not None else None


def _score_reserves_scarcity(ctx: dict) -> float | None:
    reserves = _ctx_value(ctx, "bank_reserves_b")
    if reserves is None:
        return None
    return 100.0 if reserves < 3000.0 else _score_linear(reserves, 3000.0, 3500.0, invert=True)


def _score_rrp_drained(ctx: dict) -> float | None:
    rrp = _ctx_value(ctx, "on_rrp_b")
    if rrp is None:
        return None
    return 100.0 if rrp < 300.0 else _score_linear(rrp, 300.0, 1000.0, invert=True)


def _score_sofr_effr_stress(ctx: dict) -> float | None:
    spread = _ctx_value(ctx, "sofr_effr_spread_bps")
    return _score_linear(spread, 0.0, 10.0) if spread is not None else None


def _score_nas100_rally(ctx: dict) -> float | None:
    chg = _ctx_value(ctx, "nas100_chg_pct")
    return _score_linear(chg, -1.5, 1.5) if chg is not None else None


def _score_nas100_breakdown(ctx: dict) -> float | None:
    chg = _ctx_value(ctx, "nas100_chg_pct")
    return _score_linear(chg, -1.5, 1.5, invert=True) if chg is not None else None


def _score_jpy_weak(ctx: dict) -> float | None:
    jpy = _ctx_value(ctx, "usdjpy")
    return _score_linear(jpy, 140.0, 160.0) if jpy is not None else None


def _score_us30y_surge(ctx: dict) -> float | None:
    y = _ctx_value(ctx, "us30y")
    return _score_linear(y, 4.2, 5.4) if y is not None else None


def _score_ig_widening(ctx: dict) -> float | None:
    ig = _ctx_value(ctx, "ig_spread_bps")
    return _score_linear(ig, 80.0, 200.0) if ig is not None else None


def _score_reserves_drain(ctx: dict) -> float | None:
    """Bank reserves draining fast (>$150B / 60d) pressures the Fed to pivot."""
    chg = _ctx_value(ctx, "reserves_chg_pct")
    if chg is None:
        return None
    return _score_linear(chg, -3.0, 0.0, invert=True)


def _score_us2y_collapse(ctx: dict) -> float | None:
    chg = _ctx_value(ctx, "us2y_chg")
    return _score_linear(chg, -0.3, 0.0, invert=True) if chg is not None else None


def _score_bank_basket_breakdown(ctx: dict) -> float | None:
    chg = _ctx_value(ctx, "kre_chg_pct")
    return _score_linear(chg, -3.0, 0.0, invert=True) if chg is not None else None


# indicator id -> scorer. The id is the English indicator name, slugified,
# matching the reference metadata; unknown indicators yield None.
INDICATOR_SCORERS: dict[str, callable] = {
    "credit_spread_narrowing_hy": _score_hy_narrowing,
    "vix_falling": _score_vix_calm,
    "dxy": _score_dxy_weak,
    "us10y": _score_us10y_falling,
    "yield_curve_2y_10y": _score_curve_uninverting,
    "move_index": _score_move_calm,
    "usoil_price": _score_oil_high,
    "core_pce": _score_core_pce_high,
    "cpi_yoy": _score_cpi_accel,
    "cot_gold_positioning_risk": _score_gold_crowded,
    "us10y_us2y_yield": _score_us10y_falling,
    "cpi_pce": _score_cpi_slow,
    "xauusd": _score_gold_rising,
    "nas100": _score_nas100_rally,
    "bank_reserves_drain": _score_reserves_drain,
    "us10y_yield": _score_us10y_shock,
    "real_yield_10y_cpi": _score_real_yield_high,
    "us30y_yield": _score_us30y_surge,
    "usdjpy": _score_jpy_weak,
    "usdjpy_weak": _score_jpy_weak,
    "10y_auction_bid_to_cover": _score_auction_demand_weak,
    "hy_spread": _score_hy_blowout,
    "vix": _score_vix_panic,
    "ig_spread": _score_ig_widening,
    "bank_deposits_wow": _score_deposits_shrinking,
    "fed_discount_window": _score_discount_window_spike,
    "bank_basket_momentum": _score_bank_basket_breakdown,
    "us2y_collapse": _score_us2y_collapse,
    "bank_reserves_wresbal": _score_reserves_scarcity,
    "on_rrp_buffer_funding": _score_rrp_drained,
    "sofr_effr_funding": _score_sofr_effr_stress,
    "move_stress": _score_move_stress,
    "nas100_breakdown": _score_nas100_breakdown,
}

# Fallback: indicator name -> scorer by substring (the reference metadata uses
# names like "Credit Spread Narrowing (HY)" which we map to our scorer ids).
_INDICATOR_NAME_MAP: dict[str, str] = {
    "Credit Spread Narrowing (HY)": "credit_spread_narrowing_hy",
    "VIX Falling": "vix_falling",
    "DXY": "dxy",
    "US10Y": "us10y",
    "Yield Curve (2Y-10Y)": "yield_curve_2y_10y",
    "MOVE Index": "move_index",
    "USOIL Price": "usoil_price",
    "Core PCE": "core_pce",
    "CPI YoY": "cpi_yoy",
    "COT Gold Positioning (risk)": "cot_gold_positioning_risk",
    "US10Y/US2Y Yield": "us10y_us2y_yield",
    "CPI/PCE": "cpi_pce",
    "XAUUSD": "xauusd",
    "NAS100": "nas100",
    "Bank Reserves Drain": "bank_reserves_drain",
    "US10Y Yield": "us10y_yield",
    "Real Yield (10Y-CPI)": "real_yield_10y_cpi",
    "US30Y Yield": "us30y_yield",
    "USDJPY": "usdjpy",
    "10Y Auction Bid-to-Cover": "10y_auction_bid_to_cover",
    "HY Spread": "hy_spread",
    "VIX": "vix",
    "IG Spread": "ig_spread",
    "Bank Deposits WoW": "bank_deposits_wow",
    "Fed Discount Window": "fed_discount_window",
    "Bank Basket Momentum": "bank_basket_momentum",
    "US2Y Collapse": "us2y_collapse",
    "Bank Reserves (WRESBAL)": "bank_reserves_wresbal",
    "ON RRP Buffer × Funding": "on_rrp_buffer_funding",
}

# Same indicator name means opposite things in stress vs risk-on models:
# yield-shock needs a STRONG dollar + breaking NAS100 + spiking 10Y, while
# recovery/fed-pivot want the reverse. Per-model scorer overrides.
_INDICATOR_OVERRIDES: dict[str, dict[str, str]] = {
    "yield-shock": {
        "DXY": "dxy_strong",
        "NAS100": "nas100_breakdown",
        "US10Y": "us10y_shock",
        "MOVE Index": "move_stress",
    },
    "credit-panic": {
        "DXY": "dxy_strong",
        "US10Y": "us10y_shock",
        "MOVE Index": "move_stress",
    },
    "bank-run": {
        "US2Y": "us2y_collapse",
    },
}
INDICATOR_SCORERS["dxy_strong"] = _score_dxy_strong
INDICATOR_SCORERS["us10y_shock"] = _score_us10y_shock
INDICATOR_SCORERS["us2y_collapse"] = _score_us2y_collapse

# ---------------------------------------------------------------------------
# Model metadata — captured verbatim from the reference site's bundle.
# Each model: Thai/English names, concept, trade direction, regime, phase,
# indicator weights (name + weight + logic) and the signal map.
# ---------------------------------------------------------------------------
MODELS: list[dict] = [
    {
        "model_id": "recovery-reflation",
        "name_th": "โมเดลฟื้นตัว / รีเฟลชัน",
        "name_en": "Recovery / Reflation Model",
        "short_th": "ฟื้นตัว",
        "short_en": "Recovery",
        "concept_th": "จับช่วง Soft Landing → Risk-On → Rotation เข้า Cyclicals เมื่อตลาดเริ่มฟื้นตัวหลังวิกฤต",
        "concept_en": "Soft landing → risk-on → rotation into cyclicals as markets recover post-crisis",
        "trade_direction": "Long NAS100/US500, Long Oil, Short Gold, Short JPY",
        "regime_th": "หลังวิกฤตผ่อนคลาย — ตลาดเริ่มฟื้นตัว, Risk appetite กลับมา",
        "regime_en": "Post-crisis easing — recovery, risk appetite returning",
        "phase": "recovery",
        "indicators": [
            {"name": "Credit Spread Narrowing (HY)", "weight": 20, "logic": "HY Spread แคบลง → ตลาดฟื้นตัว"},
            {"name": "VIX Falling", "weight": 15, "logic": "VIX ลดลง < 18 → risk-on"},
            {"name": "DXY", "weight": 15, "logic": "USD อ่อนค่า → เงินไหลเข้า risk assets"},
            {"name": "US10Y", "weight": 15, "logic": "Yield ทรงตัว/ลดลง → ดีต่อ growth stocks"},
            {"name": "Yield Curve (2Y-10Y)", "weight": 15, "logic": "Curve เริ่ม un-invert → สัญญาณ recovery"},
            {"name": "MOVE Index", "weight": 6, "logic": "ความผันผวนตลาดบอนด์สงบ (<100) → หนุน risk-on"},
        ],
        "signal_map": [
            {"asset": "NAS100", "category": "macro", "direction": "long", "reason": "Growth stocks rally ในช่วง recovery"},
            {"asset": "XAUUSD", "category": "macro", "direction": "long", "reason": "ทองยังขึ้นได้จาก reflation"},
            {"asset": "USOIL", "category": "macro", "direction": "long", "reason": "น้ำมันขึ้นตาม demand recovery"},
            {"asset": "BTC", "category": "crypto", "direction": "long", "reason": "Risk-on หนุน crypto"},
            {"asset": "ETH", "category": "crypto", "direction": "long", "reason": "Risk-on หนุน crypto"},
            {"asset": "SOL", "category": "crypto", "direction": "long", "reason": "High-beta crypto ขึ้นแรง"},
            {"asset": "EURUSD", "category": "forex", "direction": "long", "reason": "USD อ่อนใน recovery"},
            {"asset": "GBPUSD", "category": "forex", "direction": "long", "reason": "USD อ่อนใน recovery"},
            {"asset": "US500", "category": "stocks", "direction": "long", "reason": "Broad market rally"},
            {"asset": "US30", "category": "stocks", "direction": "long", "reason": "Cyclicals/value rally"},
        ],
    },
    {
        "model_id": "inflation-oil",
        "name_th": "โมเดลน้ำมันพุ่ง-เงินเฟ้อ",
        "name_en": "Inflation-Oil Spike Model",
        "short_th": "เงินเฟ้อ-น้ำมัน",
        "short_en": "Inflation-Oil",
        "concept_th": "จับช่วงน้ำมันพุ่ง → เงินเฟ้อกลับมา → Fed ต้องเข้มขึ้น → กดดัน Growth stocks",
        "concept_en": "Oil spike → inflation returns → Fed forced hawkish → pressure on growth stocks",
        "trade_direction": "Long Oil/Gold, Short NAS100, Long USDCAD",
        "regime_th": "ช่วงที่น้ำมันพุ่งแรง + เงินเฟ้อเร่งตัว",
        "regime_en": "Oil spiking + inflation accelerating",
        "phase": "inflation-pressure",
        "indicators": [
            {"name": "USOIL Price", "weight": 25, "logic": "Oil > $85 และขึ้นต่อ → inflation pressure"},
            {"name": "Core PCE", "weight": 20, "logic": "PCE สูงกว่า target 2% → Fed hawkish"},
            {"name": "CPI YoY", "weight": 20, "logic": "CPI เพิ่ม → ยืนยัน inflation"},
            {"name": "DXY", "weight": 10, "logic": "USD แข็ง → กดดัน EM + commodity importers"},
            {"name": "US10Y", "weight": 10, "logic": "Yield ขึ้น → ตลาด price-in inflation"},
            {"name": "COT Gold Positioning (risk)", "weight": 5, "logic": "Managed money ทองคำ crowded (>200k สัญญา) → เสี่ยง squeeze ขาทอง (หักคะแนน)"},
        ],
        "signal_map": [
            {"asset": "USOIL", "category": "macro", "direction": "long", "reason": "น้ำมันพุ่งจาก supply shock/demand"},
            {"asset": "XAUUSD", "category": "macro", "direction": "long", "reason": "ทอง = inflation hedge"},
            {"asset": "NAS100", "category": "macro", "direction": "short", "reason": "Growth stocks ถูกกดจาก rate expectations"},
            {"asset": "BTC", "category": "crypto", "direction": "long", "reason": "BTC เป็น inflation hedge"},
            {"asset": "AUDUSD", "category": "forex", "direction": "long", "reason": "Commodity currency แข็งตาม oil"},
            {"asset": "USDCAD", "category": "forex", "direction": "short", "reason": "CAD แข็ง (แคนาดาส่งออกน้ำมัน)"},
            {"asset": "US500", "category": "stocks", "direction": "short", "reason": "Broad market ถูกกดจาก inflation"},
        ],
    },
    {
        "model_id": "fed-pivot",
        "name_th": "โมเดล Fed เปลี่ยนท่าที / Duration Rally",
        "name_en": "Fed Pivot / Duration Rally Model",
        "short_th": "Fed เปลี่ยนท่าที",
        "short_en": "Fed Pivot",
        "concept_th": "จับจังหวะ Fed ส่งสัญญาณ Dovish → Yield ลง → Duration Rally → Growth stocks พุ่ง",
        "concept_en": "Fed turns dovish → yields fall → duration rally → growth stocks surge",
        "trade_direction": "Long NAS100/US500, Long Gold, Short USDJPY",
        "regime_th": "ช่วงที่ Fed เปลี่ยนท่าทีจาก hawkish → dovish",
        "regime_en": "Fed shifting hawkish → dovish",
        "phase": "policy-pivot",
        "indicators": [
            {"name": "US10Y/US2Y Yield", "weight": 20, "logic": "Yield ลดลง → ตลาดคาด Fed ลด"},
            {"name": "DXY", "weight": 15, "logic": "USD อ่อน → dovish signal"},
            {"name": "CPI/PCE", "weight": 15, "logic": "เงินเฟ้อชะลอ → เปิดทางให้ Fed ลด"},
            {"name": "XAUUSD", "weight": 15, "logic": "ทองขึ้น → ตลาดคาด real yield ลง"},
            {"name": "NAS100", "weight": 10, "logic": "Tech rally → ยืนยัน duration play"},
            {"name": "Bank Reserves Drain", "weight": 6, "logic": "เงินสำรองธนาคารระบายเร็ว (>$150B/60วัน) → บีบ Fed หยุด QT/กลับทิศ"},
        ],
        "signal_map": [
            {"asset": "NAS100", "category": "macro", "direction": "long", "reason": "Growth stocks rally จาก yield ลง"},
            {"asset": "XAUUSD", "category": "macro", "direction": "long", "reason": "Gold ขึ้นจาก real yield ลง"},
            {"asset": "USDJPY", "category": "forex", "direction": "short", "reason": "Yen แข็งค่าเมื่อ US yield ลง"},
            {"asset": "BTC", "category": "crypto", "direction": "long", "reason": "Dovish = risk-on หนุน crypto"},
            {"asset": "ETH", "category": "crypto", "direction": "long", "reason": "Dovish = risk-on"},
            {"asset": "SOL", "category": "crypto", "direction": "long", "reason": "High-beta crypto"},
            {"asset": "EURUSD", "category": "forex", "direction": "long", "reason": "USD อ่อนจาก dovish Fed"},
            {"asset": "GBPUSD", "category": "forex", "direction": "long", "reason": "USD อ่อน"},
            {"asset": "US500", "category": "stocks", "direction": "long", "reason": "Broad rally จาก lower rates"},
            {"asset": "US30", "category": "stocks", "direction": "long", "reason": "Value/cyclicals rally"},
        ],
    },
    {
        "model_id": "yield-shock",
        "name_th": "โมเดล Yield ช็อก",
        "name_en": "Yield Shock Short-Risk Model",
        "short_th": "Yield ช็อก",
        "short_en": "Yield Shock",
        "concept_th": "จับช่วง Yield พุ่งแรง → ตลาด Reprice หุ้น Growth และ Risk Asset ทั้งหมด",
        "concept_en": "Yields spike violently → markets reprice growth stocks and all risk assets",
        "trade_direction": "Short NAS100/US500, Long USDJPY, Short Gold",
        "regime_th": "ช่วงที่ Yield พุ่งเร็วผิดปกติ (bond sell-off)",
        "regime_en": "Abnormally fast yield surge (bond sell-off)",
        "phase": "yield-shock",
        "indicators": [
            {"name": "US10Y Yield", "weight": 25, "logic": "10Y > 4.5% และขึ้นต่อ → shock zone"},
            {"name": "DXY", "weight": 20, "logic": "USD แข็งเร็ว → กดดัน risk assets"},
            {"name": "Real Yield (10Y-CPI)", "weight": 15, "logic": "Real Yield สูง → ทองถูกกด, หุ้นถูกกด"},
            {"name": "US30Y Yield", "weight": 15, "logic": "30Y พุ่ง → term premium / fiscal risk"},
            {"name": "NAS100", "weight": 15, "logic": "Tech ตก → ยืนยัน yield shock"},
            {"name": "USDJPY", "weight": 10, "logic": "JPY อ่อน → carry trade unwind"},
            {"name": "MOVE Index", "weight": 8, "logic": "ความผันผวนบอนด์สูง+พุ่ง (>90) → ยืนยัน rates-vol regime"},
            {"name": "10Y Auction Bid-to-Cover", "weight": 7, "logic": "อุปสงค์ประมูลอ่อน (<2.4x) → ผู้ซื้อหลักถอย → yield ขึ้นต่อ"},
        ],
        "signal_map": [
            {"asset": "NAS100", "category": "macro", "direction": "short", "reason": "Growth stocks ถูกกดจาก higher yields"},
            {"asset": "DXY", "category": "macro", "direction": "long", "reason": "USD แข็งจาก yield advantage"},
            {"asset": "USDJPY", "category": "forex", "direction": "long", "reason": "Carry trade หนุน USD"},
            {"asset": "BTC", "category": "crypto", "direction": "short", "reason": "Risk-off กด crypto"},
            {"asset": "ETH", "category": "crypto", "direction": "short", "reason": "Risk-off กด crypto"},
            {"asset": "EURUSD", "category": "forex", "direction": "short", "reason": "USD แข็งจาก rate differential"},
            {"asset": "GBPUSD", "category": "forex", "direction": "short", "reason": "USD แข็ง"},
            {"asset": "US500", "category": "stocks", "direction": "short", "reason": "Broad sell-off จาก higher discount rate"},
        ],
    },
    {
        "model_id": "credit-panic",
        "name_th": "โมเดลวิกฤตสินเชื่อ / ความเสี่ยงเชิงระบบ",
        "name_en": "Credit Panic / Systemic Stress Model",
        "short_th": "วิกฤตสินเชื่อ",
        "short_en": "Credit Panic",
        "concept_th": "จับช่วง Credit Spread บานออก → Systemic Risk → Flight to Safety ทั้งระบบ",
        "concept_en": "Credit spreads blow out → systemic risk → flight to safety across the system",
        "trade_direction": "Long Gold/JPY, Short HY Bonds, Long VIX, Short Banks",
        "regime_th": "ช่วงวิกฤตเต็มรูปแบบ — credit market แตก, ความกลัวสูงสุด",
        "regime_en": "Full crisis — credit market breaking, peak fear",
        "phase": "credit-stress",
        "indicators": [
            {"name": "HY Spread", "weight": 20, "logic": "HY > 400bps → credit stress"},
            {"name": "VIX", "weight": 20, "logic": "VIX > 25 และขึ้น → panic"},
            {"name": "IG Spread", "weight": 20, "logic": "IG กว้าง → systemic (ไม่ใช่แค่ junk)"},
            {"name": "US10Y", "weight": 10, "logic": "Yield พุ่งเร็ว → trigger credit stress"},
            {"name": "DXY", "weight": 10, "logic": "Dollar squeeze → กดดัน debtors"},
            {"name": "MOVE Index", "weight": 7, "logic": "ความผันผวนบอนด์ stress (>100) → เครดิตระเบิดมักมากับ rates vol"},
        ],
        "signal_map": [
            {"asset": "NAS100", "category": "macro", "direction": "short", "reason": "Risk assets ถูกเทขาย"},
            {"asset": "XAUUSD", "category": "macro", "direction": "long", "reason": "Flight to safety → ทองพุ่ง"},
            {"asset": "USDJPY", "category": "forex", "direction": "short", "reason": "Yen = safe haven"},
            {"asset": "BTC", "category": "crypto", "direction": "short", "reason": "Panic ขาย crypto หนัก"},
            {"asset": "ETH", "category": "crypto", "direction": "short", "reason": "Panic ขาย crypto"},
            {"asset": "SOL", "category": "crypto", "direction": "short", "reason": "High-beta ตกหนักสุด"},
            {"asset": "USDCHF", "category": "forex", "direction": "short", "reason": "Safe haven CHF"},
            {"asset": "US500", "category": "stocks", "direction": "short", "reason": "Broad sell-off"},
            {"asset": "US30", "category": "stocks", "direction": "short", "reason": "Broad sell-off"},
        ],
    },
    {
        "model_id": "bank-run",
        "name_th": "โมเดลแบงก์รัน / วิกฤตธนาคาร",
        "name_en": "Bank Run / Banking Stress Model",
        "short_th": "แบงก์รัน",
        "short_en": "Bank Run",
        "concept_th": "จับช่วงเงินฝากไหลออกจากธนาคาร → ธนาคารภูมิภาคถูกเทขาย → Flight to safety + คาด Fed ต้องอุ้ม",
        "concept_en": "Deposits flee banks → regional banks dumped → flight to safety + Fed rescue expected",
        "trade_direction": "Long Gold, Short Banks (KRE), Long JPY/CHF, Short BTC",
        "regime_th": "ช่วงเงินฝากไหลออก — ระบบธนาคารตึงเครียด",
        "regime_en": "Deposit flight — banking system stress",
        "phase": "banking-stress",
        "indicators": [
            {"name": "Bank Deposits WoW", "weight": 20, "logic": "เงินฝากหด WoW → deposit flight"},
            {"name": "Fed Discount Window", "weight": 20, "logic": "แบงก์กู้ฉุกเฉินพุ่ง → ขาดสภาพคล่อง"},
            {"name": "Bank Basket Momentum", "weight": 20, "logic": "ตะกร้าหุ้นแบงก์ดิ่ง (KRE/BKX/KBE + regional รายตัว) → ตลาดได้กลิ่นวิกฤต"},
            {"name": "US2Y Collapse", "weight": 15, "logic": "2Y ดิ่งเร็ว → flight to safety + คาด Fed ลดดอกเบี้ยอุ้ม"},
            {"name": "HY Spread", "weight": 15, "logic": "Spread บาน → เครดิตตึง"},
            {"name": "VIX", "weight": 10, "logic": "ความกลัวเร่งตัว"},
            {"name": "Bank Reserves (WRESBAL)", "weight": 8, "logic": "เงินสำรองเข้าเขตขาดแคลน (<$3,000B) → ระบบเปราะต่อ funding shock"},
            {"name": "ON RRP Buffer × Funding", "weight": 5, "logic": "RRP buffer แห้ง (<$300B) + SOFR-EFFR ตึง → ไม่มีเบาะรองรับ repo stress"},
        ],
        "signal_map": [
            {"asset": "XAUUSD", "category": "macro", "direction": "long", "reason": "Flight to safety → ทองพุ่ง"},
            {"asset": "NAS100", "category": "macro", "direction": "short", "reason": "Risk-off กดหุ้น"},
            {"asset": "BTC", "category": "crypto", "direction": "short", "reason": "Panic ช่วงแรกกด crypto"},
            {"asset": "USDJPY", "category": "forex", "direction": "short", "reason": "Safe haven JPY"},
            {"asset": "USDCHF", "category": "forex", "direction": "short", "reason": "Safe haven CHF"},
            {"asset": "US500", "category": "stocks", "direction": "short", "reason": "Broad sell-off นำโดยหุ้นแบงก์"},
        ],
    },
]

MODEL_IDS = [m["model_id"] for m in MODELS]

# ---------------------------------------------------------------------------
# Context assembly — pull the values the scorers need from the macro
# dashboard's cards (one shared fetch, same data the /macro tab shows).
# ---------------------------------------------------------------------------
def _yf_extras() -> dict | None:
    """Extra model inputs not in the macro dashboard (JPY, NAS100, KRE) from
    yfinance. Returns {key: value} or None. Separated from context assembly
    so tests can stub it."""
    import yfinance as yf

    out: dict = {}
    try:
        for key, ticker in (("usdjpy", "JPY=X"), ("nas100_chg_pct", "^NDX"), ("kre_chg_pct", "KRE")):
            hist = yf.Ticker(ticker).history(period="5d")
            if hist.empty:
                continue
            closes = [float(r["Close"]) for _, r in hist.iterrows()]
            if len(closes) >= 2 and closes[-2]:
                if key == "usdjpy":
                    out[key] = closes[-1]
                else:
                    out[key] = (closes[-1] / closes[-2] - 1.0) * 100.0
    except Exception:
        pass  # inputs stay missing -> those indicators are honestly dropped
    return out or None


def _build_context_from(dash: dict) -> dict:
    """Pull the values the scorers need from an already-built macro dashboard."""
    cards: dict[str, dict] = {}
    for section in dash["sections"]:
        for item in section["items"]:
            cards[item["series_id"]] = item

    def val(series_id: str) -> float | None:
        card = cards.get(series_id)
        return card["value"] if card and card.get("available") else None

    def chg(series_id: str) -> float | None:
        card = cards.get(series_id)
        return card.get("change_pct") if card and card.get("available") else None

    curve = dash.get("yield_curve", {})
    extras = _yf_extras() or {}
    ctx: dict = {
        "hy_spread_bps": val("us_hy_spread"),
        "ig_spread_bps": val("us_ig_spread"),
        "vix": val("vix"),
        "dxy": val("dxy"),
        "us10y": val("us10y"),
        "us30y": val("us30y"),
        "us2y": val("us2y"),
        "us2y_chg": (cards.get("us2y") or {}).get("change_val"),
        "curve_10y2y_bps": curve.get("spread_10y2y_bps"),
        "move": val("move"),
        "usoil": val("usoil"),
        "xauusd": val("xauusd"),
        "gold_chg_pct": chg("xauusd"),
        "us_pce_yoy": val("us_pce_yoy"),
        "us_cpi_yoy": val("us_cpi_yoy"),
        "us_10y_real": val("us_10y_real"),
        "cot_gold_mm_net": val("cot_gold_mm_net"),
        "auction_btc": val("us_auction_btc"),
        "deposits_chg_pct": chg("us_bank_deposits"),
        "discount_window_b": val("us_discount_window"),
        "bank_reserves_b": val("us_bank_reserves"),
        "reserves_chg_pct": chg("us_bank_reserves"),
        "on_rrp_b": val("us_on_rrp"),
        "sofr_effr_spread_bps": val("us_sofr_effr_spread"),
        "usdjpy": extras.get("usdjpy"),
        "nas100_chg_pct": extras.get("nas100_chg_pct"),
        "kre_chg_pct": extras.get("kre_chg_pct"),
    }
    return ctx


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def _score_model(model: dict, ctx: dict) -> dict:
    """Score one model: indicator conditions, factor sub-scores and total."""
    conditions: list[dict] = []
    weighted_macro_sum = 0.0
    weight_total = 0.0
    available_any = False
    for ind in model["indicators"]:
        base_id = _INDICATOR_NAME_MAP.get(ind["name"])
        scorer_id = (_INDICATOR_OVERRIDES.get(model["model_id"], {}).get(ind["name"]) or base_id)
        scorer = INDICATOR_SCORERS.get(scorer_id or "") if scorer_id else None
        score = scorer(ctx) if scorer else None
        conditions.append({
            "name": ind["name"],
            "logic": ind["logic"],
            "weight": ind["weight"],
            "score": round(score, 1) if score is not None else None,
        })
        if score is not None:
            available_any = True
            weighted_macro_sum += score * ind["weight"]
            weight_total += ind["weight"]

    # macro factor = weighted mean of the model's indicators, capped at 30.
    macro = (weighted_macro_sum / weight_total) if weight_total else 0.0
    macro_scaled = macro * (FACTOR_CAPS["macro"] / 100.0)

    # market_structure: how well the current market *structure* fits this
    # model's regime (0-25). Stress models score high when bond vol is high,
    # the curve is inverted and gold is bid; risk-on models when the curve is
    # normal and vol is calm. The reference site's own struct scores vary by
    # model for exactly this reason (fed-pivot 16.3 vs credit-panic 5.6).
    stress_phase = model["phase"] in ("yield-shock", "credit-stress", "banking-stress")
    structure_parts: list[float] = []
    curve = ctx.get("curve_10y2y_bps")
    if curve is not None:
        if stress_phase:
            structure_parts.append(_score_linear(curve, -100.0, 100.0, invert=True))
        else:
            structure_parts.append(_score_linear(curve, -50.0, 50.0))
    if ctx.get("move") is not None:
        structure_parts.append(_score_move_stress(ctx) if stress_phase else _score_move_calm(ctx))
    if ctx.get("gold_chg_pct") is not None:
        structure_parts.append(_score_linear(ctx["gold_chg_pct"], -1.5, 1.5, invert=stress_phase))
    market_structure = (sum(structure_parts) / len(structure_parts) * FACTOR_CAPS["market_structure"] / 100.0
                        if structure_parts else 0.0)

    # news: no news feed in this app yet — honest 0 (not fabricated).
    news = 0.0

    # confirmation: does the market already behave like the model's regime?
    # Blend VIX (calm for risk-on, panic for stress) with the curve shape and
    # bond vol (MOVE stress confirms the rates-vol regime), 20-point cap.
    confirm_parts: list[float] = []
    if ctx.get("vix") is not None:
        confirm_parts.append(_score_vix_panic(ctx) if stress_phase else _score_vix_calm(ctx))
    if curve is not None:
        confirm_parts.append(_score_curve_uninverting(ctx) if not stress_phase else _score_linear(curve, -100.0, 100.0, invert=True))
    if ctx.get("move") is not None:
        confirm_parts.append(_score_move_stress(ctx) if stress_phase else _score_move_calm(ctx))
    confirmation = (sum(confirm_parts) / len(confirm_parts) * FACTOR_CAPS["confirmation"] / 100.0
                    if confirm_parts else 0.0)

    # risk_penalty: deductions for genuine fragilities, NOT for the model's
    # own confirming inputs (MOVE stress already scores *for* the stress
    # models as an indicator — double-counting it as a penalty would suppress
    # the exact signal the model exists to catch). Deduct for crowded gold
    # positioning and scarce bank reserves; 0-15 points.
    penalty_parts: list[float] = []
    if ctx.get("cot_gold_mm_net") is not None and ctx["cot_gold_mm_net"] > 200000:
        penalty_parts.append(60.0)
    if ctx.get("bank_reserves_b") is not None and ctx["bank_reserves_b"] < 3000.0:
        penalty_parts.append(40.0)
    risk_penalty = -1.0 * (sum(penalty_parts) / len(penalty_parts) * FACTOR_CAPS["risk_penalty"] / 100.0
                           if penalty_parts else 0.0)

    total = round(macro_scaled + market_structure + news + confirmation + risk_penalty, 1)

    status = "active" if total >= ACTIVE_THRESHOLD else "building" if total >= BUILDING_THRESHOLD else "inactive"
    # confidence: share of the model's indicators that have live data.
    confidence = round(100 * sum(1 for c in conditions if c["score"] is not None) / len(conditions)) if conditions else 0

    return {
        "model_id": model["model_id"],
        "rank": 0,  # filled after all models are scored
        "score": total,
        "confidence": confidence,
        "status": status,
        "factors": {
            "market_structure": round(market_structure, 1),
            "macro": round(macro_scaled, 1),
            "news": round(news, 1),
            "confirmation": round(confirmation, 1),
            "risk_penalty": round(risk_penalty, 1),
        },
        "conditions": conditions,
        "available": available_any,
    }


def build_models() -> dict:
    """Score all six models and rank them. Returns the /models payload."""
    dash = macro_service.build_dashboard()
    ctx = _build_context_from(dash)
    results = [_score_model(model, ctx) for model in MODELS]
    results.sort(key=lambda r: r["score"], reverse=True)
    for i, r in enumerate(results, start=1):
        r["rank"] = i

    return {
        "models": results,
        "meta": [
            {
                "model_id": m["model_id"],
                "name_th": m["name_th"],
                "name_en": m["name_en"],
                "short_th": m["short_th"],
                "short_en": m["short_en"],
                "concept_th": m["concept_th"],
                "concept_en": m["concept_en"],
                "trade_direction": m["trade_direction"],
                "regime_th": m["regime_th"],
                "regime_en": m["regime_en"],
                "phase": m["phase"],
                "color": MODEL_COLORS[m["model_id"]],
                "signal_map": m["signal_map"],
            }
            for m in MODELS
        ],
        "factor_caps": FACTOR_CAPS,
        "factor_labels_th": FACTOR_LABELS_TH,
        "status_meta": STATUS_META,
        "thresholds": {"building": BUILDING_THRESHOLD, "active": ACTIVE_THRESHOLD},
        "updated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC"),
        "data_sources": dash.get("data_sources", []),
        "_macro_sources": dash.get("data_sources", []),
    }
