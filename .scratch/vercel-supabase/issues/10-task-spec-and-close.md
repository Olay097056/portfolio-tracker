# 10 - Task: Spec as-built + ปิดแผน

Type: task
Status: closed
Claimed: hermes/2026-08-11
Blocked by: 09

## Question

เขียน `docs/specs/2026-08-10-vercel-supabase.md` (as-built จากโค้ดจริง — บทเรียน forecast-tab) + ปิด map + self-check + รายงาน + รอลุย commit

## ขอบเขต

- spec: สถาปัตยกรรมใหม่ (Vercel + Supabase + worker) · อะไรเปลี่ยน/อะไรอยู่ · วิธีรัน dev vs prod · ค่าใช้จ่ายจริง ($0 + อะไรที่เจอจริง) · fallback ที่บันทึกจาก spike
- self-check (บทเรียน): parse `Status:` ทุกใบ — ทุกใบ closed จริง, blocking ปิดครบ
- full suite + `hermes verify --json` (รันจริง)
- ⚠️ หยุดรอตรวจก่อน commit

## Answer

แผนปิดสมบูรณ์ — commit `5edf17a` (2026-08-11)

1. **Spec as-built**: `docs/specs/2026-08-11-vercel-supabase-as-built.md` — สถาปัตยกรรมใหม่ (Vercel static+function → Supabase Postgres + cache_entries + job_runs + pg_cron worker) · ตาราง เปลี่ยน/อยู่ (SQLite→PG, cache dict→ตาราง, thread→cron tick, Playwright→wgb API, OpenRouter→opencode-go) · dev vs prod run · ค่าใช้จ่ายจริง $0 (Vercel Hobby + Supabase Free, bundle 290MB optimize auto) · fallback (pause 7 วัน / FRED-wgb โดนบล็อก / rollback = Docker dev env)
2. **Self-check**: parse Status ทุกใบ 01–10 = **closed ครบ** · blocking chain ปิดตามลำดับ (01→04→05→06→07→08→09→10) ✓
3. **Full suite + verify (รันจริง)**:
   - SQLite **531 passed** ✓ · Postgres **531 passed** ✓ (pt-pg-test PG16 — ทั้งคู่ 531 เพราะ test_jobs +1 จากใบ 07)
   - `hermes verify --json` — ตอนแรก FAIL เพราะ recipe auto-detect รัน `uvicorn main:app` จาก repo root + Hermes venv ไม่มี pytest → **บันทึก `.hermes/environment.json`** (ชี้ backend/app.main + project venv + /health) → **ok: True — bootstrap ✓ test (pytest เต็ม 26s) ✓ readiness 200 /health ✓**
4. สิ่งสร้างปิดแผน: README Option C (prod) · spec as-built · .hermes/environment.json · ใบ 01–10 closed

ตัวเลขวัดจริง · อนุมัติ "ลุย" → commit แยกตามวินัย
