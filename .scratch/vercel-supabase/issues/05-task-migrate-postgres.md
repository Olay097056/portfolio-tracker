# 05 - Task: ย้าย schema + ข้อมูลไป Postgres (ตามแผนใบ 04)

Type: task
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01, 04

## Question

ลงมือย้ายตามที่ใบ 04 ตัดสิน — production ยังรันบน Docker ได้ระหว่างนี้ (ชี้ Postgres ใหม่ตอนพร้อม)

## ขอบเขต

- models/schema → Postgres (ตามแผน 04) + Alembic หรือเครื่องมือที่ตกลง
- migrate ข้อมูลจริงทั้ง 2 ไฟล์ → Postgres (Supabase project — สร้างในใบนี้/ใบที่ user ช่วย)
- เก็บ `PORTFOLIO_DB_URL` (เทสต์แยก DB) ทำงานบน Postgres — conftest ชี้ temp Postgres
- full suite เขียวบน Postgres (ไม่ได้แค่บน SQLite)
- ⚠️ หยุดให้ user ตรวจก่อน commit · ตัวเลข = วัดจริง

## Answer

ย้าย schema + ข้อมูลไป Postgres เสร็จ + suite เขียวทั้งสอง backend — commit `5c4c005` (2026-08-11)

1. **Alembic initial migration** `fdb64c353441` — 26 ตาราง (ครอบ watchlist unique ticker + trading_signals.sparkline แทน manual backfill เดิมใน lifespan ของ main.py) — รันสำเร็จบน Supabase throwaway
2. **ข้อมูล** — copy_data.py (SQLite 2 ไฟล์ read-only → Postgres id เดิม) → `ALL MATCHED` ทุกตาราง · **จับบั๊ก:** `technical_signals` orphan (ไม่มี model/code) → ข้ามไม่พาไป + patch copy_data ให้ copy เฉพาะตารางที่อยู่ทั้งสองฝั่ง
3. **runtime** — database.py อ่าน `PORTFOLIO_DB_URL` (check_same_thread เฉพาะ sqlite) · main.py: sqlite dev ยัง create_all, Postgres schema ผ่าน Alembic · country_ai_service รวมตาราง bondcrisis.db เข้า Base กลาง (engine แยกหาย)
4. **เทสต์ hybrid** (grilling 04 §6 + user เลือก ข) — conftest: default = SQLite temp · เมื่อ `PORTFOLIO_DB_URL` ชี้ Postgres → schema จาก `alembic upgrade head` + truncate isolation ทุกเทสต์ + drop schema หลังจบ → **suite เขียวทั้งคู่: SQLite 520 ✓ · Postgres 520 ✓ (docker local PG postgres:16-alpine)**
5. deps: + alembic 1.19.1, psycopg[binary] 3.3.4

ตัวเลขวัดจริง · หยุดให้ user ตรวจก่อน commit แล้ว · อนุมัติ "ลุย" → commit แยกตามวินัย


## พบ / Finding (2026-08-10 — ทดสอบ throwaway recycle ทาง ก)

**รีเซ็ต throwaway Supabase `portfolio-tracker-migrate` (ref `mujxregicbbabemlwgrs`) สำเร็จ:** `DROP SCHEMA public CASCADE` → `alembic upgrade head` (26 ตาราง @ `fdb64c353441`) → `copy_data.py` → `ALL MATCHED` (ทุกตาราง Postgres = SQLite เป๊ะ, ตรวจจริง)

**บั๊กที่จับได้ + แก้:** `copy_data.py` ชนตาราง `technical_signals` (509 แถว) — **orphan จากเวอร์ชันเก่า** (ไม่มี model ใน `models.py` / ไม่มี code อ้างอิงทั้ง repo) → **จะไม่พาไป Supabase** · แก้สคริปต์ให้ copy เฉพาะตารางที่อยู่ทั้งสองฝั่ง + log `SKIP` — หลักฐานการแก้: `.scratch/vercel-supabase/migrate/copy_data.py` (เพิ่ม `_pg_tables()` + กรอง `technical_signals`)

**ขั้นตอน recycle (ใช้ซ้ำตอนย้ายจริง):**
1. `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
2. `PORTFOLIO_DB_URL=<supabase_url> python -m alembic upgrade head` (จาก `backend/`)
3. `python .scratch/vercel-supabase/migrate/copy_data.py`
- หมายเหตุ pooler: ใช้ `prepare_threshold=None` (psycopg3 + pgbouncer) · FK triggers ปิดระหว่าง copy (`session_replication_role=replica`)