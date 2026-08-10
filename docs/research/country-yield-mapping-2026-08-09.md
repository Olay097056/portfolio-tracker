# FRED 10Y yield mapping for the Countries tab (รายประเทศ)

**Date:** 2026-08-09 · **Ticket:** FRED 10Y yield mapping (wayfinder:research)
**Method:** probed `fredgraph.csv` (httpx, default UA — the TLS-fingerprint fix
from the Banking tab work applies) for every country on the reference
`/countries` page, series `IRLTLT01{CC}M156N` (10Y government bond, monthly)
then `INTGST{CC}M193N` (IMF government bond yield) as fallback.

## Coverage (27 countries on the reference page)

### ✅ 10Y available, fresh (13)
| CC | Series | Last | CC | Series | Last |
|---|---|---|---|---|---|
| US | IRLTLT01 | 4.47 (2026-06) | MX | IRLTLT01 | 9.45 (2026-05) |
| JP | IRLTLT01 | 2.67 (2026-06) | ZA | IRLTLT01 | 8.70 (2026-06) |
| FR | IRLTLT01 | 3.68 (2026-06) | PL | IRLTLT01 | 5.51 (2026-06) |
| GB | IRLTLT01 | 4.80 (2026-06) | KR | IRLTLT01 | 4.18 (2026-06) |
| CA | IRLTLT01 | 3.42 (2026-06) | NO | IRLTLT01 | 4.20 (2026-06) |
| AU | IRLTLT01 | 4.83 (2026-06) | BR | **INTGST** | 13.86 (2026-06) |
| CH | IRLTLT01 | 0.31 (2026-06) | | | |

### ⚠️ 10Y exists but stale (3) — do NOT chart as live, render "—" + stale tier
| CC | Series | Last | Note |
|---|---|---|---|
| RU | IRLTLT01 | 7.62 (2018-06) | data 8 ปี — manual/sparse tier |
| SA | INTGST | 1.59 (2018-02) | stale |
| TR | INTGST | 17.72 (2008-04) | very stale |

### ❌ No free 10Y (11) — render "—", score absent
TH VN LA SG HK CN AE IN ID PH MY

(`INTDSR` policy rates exist for some (BR 21.1, TR 38.8, CN 2.9, IN 5.15) but
are policy rates, not 10Y — excluded per the "no fabrication" rule.)

## Source of truth

- `IRLTLT01{CC}M156N` — OECD long-term government bond yields via FRED
  (monthly, ~1-month publication lag; the reference site shows daily — our
  monthly lag is acceptable, freshness tier noted per country)
- `INTGST{CC}M193N` — IMF government bond yields (only BR fresh)

## Key facts for later tickets

1. **bps-vs-US** needs US 10Y (4.47, 2026-06) as the benchmark — same series
   file as everything else.
2. **data_tier** (from reference `countries` table) is a good proxy for
   freshness: realtime=US, daily=TH JP FR GB CA AU CH KR NO MX ZA PL,
   sparse=VN SG HK CN SA AE RU IN ID BR TR PH MY, manual=LA. Where tier is
   sparse/manual, even a fresh 10Y (BR) deserves a lower freshness sub-score.
3. **Score engine** (next ticket) must NOT fabricate: no 10Y → no yield
   components → overall score None → card renders "—" exactly like the
   reference does for missing data.
4. Sparkline (60-day trend) can be computed from IRLTLT01 history — monthly
   granularity → ~2 points/month, acceptable for a trend shape.
