# 10 - Task: แก้ 9 หน้าที่ mirror แล้วให้ 100% (ตาม gap ใบ 04) + Spec ปิดแผน

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 04

## Answer

ทุก gap แก้ + แผนปิด — commit `ad8909d` + spec `docs/specs/2026-08-11-bond-crisis-100-as-built.md`

- macro: deposits 19.4→**19,362.7** (scale fix) · Bid-to-Cover แยก tenor (2Y 2.66/5Y 2.28/30Y 2.44 — ตรง reference; 30Y = type Bond) · test stub อัปเดต
- models: factor bars ใช้ factor_caps จริง (/25·/30·/15·/20·/15) — ไม่ hardcode 25
- banking: **bank_stocks 11 ตัว** (BKX/KBE/KRE/FITB/HBAN/KEY/RF/TFC/USB/WAL/ZION) + **BankingOut schema drop fix** (Pydantic — บทเรียนซ้ำ crypto_fear_greed) + 10-min cache (Yahoo rate-limit Vercel)
- trade-desk: 1 ทีม DEEPSEEK (4 seats) — legacy A/B ลบ (config/prompts/tests)
- prod: ทุก endpoint 200 · pytest 542 · vitest 564 · verify ok · **แผน CLOSED**

## Question

ตามรายการ gap ที่ user อนุมัติในใบ 04 — แก้ 9 หน้าเดิม (macro/models/signals/news/banking/countries/forecast/boardroom/trade-desk) ให้เหมือน reference 100% + ปิดแผน

## ขอบเขต

- แก้ตาม gap list (ใบละจุด — แยก commit ต่อหน้า)
- spec as-built: `docs/specs/2026-08-11-bond-crisis-100.md` (จากโค้ดที่ ship จริง — บทเรียน forecast-tab)
- self-check: ทุกใบ closed + full suite + `hermes verify --json` + นับ rows portfolio.db ก่อน/หลังเทสต์
- ⚠️ หยุดรอตรวจก่อน commit

## เป้าหมาย

bond-crisis = reference 100% ทุกหน้า (ยกเว้นที่ grilling ตัด) → ปิดแผน
