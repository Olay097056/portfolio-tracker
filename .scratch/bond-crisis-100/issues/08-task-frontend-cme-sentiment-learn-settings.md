# 08 - Task: Frontend CME + Sentiment + Learn + Settings

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 03, 07

## Answer

Frontend CME + Sentiment เสร็จ — commit `4596f42` (learn/settings รอใบ 09 grilling — คัดลอก/เขียนใหม่ + Telegram ต้อง user ตัดสิน)

- **CmeDashboard**: FedWatch 4 การ์ด + probability bar (52/48/0) · gold flow (CFTC fallback + source label) · crypto IV 4 ตัว (BTC 58.1/ETH 67.5 — SOL/XRP "—") · COT 13 series
- **SentimentDashboard**: CNN FG gauge (63 greed) + **Crypto FG (29 Fear — ตรง reference!)** + 4 indicators + 1 ปี history
- **backend**: crypto_fear_greed (alternative.me ฟรี) + **FearGreedOut schema หาย → Pydantic drop เงียบ (root cause prod None)** — แก้
- tests 7 ใหม่ — vitest **561 passed** · pytest 542 · tsc สะอาด · verify ok · prod ทั้ง 2 หน้าแสดงข้อมูลจริง

## Question

สร้าง frontend 4 หน้าที่เหลือ: `/cme` (ตาราง 50 ผลิตภัณฑ์ + FedWatch + กราฟ σ + เจาะรายผลิตภัณฑ์) · `/sentiment` (FG + crypto FG + 4 ดัชนี + ย้อนหลัง 1 ปี) · `/learn` (7 บท + อภิธาน) · `/settings` (บัญชี + Telegram) — เหมือน reference 100%

## ขอบเขต

- CmeDashboard / SentimentDashboard / LearnDashboard / SettingsDashboard — ป้ายไทย verbatim (research 02/03)
- prototype HTML ก่อน (HITL) — โดยเฉพาะ CME (กราฟ σ หลายแบบ)
- learn: เนื้อหาตาม grilling (คัดลอก/เขียนใหม่) · settings: Telegram ตาม grilling (bot จริง/UI อย่างเดียว)
- เทสต์ component · ⚠️ หยุดรอตรวจก่อน commit

## เป้าหมาย

4 หน้าใหม่ครบ → เหลือ office 3D (รอ grilling) + แก้ของเดิม (ใบ 04)
