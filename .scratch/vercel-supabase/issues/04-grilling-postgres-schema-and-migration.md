# 04 - Grilling: สคีมา + การย้ายข้อมูล SQLite → Postgres

Type: grilling
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 01

## Answer

Grilling ครบ 6 ข้อ (2026-08-10) — user ยืนยันทั้งหมด — แผนสคีมา+migration พร้อมลงมือ (ใบ 05)

1. **เครื่องมือ: Alembic (ตั้งใหม่)** — โปรเจคยังไม่มี Alembic · env.py อ่าน `DATABASE_URL` · migration แรก = autogenerate สคีมา **26 ตาราง** (import Base ทั้ง 8 ไฟล์) · **ลบ PRAGMA/ALTER มือใน lifespan** (main.py:20-24)
2. **รวมฐานเดียว** — country 2 ตาราง (CountryBrief/CountryReport) เข้า schema หลัก · engine แยกของ country_ai_service:174 ลบ
3. **engine กลางเดียว** อ่าน `DATABASE_URL` · ลบ `check_same_thread=False`
4. **type mapping มาตรฐาน** — String/Float/DateTime(40)/Text/Integer/Boolean · **คง naive DateTime** (TIMESTAMP WITHOUT TIME ZONE — ไม่บังคับ TIMESTAMPTZ ในแผนนี้) · ไม่มี JSON column · `ilike` ใช้ครบ (ไม่มี `.like()`) · ตรวจ index/length ในใบ 05
5. **ข้อมูล: สคริปต์ copy** (SQLite read-only → Postgres **id เดิม** · count source==target ทุกตาราง — วัดจริง) · รันตอน Postgres ว่าง
6. **เทสต์ Hybrid** — conftest คง SQLite temp default · **ประตูผ่านใบ 05 = suite เขียวทั้ง SQLite และ Postgres** (docker local PG)

**ป้อน:** ใบ 05 (ลงมือทั้งหมด) · ใบ 07 (engine/check_same_thread already handled; country_ai_service ใช้ engine กลาง)

## จุดที่ต้องตัดสิน (พร้อมความเห็นตั้งต้นทุกข้อ)

1. **Migration tool**: Alembic (ตั้งใหม่) vs สคริปต์มือแบบเดิม (PRAGMA/ALTER ใน lifespan) — เสนอ Alembic พร้อมเหตุผล (หลักฐานการย้าย + ใช้กับ Postgres ได้)
2. **2 DB ไฟล์รวมกัน**: portfolio.db + bondcrisis.db → ฐานเดียวบน Supabase? (เสนอรวม — ข้อมูลน้อยมาก ข้อเท็จจริง 7)
3. **`check_same_thread=False` / engine การ์ด** ของ database.py + country_ai_service → Postgres/SQLAlchemy normal
4. **ชนิดข้อมูลที่ SQLite ทำได้แต่ Postgres ต้อง map** (เช่น JSON blob, เป็นต้น) — ตรวจตารางจริงทุกตาราง
5. **ข้อมูลจริง** (model_score_history 1,848 · screener_stocks 986 · news_items 545 · technical_signals 509 + ที่เหลือ) — ย้ายยังไง (dump/seed script)
6. **PORTFOLIO_DB_URL คงเดิม** — เทสต์แยก DB จริง (ข้อเท็จจริง 9) ยังต้องใช้ได้บน Postgres

## เป้าหมาย

แผนสคีมา + วิธี migration + วิธีเก็บเทสต์แยก → `## Answer` → ป้อนใบ 05 (ลงมือ migrate)