# As-built — bond-crisis tab = reference 100% (2026-08-11)

> ใบ 10 ของแผน `.scratch/bond-crisis-100/` — แผนปิด ใบ 01-11 ครบ
> เป้าหมาย: bond-crisis tab ของ portfolio-tracker เหมือน reference
> (bond-crisis-dashboard-v2.vercel.app) ทั้ง UX/UI + ข้อมูลจริง + พฤติกรรม

## สรุปสุดท้าย

Prod LIVE: https://portfolio-tracker-taupe-two.vercel.app — **16 tabs ครบทุกหน้า reference**
(ภาพรวม/ข้อมูลมหภาค/โมเดล/สัญญาณ/อารมณ์ตลาด/โซน CME/แบงก์รัน/ประเทศ/จำลอง/
ห้องประชุม/สัญญาณที่ประชุม/ทีมเทรด/ข่าว/บทเรียน/ออฟฟิศ 3D/ตั้งค่า)

## Commits (เรียงตามเวลา)

| commit | ใบ | เนื้อหา |
|---|---|---|
| `090cbb4` | 04 | Fix signals 503: prepare_threshold=None (Supabase pooler) |
| `323c0a9` | 05 | Overview backend: /api/overview + AI brief (DeepSeek) |
| `5e7fd64` | 06 | Overview frontend: tab ภาพรวม (AI สรุป/REGIME/โมเดลอันดับ1/คะแนนประเทศ) |
| `1640332` | 07 | CME backend: FedWatch (ZQ) + gold flow + crypto IV (Deribit) + COT |
| `4596f42` | 08 | Frontend tabs อารมณ์ตลาด (CNN 63 + Crypto 29) + โซน CME + crypto_fear_greed |
| `59bb4bd` | 11 | Learn 7 บท (เนื้อหาใหม่) + Settings + Office 3D (Three.js) + /api/jobs/status |
| `ad8909d` | 10 | Fix: deposits หน่วย/Bid-to-Cover แยก tenor/factor_caps/bank_stocks 11 ตัว/trade-desk 1 ทีม |

## ตัวเลขวัดจริง (prod)

- **Tests**: pytest **542 passed** · vitest **564 passed** (73 files) · tsc สะอาด · `hermes verify` ok (test ~25s, readiness 200)
- **AI brief**: DeepSeek (opencode-go) 16.8s · 1,111 tokens · cache 24h · ปุ่ม "สร้างสรุปใหม่" force
- **FedWatch**: ZQ=F 96.24 → implied 3.76% vs EFFR 3.63 → **52% hike / 48% hold** (reference 56%)
- **Gold flow**: CME LastTotals/437 — OI 400,331 / opt 797,501 / vol 142,327 (ตรง reference เป๊ะ เมื่อ CME ไม่บล็อก) — **Vercel egress โดน CME 403** → CFTC fallback 371,551 (รายสัปดาห์, honest label)
- **Crypto IV**: Deribit BTC 58.11% · ETH 67.52% · SOL/XRP ไม่มี options → "—"
- **Bid-to-Cover**: 2Y 2.66 · 5Y 2.28 · 30Y 2.44 (ตรง reference) — 30Y ต้อง type=Bond
- **Deposits**: $19,362.7B (scale fix — ก่อนหน้าแสดง 19.4 ผิด)
- **Bank stocks**: 11/11 ราคาจริง (BKX 190.94 · KRE 76.46 · FITB 57.32...) — BankingOut schema fix (Pydantic drop เงียบ)
- **Office 3D**: three 0.185 · WebGL canvas 1180×440 · งานระบบจาก job_runs จริง 10 รอบ

## บทเรียน (บันทึกในสกิลแล้ว)

1. **Pydantic drop เงียบ**: field ที่ไม่มีใน response_model ถูกทิ้งเงียบ (crypto_fear_greed + bank_stocks) — ตรวจ schema เมื่อ API ใหม่
2. **Vercel egress โดนบล็อก**: CME 403 (scraping detect) · Yahoo rate-limit (bank 11 tickers) — fallback + cache เสมอ
3. **vol2vol paywall** → แสดง "—" ตรงไปตรงมา ไม่แต่งตัวเลข
4. **Frontend ฝัง URL ตอน build** — ห้ามเดา Vercel alias (บทเรียนใบ 08 ของแผน vercel-supabase)
5. **TA_WS**: 30-Year = Bond (ไม่ใช่ Note) — ต้อง query แยก
6. **cache ว่างห้าม cache_set** — {} ที่ cache ไว้จะตอบ {} ไป 10 นาที

## Out of scope (ตัดสินแล้ว)

- Telegram bot (settings = บัญชี + รูปแบบแจ้งเตือน localStorage)
- Learn content คัดลอก reference (เขียนใหม่เอง — ลิขสิทธิ์)
- หน้า admin/backtest/members (reference gated)
- IV/σ/P-C โลหะ/พลังงาน/บอนด์ (vol2vol paywall)
- Trade-desk 9 ทีม (มี LLM จริงตัวเดียว = deepseek — 1 ทีม 4 seats)

## ไฟล์อ้างอิง research

- docs/research/bond-crisis-overview-2026-08-11.md
- docs/research/bond-crisis-cme-2026-08-11.md · bond-crisis-cme-prototype-2026-08-11.md
- docs/research/bond-crisis-sentiment-learn-settings-2026-08-11.md
- docs/research/bond-crisis-existing-pages-gaps-2026-08-11.md
