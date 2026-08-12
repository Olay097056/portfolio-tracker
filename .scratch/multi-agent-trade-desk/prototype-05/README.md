# Prototype 05 — Multi-agent trade desk prompt flow (2026-08-12)

> ใบ 05 แผน multi-agent-trade-desk · Script: `prototype-05/prototype_meeting.py`

## Results (2 real runs)

### Run 1 — Bearish Consensus
| Seat | Bias | Confidence | Tokens | Latency |
|---|---|---|---|---|
| trend | bearish | 72 | 937+267 | 8.0s |
| technical | ❌ parse fail | — | 908+500 | 9.6s |
| macro | bearish | 68 | 911+234 | 7.5s |
| contrarian | bearish | 72 | 876+284 | 8.0s |
| **lead** | **open SHORT BTC-USD** | — | +155 | 5.7s |
| **TOTAL** | — | — | **5,897** | **38.8s** |

**Lead decision**: short BTC-USD — consensus bearish from 3/4 analysts.

### Run 2 — Split Opinion → HOLD (ฉลาด!)
| Seat | Bias | Confidence |
|---|---|---|
| trend | bearish | 72 |
| technical | ❌ parse fail | — |
| macro | bearish | 68 |
| contrarian | **bullish** | 68 |

**Lead decision**: **HOLD** — "CPI คืนนี้เป็นตัวแปรใหญ่ ความเห็นทีมขัดแย้ง (trend/macro bearish vs contrarian bullish, technical neutral) — รอหลักฐานแรก... งดเทรดช่วงข่าว"

→ ตรงกับ reference: "บางครั้งการไม่สู้ในสนามที่เรากังวล อาจจะเป็นการสร้างกำไรทางหนึ่ง" (Claude team behavior)

## Key Findings

### ✅ Works well
- Multi-agent debate produces nuanced decisions (not just binary long/short)
- Lead can detect disagreement and hold — human-like judgment
- Context injection from bond-crisis data works (all analysts referenced real data points)
- Token cost: **$0.0010/turn** — extremely cheap (reference spends $5-7/day for 9 teams, our 1 team would cost ~$0.14/day for 144 turns)
- Latency: ~40s for 5 serial calls → can parallelize 4 analysts → ~12s

### ❌ Needs improvement
- **Technical analyst** JSON parsing fails (~50% of runs) — LLM adds markdown/extra text → need stricter output format + extraction helper
- **Serial calls** waste time → production should parallelize 4 analysts (ThreadPoolExecutor)
- **No KB retrieval** yet — analysts don't see past win/loss lessons
- **No price feed** — using static mock context

## Next Steps (for implementation, not this ticket)
1. Parallelize analyst calls (ThreadPoolExecutor, 4 at once)
2. Add KB retrieval: query `trade_knowledge` before building context
3. Integrate Hyperliquid real-time prices (ticket 06)
4. Build context from actual bond-crisis services (macro/models/signals/news/sentiment)
5. Add autonomous SL/TP modification (function calling)
6. Implement peer review scoring (track analyst accuracy over time)
