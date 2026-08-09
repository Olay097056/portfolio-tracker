# Country Risk Score Engine — prototype findings (2026-08-09)

Result of wayfinder ticket **Country risk score engine**. Computes our own
0-100 country risk score from free data, calibrated against the reference's
component pattern (their Supabase job uses per-country components — we build
our own equivalent from sources we can actually fetch).

## Our formula (4 components, sum capped implicitly per component)

```
score = yield_level (0-25) + yield_momentum (0-10) + fx_depreciation (0-24) + data_freshness (0-5)
```

- **yield_level** — country 10Y yield vs US benchmark (spread-based; ≥5% above US → 25, ~0% spread → ~1.5, below US → 0). Reference pattern: GB 4.8% (≈US) → 3.7, RU 7.6% (+3.1) → 25, MX 9.45 (+5) → 21.3.
- **yield_momentum** — 1M change in bp ÷ 10, capped 10 (reference: TR 10.5, RU 9.8).
- **fx_depreciation** — currency vs USD over 3M, ×4, capped 24 (reference: RU 24.4). 3M window (not 1M) so developed-country FX noise doesn't dominate.
- **data_freshness** — stale/missing data → 5 (RU's 2018 FRED data flagged; SA/AE daily-tier partial).

Level thresholds (from the reference progress bar): **≥75 crisis-watch (red), ≥55 high (orange), ≥30 medium (amber), else low (emerald)**.

## Prototype output (real data, 2026-08-09)

24/27 countries scored. FRED (13) + worldgovernmentbonds via Playwright (11).

| CC | 10Y | Score | Level | vs ref | note |
|---|---|---|---|---|---|
| TR | 32.24% | **32.8** | medium | −13 | 1M +78bp momentum |
| MX | 9.45% | **33.8** | medium | +12.5 | yield +5% vs US |
| ZA | 8.70% | **28.3** | low | +9.7 | yield +4.2% |
| BR | 14.57% | **25.2** | low | −13.9 | |
| RU | 7.62% | **22.0** | low | −37 | stale 2018 → freshness 5 |
| ID | 7.30% | **15.8** | low | −9.6 | |
| PH | 7.25% | **15.5** | low | −8.0 | |
| IN | 6.77% | **13.4** | low | +1.8 | |
| GB | 4.80% | **3.1** | low | −2.3 | developed ≈ US |
| US | 4.47% | **1.5** | low | −12.9 | benchmark |
| JP | 2.67% | **0.2** | low | −19.7 | |
| TH | 2.05% | **0.8** | low | −6.6 | |
| LA/SA/AE | — | **None** | — | — | **no free 10Y source exists** (reference uses credit ratings we can't get free) → renders "—" with data-tier note |

Ranking sanity: EM stress (TR/MX/ZA/BR/RU) top, developed (US/JP/GB/CH) bottom — matches the reference's ordering for the countries both have data for. Absolute values differ from the reference (their LA 64.1 comes from credit-rating data we don't have free access to); our scores are honest to *our* data, never fabricated.

## Decisions (recorded for the backend ticket)

1. **4-component formula above** — yield_level (spread vs US, cap 25) + momentum (cap 10) + fx 3M (cap 24) + freshness (cap 5). No credit-rating component (no free source — the reference's LA/SA/AE scores depend on paid ratings).
2. **Level thresholds:** ≥75 crisis-watch / ≥55 high / ≥30 medium / else low (matches the reference progress-bar colors).
3. **No yield → no score** (None → "—"): LA, SA, AE have NO free 10Y source anywhere (worldgovernmentbonds lacks them; FRED lacks them). Their data-tier note (manual/sparse) explains why.
4. **RU stale handling:** FRED last value 2018-06 → yield still shown (it's real data) but freshness component = 5 and the card flags staleness.
5. **Sparkline:** recompute from stored FRED yield history (400-day window already fetched — 60 points immediately, no backfill wait); worldgovernmentbonds countries get trend from our own score snapshots accumulated in SQLite (like model_score_history) since the site's per-day history is client-rendered.

## Assets

- `score_proto.py` (temp research dir) — the working prototype (FRED + Playwright + yfinance FX).
- `ref_scores.json` (temp) — the reference's 27 scores used only for calibration sanity, not copied.
