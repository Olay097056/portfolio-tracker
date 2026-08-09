# Country Yield Sources — all 27 countries (2026-08-09)

Result of wayfinder ticket **Country yield source coverage — all 27 countries**.
The user requires all 27 reference countries to show a 10Y yield; this ticket
found which free sources actually work from this host and picked the final
source map.

## Source survey (probed live from this host + containers)

| Source | Result | Verdict |
|---|---|---|
| FRED `IRLTLT01<CC>M156N` | **13 countries OK** (US JP GB CA AU CH KR MX ZA PL FR NO; RU exists but stale at 2018-06) | ✅ base set |
| ThaiBMA `/yieldcurve/getbyyear` | TH 10Y via bond-code mapping (LB code → tenor) | ✅ but TH only + code mapping work |
| **worldgovernmentbonds.com** (Playwright) | **All 27 countries**, 10Y in a table row ("10 years → 2.050% → +8.3 bp"), server-rendered data exposed after JS renders; Chromium already installed (ms-playwright chromium-1208) | ✅ **chosen second source** |
| World Bank `api.worldbank.org/v2/country/{cc}/indicator/...` | **502 Bad Gateway on every indicator** from host AND container (only `/country/TH` meta works) — their indicator endpoint is down, not our network | ❌ |
| IMF IFS SDMX | dataflow 404/204 (endpoint shape unusable without deep SDK work) | ❌ |
| BIS `api.bis.org` | ConnectTimeout from this host | ❌ |
| EODHD free demo | HTML login page (demo token insufficient) | ❌ needs real key |
| Investing.com API | 403 (bot-blocked) | ❌ |
| yfinance `<CC>10Y` patterns | no data for any non-US ticker | ❌ |
| OECD SDMX | 404 (wrong dataflow shape) | ❌ |

## Final source map (27 countries)

1. **FRED `IRLTLT01<CC>M156N`** — 13 countries: US, JP, GB, CA, AU, CH, KR, MX, ZA, PL, FR, NO (+ RU **stale 2018** — flag it, don't present as current). Monthly frequency.
2. **worldgovernmentbonds.com via Playwright** — the remaining 14: TH, VN, LA, SG, HK, CN, SA, AE, IN, ID, BR, TR, PH, MY (+ can serve any country FRED lacks). Daily-ish update ("Last Update: 9 Aug 2026").
3. TH is covered by worldgovernmentbonds (2.050% on 2026-08-09) — ThaiBMA is a documented fallback, not the primary.

## Playwright recipe (verified working)

- Chromium already installed: `C:\Users\bit-it.helpdesk\AppData\Local\ms-playwright\chromium-1208\chrome-win64\chrome.exe`
- Backend venv: `pip install playwright` (browser binary NOT re-downloaded — launch with explicit `executable_path`).
- Per country: goto `https://www.worldgovernmentbonds.com/country/{slug}/`, wait ~3s for JS, read the yield table row matching `/10 years/` → first cell is the 10Y yield, second cell the 1M change bp.
- Country slugs: thailand, vietnam, laos, singapore, hong-kong, china, saudi-arabia, uae, russia, india, indonesia, brazil, turkey, philippines, malaysia (+ the 13 FRED ones if ever needed).
- Latency: one page ≈ 3-6s; a 14-country sweep ≈ 60-90s — acceptable for a 5-minute cache, but the backend ticket should run it in the parallel wave and/or only for countries FRED lacks.

## Findings that shape the backend ticket

- FRED yields are **monthly**, worldgovernmentbonds are **daily** — the payload should carry each country's `data_tier`/freshness from the reference `countries` table and the UI already shows a data-tier note.
- "bps vs US" = (country 10Y − US 10Y) × 100 — US 10Y from FRED (IRLTLT01USM156N, 4.47% June 2026) or the dashboard's existing us10y.
- Never fabricate: a country whose page fails (network/bot-block) renders "—" that sweep, retried next cache expiry.
- Playwright adds ~60MB (chromium already present) + a few seconds on cold build; keep it lazy (only when a FRED-less country is requested) and cached 10 min like everything else.
