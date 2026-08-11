# 07 - Task: Backend CME — IV/±σ/P-C/FedWatch/COT 50 ผลิตภัณฑ์

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 02

## Answer

Backend CME เสร็จ — commit `1640332` (prototype วัดก่อน: `docs/research/bond-crisis-cme-prototype-2026-08-11.md`)

- **Prototype HITL**: vol2vol paywall (403 "ต้องปลดล็อก") · Hyperliquid ฟรี 232 markets · ZQ=F 96.24 · Deribit mark_iv 58.11% · CME CmeWS path จริง = `Volume/LastTotals/437` (เจอ gold OI 400,331 ตรง reference เป๊ะ!) · CME บล็อก Vercel egress (403) → **CFTC fallback** (371,551 รายสัปดาห์)
- **`/api/cme`**: FedWatch (ZQ→implied 3.76 vs EFFR 3.63 = 52% hike/48% hold — วิธี CME FedWatch) · gold_flow (CME รายวัน → CFTC fallback + source label) · crypto_iv (Deribit BTC/ETH; SOL/XRP None) · cot (13 series จาก macro) · vol2vol-dependent = "—" honest
- tests 6 ใหม่ — suite **542 passed** · verify ok · prod 200 (gold ผ่าน CFTC fallback)
- หยุดรอตรวจ → user "ลุย" → commit

## Question

สร้าง backend `/api/cme`: IV + กรอบ ±1-3σ + P/C ratio 50 ผลิตภัณฑ์ + FEDWATCH (จากราคา ZQ → โอกาสขึ้น/คง/ลง) + FedWatch ย้อนหลัง + อันดับ IV + กระแสเงินทอง (OI/วอลุ่ม) + COT + basis trade

## ขอบเขต

- ตามผล research 02: vol2vol (ฟรี? proxy?) · Hyperliquid ราคาสด · CFTC/CME public report (มี pattern อยู่แล้ว)
- FEDWATCH: คำนวณจากราคาสัญญา ZQ (วิธีเดียวกับ CME FedWatch — research 02 ต้องให้สูตร)
- **HITL prototype ก่อน** (กฎ mirroring ข้อ 4): วัดว่าแหล่งข้อมูลฟรีครอบคลุม 50 ผลิตภัณฑ์ไหม → ถ้าไม่ครบ ให้ user เลือก (ลดจำนวน/หาแหล่งอื่น/ยอม "—")
- เทสต์ stub fetch · ⚠️ หยุดรอตรวจก่อน commit

## เป้าหมาย

`/api/cme` คืน payload ครบ (ตารางรวม + FedWatch + รายผลิตภัณฑ์) → ต่อ frontend
