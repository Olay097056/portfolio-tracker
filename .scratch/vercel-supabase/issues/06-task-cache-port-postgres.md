# 06 - Task: 21 ใน-memory cache → ตาราง Postgres cache (TTL เดิม)

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 05

## Question

แทน `_cache` dict ของ 21 โมดูล (ข้อเท็จจริง 1) ด้วยตาราง Postgres cache — serverless cold = cache หายทุกครั้ง · user ตัดสินแล้ว: **ตาราง Postgres cache table + helper กลาง, TTL 10 นาที (ของเดิม)**

## ขอบเขต

- ตาราง `cache_entries` (key, value_json, computed_at, ttl_sec) + helper กลาง (`cache_get`/`cache_set`) ใน database layer
- ย้ายทีละโมดูล (21 จุด: macro/model/price/news/signals/countries + routers) — แต่ละตัวใช้ helper แทน `_cache` dict · TTL เดิมคง
- LLM outputs ที่เขียนตารางอยู่แล้ว (boardroom/trade-desk/news) **ไม่** ต้องพึ่ง cache นี้ — ตรวจว่าไม่มีจุดไหนเผลอ cache ผล LLM ลง memory
- เส้นทาง cold-start: คอมพ์ครั้งแรก → persist → request ถัดไปอ่านจากตาราง
- เทสต์: cache TTL/work/expiry บน Postgres · ⚠️ หยุดรอตรวจก่อน commit

## Answer

ย้ายครบ 21 จุด + suite เขียวทั้งคู่ — commit `9714762` (2026-08-11) · 39 ไฟล์ (+475/−241)

1. **`app/cache.py`** — helper กลาง `cache_get`/`cache_set`/`cache_clear`/`session_cache_get` บนตาราง `cache_entries` · TTL = wall-clock (`computed_at` + `ttl_sec`) **ไม่ใช่** `time.monotonic()` (monotonic รีเซ็ตเมื่อ process start = cold-start cache ดู "สด" ทั้งที่เก่า — บั๊ก serverless ที่กำลังแก้) · JSON round-trip รองรับ numpy scalar/array + datetime/date · expired entry ถูกลบบน read (ตารางไม่โต)
2. **Migration** `a1b2c3d4e5f6_add_cache_entries` — `cache_entries` (key PK, value_json, computed_at, ttl_sec) ต่อจาก `fdb64c353441`
3. **ย้าย 21 จุด** — ai_narrative, chart, dividend, earnings, fx, history, macro (fred_history_map + dashboard), model (news scores — แยก key ts/scores), price (price + market_data), signals (candles), trending, routers: banking/compare/countries/fear_greed/macro/models/news/signals · **ตรวจซ้ำจริง**: `grep` ทั้ง repo เหลือ `_cache` dict = 0 จุดใน production path (backtest/data.py เป็น disk cache คนละเรื่อง)
4. **LLM outputs** — boardroom/trade-desk/news ไม่มี `_cache` dict หลง (ตรวจแล้ว) · news_service ลบ `_cache`+`_clear_cache` ที่ตายแล้ว (ไม่มี caller)
5. **เทสต์** — `tests/test_cache.py` 6 ตัว (roundtrip / expiry wall-clock / missing default / numpy+datetime / prefix-clear / overwrite) · conftest: SQLite ล้าง `cache_entries` ทุกเทสต์ (จำลอง in-memory isolation เดิม) · **suite เขียว: SQLite 526 ✓ · Postgres 526 ✓ (pt-pg-test local PG16)** — ตัวเลขวัดจริง

ตัวเลขวัดจริง · อนุมัติ "ลุย" → commit แยกตามวินัย
