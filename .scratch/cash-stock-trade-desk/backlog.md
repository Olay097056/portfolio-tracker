# Backlog — cash-stock-trade-desk (perp → หุ้นเงินสด S&P 500)

## Screener (2026-08-13 — วัดแล้ว ไม่ทำตอนนี้)

`POST /api/screener/stocks` บน prod ยิงตรง payload เปล่า → **total: 986** (ไม่ใช่ 0)
"0" ที่เห็นมาจากตัวกรองชื่อไม่ตรง ไม่ใช่ endpoint พัง:

- `sector: "Information Technology"` → 0 (DB ใช้ "Technology", 93 แถว)
- `sector: "Consumer Discretionary"` → 0 (DB ใช้ "Consumer Cyclical", 36)
- `sector: "Health Care"` → 0 (DB ใช้ "Healthcare", 170)
- `searchQuery: "AAPL"` → 0 (ตาราง 986 ตัวไม่มี mega-cap — skew small/mid-cap)
- `preset: "cloud"` / `"robotics"` → 0 (industry Software = 0 แถว, tags ว่าง)
- **ไม่มี UI caller** (มีแค่ `/search` typeahead; ToolsPage ไม่มีหน้า Screener) → ไม่มีใครเดือดร้อน

ทางแก้ที่เป็นไปได้ (ยังไม่ทำ): normalize sector mapping + distinct sector list ให้ UI ใช้

## Layer 3 — แหล่ง fundamental (รอ user เคาะ 2026-08-13)

S&P 500 503 · screener_stocks 986 · **ทับกันแค่ 95 (18.9%)** · mega-cap ใน screener = JPM ตัวเดียว
ไม่มี AAPL MSFT NVDA AMZN META GOOGL TSLA AVGO → ใช้เป็นแหล่ง fundamental ของ Layer 3 ไม่ได้

ทางเลือก:
- **ก.** ดึง fundamental S&P 500 ทั้ง 503 จาก yfinance `.info` (trailingPE/marketCap/sector) — ท่อเดียวกับ Layer 1 ไม่พึ่ง Finnhub
- **ข.** ไม่ใช้ fundamental เลย — AI ตัดสินจาก TA + ราคา + เซกเตอร์ (มีครบ 503 จาก Layer 1)
- **ค.** รัน refresh_screener ใหม่ universe=S&P 500 แต่ต้องแก้สคริปต์ให้เขียน Postgres ก่อน

(ผู้ช่วยเอนไปทาง ก. — รอ user ตัดสินใจ)
