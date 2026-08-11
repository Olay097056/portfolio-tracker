# Prototype — CME หน้า: แหล่งข้อมูลฟรีที่วัดได้ (2026-08-11)

> ใบ 07 prototype (HITL — กติกา mirroring ข้อ 4: วัดก่อน build) · scripts ใน `.scratch/bond-crisis-100/prototype-07/`

## ผลวัด (ทุกตัวรันจริง + timestamp)

| แหล่ง | endpoint | ผล | ใช้ทำ |
|---|---|---|---|
| **vol2vol** | `GET /api/expected-range/dte-options` | 🔴 **403 paywall**: "ต้องปลดล็อกก่อนใช้งาน — ปลดล็อกฟรี 1 วัน หรืออัปเกรด PRO" | IV/σ/P-C 50 ผลิตภัณฑ์ (หัวใจ reference) |
| **Hyperliquid** | `POST /api.hyperliquid.xyz/info` (metaAndAssetCtxs) | 🟢 200 — 232 markets, BTC mark=64,201.5 | ราคาสด (reference ใช้ trade_marks เหมือนกัน) |
| **ZQ=F (yfinance)** | Ticker("ZQ=F").history | 🟢 last=96.240 (reference: 96.305 — ใกล้) | **FedWatch** (อิมพลายด์ = 100−96.240 = 3.76%) |
| **CFTC disagg/tff** | publicreporting.cftc.gov (มีใน macro อยู่แล้ว) | 🟢 200 | COT 12 series + basis trade |
| **Deribit** | `get_book_summary_by_currency` / `ticker` / `get_volatility_index_data` | 🟢 mark_iv=58.11% (BTC-12AUG26-58000-C) · vol index 35.78% · **792 BTC instruments** | Crypto IV: BTC/ETH (SOL/XRP **ไม่มี options**) |
| **gold-volume.com** | (แหล่งของ reference เอง) | 🔴 **DNS dead** (getaddrinfo failed) | Gold OI — reference แหล่งเดียวกับเราก็ตาย |
| **CME CmeWS** | /CmeWS/mvc/* (quotes/settle/OI/dailypx) | 🔴 404 ทั้งหมด (API ปิด/เปลี่ยน) | Gold OI |
| **Barchart** | /proxies/core-api/v1/quotes/get | 🔴 401 (ต้อง key) | Gold OI |

## สรุปความสามารถ (เลือก D ของ user: B + ลอง OI — **เจอ OI แล้ว!**)

**ได้ฟรี (ครบทุกส่วนที่ฟรีได้):**
- FedWatch: อิมพลายด์อัตราจาก ZQ=F → โอกาสขึ้น/คง/ลง (วิธี CME FedWatch) + FedWatch ย้อนหลัง (สะสมรายชม.)
- ราคาสด: Hyperliquid (คริปโต) + yfinance (โลหะ/พลังงาน/บอนด์)
- COT 12 series + basis trade chart (CFTC — มีใน macro แล้ว)
- Crypto IV: BTC/ETH จาก Deribit (mark_iv + vol index) — SOL/XRP ไม่มี options → "—"
- **Gold OI/วอลุ่ม: CME `/CmeWS/mvc/Volume/LastTotals/{productId}?days=N` — productId=437 (gold)** — วัดจริง: 20260707 futureVolume=131,313 · optionVolume=67,400 · futureOi=371,776 · optionOi=745,440 (scale ตรงกับ reference OI 400,331)

**ไม่ได้ (แสดง "—" ตรงไปตรงมา):**
- IV/±σ/P-C ของโลหะ/พลังงาน/บอนด์ (vol2vol paywall)
- SOL/XRP options IV (Deribit ไม่มี)

## ทางเลือกที่ user ตัดสินใจแล้ว

- D: ทำส่วนที่ฟรีได้ + แสดง "—" ที่เหลือ (ไม่จ่าย vol2vol PRO) — **ขุดจนเจอ CME LastTotals OI** (probe 22-29: CmeWS path จริง = Volume/Details + Volume/LastTotals + Volume/TradeDates — 404 ของ CmeWS เดิมเพราะ path ผิดไม่ใช่ API ตาย)

## ไฟล์หลักฐาน

- `probe_sources.py` — vol2vol/Hyperliquid/CME/ZQ ครั้งแรก
- `probe2.py` — vol2vol + CME path discovery
- `dig_vol2vol.py` — ขุด JS vol2vol → เจอ /api/expected-range + /api/analytics
- `probe3.py` — ยืนยัน vol2vol 403 paywall
- `probe4.py` — Deribit summary 200 + gold-volume DNS dead + CME 404
- `probe5.py`/`probe6.py` — Deribit vol filtering (summary vol ว่าง)
- `probe7.py` — **Deribit ticker mark_iv=58.11% + vol index 35.78%** + barchart 401
