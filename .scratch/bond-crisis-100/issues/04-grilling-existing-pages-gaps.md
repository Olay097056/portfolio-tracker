# 04 - Grilling: เทียบ 9 หน้าที่ mirror แล้ว vs reference — gap 100%

Type: grilling
Status: closed
Claimed: hermes/2026-08-11
Blocked by: —

## Question

9 หน้าที่ mirror ไปแล้ว (macro/models/signals/news/banking/countries/forecast/boardroom/trade-desk) ต่างจาก reference ตรงไหนบ้าง? — user ต้องการ 100% ต้องรู้ gap ทุกจุดก่อนแก้

## วิธีทำ

1. เปิด reference แต่ละหน้า (preview — login แล้ว) + เปิดของเรา (localhost หรือ prod) — เทียบ: การ์ด/สี/threshold/ป้ายไทย/ฟีเจอร์ย่อย/พฤติกรรม (refresh, hover, modal)
2. สร้างตาราง gap ต่อหน้า: "เหมือนแล้ว / ต่างเล็กน้อย (อะไร) / ต่างมาก (อะไร) / ขาดหาย (อะไร)"
3. HITL — ให้ user ยืนยันรายการ gap + ลำดับความสำคัญ (หน้าไหนต้องเป๊ะสุด)
4. deliverable: `docs/research/bond-crisis-existing-pages-gaps-2026-08-11.md`

## Answer

เทียบครบ 9 หน้า — deliverable: `docs/research/bond-crisis-existing-pages-gaps-2026-08-11.md`

**🔴 macro = gap ใหญ่สุด (8 จุด)**: CME σ/โฟลว์/FedWatch/IV 19+6 ตัว/EIA สต็อก/CDS proxy/หางประมูล/ดีลเลอร์รับ/SRF/หนี้ธุรกิจ ไม่มี + หน่วยเงินฝากผิด (19.4B ควร $19,362.7B) + Bid-to-Cover ซ้ำทุก tenor + freshness เก่า

**🔴 signals = พบ/แก้บั๊ก prod ระหว่างเทียบ**: `database.py` ขาด `prepare_threshold: None` → Supabase pooler พัง (DuplicatePreparedStatement) — **แก้แล้ว + deploy + prod 200 ✓ (รอ commit)** — reference มีสถิติละเอียด (Profit Factor/ค่าคาดหวัง/แยกหมวด/เส้นทุนสะสม) 🟡

**🟡 models**: องค์ประกอบ /25 ทุกตัว ควร /25·/30·/15·/20·/15 + ความมั่นใจ 100% ตายตัว (ควรต่อโมเดล) + เกณฑ์กราฟ
**🟡 trade-desk**: reference มี 9 ทีม (claude/gpt/gemini/deepseek/grok/glm/kimi/qwen/mistral) — **user ตัดสิน: เหลือ 1 ทีม = deepseek** (มี LLM จริงแค่ตัวเดียว — deepseek-v4-flash ผ่าน opencode-go; reference มี 9 provider จริง แต่เราไม่มี)
**🟢 ใกล้เคียง**: news (ตรวจ UI filter)/countries (badge freshness)/forecast/boardroom

**รอ user ตัดสิน**: (1) trade-desk 2→9 ทีม? (2) ลำดับแก้ macro ก่อน?

