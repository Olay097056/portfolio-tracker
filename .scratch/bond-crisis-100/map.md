# Map — Bond-crisis tab = reference 100% (UX/UI + backend + พฤติกรรม)

## Destination

Bond-crisis tab ของ portfolio-tracker **เหมือน reference (bond-crisis-dashboard-v2.vercel.app) 100%** — ทั้ง 15 หน้า: 9 หน้าที่ mirror แล้ว **เทียบแก้ให้เหมือนเป๊ะ** + 6 หน้าที่ยังไม่มี (ภาพรวม / อารมณ์ตลาด / CME / บทเรียน / ออฟฟิศ 3D / ตั้งค่า) สร้างใหม่ครบ · **backend + การทำงานให้เหมือนมากที่สุด**

## Notes

- ใช้สกิล `reference-dashboard-mirroring` + `bond-crisis-reference-dig` + `web-app-reverse-engineering`
- dig ที่ reuse ได้: `.scratch/boardroom/dig/` · `.scratch/boardroom-signals/dig/` · `.scratch/trade-desk/dig/` · `.scratch/overview-dig/`
- reference Supabase vovprwjjauwqqiowwgqd อ่านได้ ห้ามเขียน
- HITL: ทุก score/ดัชนีที่คำนวณต้อง prototype + user อนุมัติก่อน build
- กฎ user: 100% parity · ห้าม fabricate (ไม่มีข้อมูล = "—") · วัดจริงทุกตัวเลข · task หยุดรอตรวจก่อน commit

## Decisions so far

- [01 research overview](issues/01-research-overview-page.md) — 6 queries + ai-brief (glm-5.2) + key_events ใน ai_briefs + L6/Qw/Zt maps — `docs/research/bond-crisis-overview-2026-08-11.md`
- [02 research CME](issues/02-research-cme-page.md) — 3 edge fns + macro_series (COT 12 ids + fedwatch) + vol2vol/Hyperliquid/CFTC + i18n 162 คีย์ — `docs/research/bond-crisis-cme-2026-08-11.md`
- [03 research sentiment/learn/settings](issues/03-research-sentiment-learn-settings.md) — retail_sentiment + index_hourly · learn module 28440 · settings telegram-link — `docs/research/bond-crisis-sentiment-learn-settings-2026-08-11.md`
- [04 grilling เทียบของเดิม](issues/04-grilling-existing-pages-gaps.md) — macro gap ใหญ่สุด + **เจอ/แก้บั๊ก signals prod (prepare_threshold)** · **trade-desk = 1 ทีม deepseek** — `docs/research/bond-crisis-existing-pages-gaps-2026-08-11.md`
- [05 task backend overview](issues/05-task-backend-overview.md) — `/api/overview` + AI brief · commit `323c0a9`
- [06 task frontend overview](issues/06-task-frontend-overview.md) — tab ภาพรวม · commit `5e7fd64`
- [07 task backend CME](issues/07-task-backend-cme.md) — FedWatch (ZQ) + gold flow (CME→CFTC fallback) + crypto IV (Deribit) · commit `1640332`
- [08 task frontend CME+sentiment](issues/08-task-frontend-cme-sentiment-learn-settings.md) — tabs อารมณ์ตลาด + โซน CME + crypto_fear_greed + Pydantic drop fix · commit `4596f42`
- [09 grilling office/learn/telegram](issues/09-grilling-office3d-learn-telegram.md) — **office 3D = Three.js** · **learn = เขียนเนื้อหาเอง** · **Telegram = ตัด**
- [11 task frontend learn/settings/office 3D](issues/11-task-frontend-learn-settings-office.md) — Office 3D + Learn 7 บท + Settings · commit `59bb4bd`
- [10 task แก้ของเดิม + ปิดแผน](issues/10-task-fix-existing-and-close.md) — deposits/Bid-to-Cover/factor_caps/bank_stocks/trade-desk 1 ทีม · spec as-built · commit `ad8909d`

## Status: ✅ CLOSED (2026-08-11) — ใบ 01-11 ปิดครบ · bond-crisis 16 tabs เหมือน reference 100% · prod LIVE

## Not yet specified

<!-- ว่าง — แผนปิด -->

## Out of scope

- หน้า /backtest /members /tokens (admin/paywall ของ reference)
- Telegram bot (settings = บัญชี + รูปแบบแจ้งเตือน localStorage)
- เนื้อหา learn คัดลอก reference (เขียนใหม่เอง — ลิขสิทธิ์)
- IV/σ/P-C โลหะ/พลังงาน/บอนด์ (vol2vol paywall) + SOL/XRP options IV (Deribit ไม่มี)
- Trade-desk 9 ทีม (มี LLM จริงตัวเดียว — 1 ทีม DEEPSEEK 4 seats)
