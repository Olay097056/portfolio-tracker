# Trade desk test performance — root cause & fix (2026-08-18)

## อาการ

Full backend suite ใช้เวลา 539.8s (8:59); `hermes verify` เกือบชน timeout
600s (445–540s ต่อรอบ) และดูเหมือนค้างเพราะไม่มี output ระหว่าง test

## ต้นเหตุ (พิสูจน์ด้วย cProfile)

- `run_turn()` / `ensure_weekly_target()` เรียก `_build_base_context()`
  ซึ่งรัน service หนักทุกครั้ง:
  - `build_markets()` → yfinance.download S&P 503 ตัว ~12s (1,098× sleep)
  - `build_dashboard()` → FRED 31 ซีรีส์ ~5–6s
  - `fetch_cnn()` → CNN Fear & Greed หน้าเว็บ ~1–2s
- conftest `_fresh_cache_per_test` ล้าง DB cache ทุก test → ทุก test จ่าย
  cold start เต็ม → test ตัวละ 22–27s
- test เคย mock `llm_call`/`_run_analyst`/`get_prices_for_symbols`/
  `fetch_fundamentals` แต่ **ลืม mock `build_markets`/`build_dashboard`/
  `build_models`/`fetch_cnn`**

## แก้

เพิ่ม fixture `fast_base_context` ใน 4 ไฟล์ test (cash/pending/summaries/turn)
mock 4 service หนักดังกล่าว → ตัวเลข:

| กลุ่ม | ก่อน | หลัง |
|---|---|---|
| 4 ไฟล์ trade desk | 191.4s | 1.44s |
| Full backend suite | 539.8s | 311.7s |

## หมายเหตุ

- ไม่แตะ logic production — แค่ test เร็วขึ้น
- `test_markets_endpoint_returns_stock_shape` ยังรัน `build_markets` จริง
  (~14s) เพราะเป็นการทดสอบ endpoint ที่ควรเห็นของจริง — ตั้งใจปล่อยไว้
- รอบ 2 (2026-08-18): เจอตัวร้ายตัวจริงเพิ่ม — `fetch_fundamentals()`
  ดาวน์โหลด yfinance 503 ตัว ~11.8s/รอบ × 6 analyst loop = ~70s/test
  ใน `test_trade_desk_directive.py` → เพิ่ม mock ใน fixture ด้วย
  ผลลัพธ์รอบเต็ม: 596 passed ใน **42.3s** (จากเดิม 539.8s = เร็วกว่า 12.8 เท่า)
- ถ้าต้องการให้ `hermes verify` เข้าต่ำกว่า ~1 นาที: mock `build_markets`
  ใน `test_markets_endpoint_returns_stock_shape` ด้วย (เสีย real-data
  coverage ไป 1 จุด) หรือแยกเป็น "smoke test" รันคืนละครั้ง