# 05 - Task: Frontend สัญญาณเทรด (stats panel + signal cards + filters)

Type: task
Status: resolved
Blocked by: 04

## Answer

Frontend เสร็จสมบูรณ์ — commit `17e8b0d` (พร้อม backend จาก ticket 04 ใน commit เดียวกัน หลัง user อนุมัติ):

**`frontend/src/components/tools/SignalsDashboard.tsx`:**
- Stats panels ครบตาม research: ชั้นแรก 6 ช่อง (สัญญาณที่ทำงาน, P&L ลอยตัว, P&L ที่ปิดแล้ว, อัตราชนะ, Profit Factor, Drawdown สูงสุด) + ชั้นละเอียด 9 ช่อง (ค่าคาดหวัง, กำไร/ขาดทุนเฉลี่ย, Payoff Ratio, ดีที่สุด/แย่ที่สุด, ถือเฉลี่ย, R:R เฉลี่ย, ปิดแล้ว) — แสดง "—" ตรงไปตรงมาเมื่อยังไม่มีข้อมูล
- Category breakdown (stocks/crypto/macro/forex — W/L/WR ต่อหมวด) + filters (category + sort strength/P&L/date/asset)
- ตาราง 12 คอลัมน์ expandable: asset/model badge, direction pill, entry/TP/SL, current + ปิดเมื่อ, P&L สี, strength bar, sparkline 20 จุด (SVG), status badge (ทำงาน/TP ถึง/SL โดน/หมดอายุ), ปุ่ม ปิดออเดอร์; expand → TA detail (คะแนน + 6 conditions + indicators + levels)
- Equity curve SVG (จาก closed trades) แสดงเมื่อมี ≥2
- client.ts + types.ts: getSignals/refreshSignals/closeSignal

**BondCrisisPage:** sub-tab ที่ 3 "สัญญาณเทรด" (ข้อมูลมหภาค / โมเดลทำกำไร / สัญญาณเทรด)

**ผลทดสอบ:** backend 434 (ใหม่ 8), frontend 559 (ใหม่ 8), tsc clean; live smoke: 12 สัญญาณ active จากตลาดจริง + sparkline 20 จุด

**หมายเหตุ:** sparkline ต้องเพิ่ม column ใน SQLite (`sparkline TEXT`) — migration idempotent ใน main.py lifespan สำหรับ DB ที่มีอยู่ก่อน

## Question

สร้าง frontend component `SignalsDashboard.tsx` ให้เหมือนหน้า /signals ของต้นฉบับ 100% (ตาม research จาก ticket 01) และเพิ่มเป็น sub-tab ที่ 3 ใน Bond-crisisPage (ข้อมูลมหภาค / โมเดลทำกำไร / สัญญาณเทรด)

## Scope

- Stats panel: active/closed count, win rate, P&L ที่ปิดแล้ว/ลอยตัว, R:R เฉลี่ย, profit factor, ค่าคาดหวังต่อออเดอร์, ออเดอร์ดีที่สุด/แย่ที่สุด (label ไทยจาก i18n ต้นฉบับ)
- Tabs/filters: active / closed (tp_hit + sl_hit + expired)
- Signal cards: asset + direction pill + status badge (ทำงาน/TP ถึง/SL โดน/หมดอายุ), entry/TP/SL/current price, P&L %, signal strength bar + 5 factors, rationale (ไทย), TA snapshot (คะแนน + 5 conditions + levels), model badge, sparkline (SVG จากข้อมูล market_prices)
- การ์ดสัญญาณ expandable เหมือน ModelsDashboard
- client.ts + types.ts เพิ่ม getSignals/refreshSignals
- Thai-first, ink palette เดียวกับ ModelsDashboard
- Tests (vitest): render stats, filter tabs, expand card, refresh, error state

## Deliverable

component + tests ผ่าน + sub-tab ใน BondCrisisPage
