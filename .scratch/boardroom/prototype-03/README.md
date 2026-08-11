# Prototype 03 — ประชุมจริง 1 ครั้ง (วัดต้นทุน + คุณภาพ)

Throwaway scripts สำหรับ wayfinder ticket 03 — **ไม่ใช่โค้ด production** (ห้ามแตะ backend/ หรือ frontend/).

## ไฟล์

- `prototype_03.py` — เครื่องยนต์ประชุมขนาดเล็ก (7 ที่นั่ง ตามผัง ticket 02) + context builder จากข้อมูลจริง
- `analyze.py` — เทียบ runA/runB/baseline: ต้นทุน, เวลา, จุดยืน, ตรวจตัวเลขแต่ง
- `context.json` — สแนปช็อตอินพุตจริง (macro + โมเดล + ข่าว) สร้างจาก `build_dashboard()` / `build_models()` / `news_items`
- `runs/` — ผลลัพธ์ต่อ run: `transcript.md` (อ่านง่าย), `messages.json`, `summary.json`, `context.json`

## วิธีรัน

```bash
cd backend
env -u PYTHONPATH -u VIRTUAL_ENV .venv/Scripts/python.exe \
    ../.scratch/boardroom/prototype-03/prototype_03.py --build-context
... --meeting --tag runA --mode full      # ประชุมเต็ม 1 ครั้ง
... --meeting --tag runB --mode full      # รันซ้ำ (test stability)
... --baseline --tag baseline             # เรียก DeepSeek ครั้งเดียวเทียบ
env -u PYTHONPATH -u VIRTUAL_ENV .venv/Scripts/python.exe \
    ../.scratch/boardroom/prototype-03/analyze.py
```

## ดีไซน์ที่ใช้ (ตาม ticket 02)

- 7 ที่นั่ง: เจมส์ (CEO), แมวมอง, นักเศรษฐศาสตร์มหภาค, เครดิต/บอนด์, เทคนิคอล, ผู้ท้าทาย A, ผู้ท้าทาย B
- เฟส: opening → research → briefing (blind 5) → debate r1 (5) → [evidence + external_data เฉพาะมีคำขอข้อมูล] → debate r2 (เฉพาะ contested) → verification (ผู้ท้าทาย 2) → resolution (CEO, JSON)
- ภาษาไทยล้วน, `thinking` disabled, temperature: brief 0.7 / debate 0.8 / ตรวจ 0.3 / CEO 0.3-0.5
- เพดาน: 40 คอล, 120s/คอล, retry 1 ครั้ง, timeout ประชุม 30 นาที
- ผู้ท้าทายเห็นเฉพาะข้อมูลจริง + ข้อกล่าวอ้าง (ไม่เห็นบทวิเคราะห์เต็ม) ตาม decision ข้อ 3

## ราคา (อ้างอิงทางการ)

https://api-docs.deepseek.com/quick_start/pricing — deepseek-v4-flash (DeepSeek-V4-Flash-0731):
input cache miss $0.14/1M · cache hit $0.0028/1M · output $0.28/1M — **ดึง 2026-08-09**

## ข้อจำกัดที่ยอมรับ

- เฟส "วิจัยภายนอก" ยังไม่มี web search จริง — แมวมองใช้ข่าว RSS + ข้อมูลในระบบ (ของจริง) — คำถาม "ภายนอก = แหล่งอะไร" ยังค้างใน map
- ไม่มีเฟส external_data ถ้าไม่มีคำขอข้อมูล (ตามดีไซน์)
