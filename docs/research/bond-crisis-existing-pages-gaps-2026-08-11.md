# Grilling — เทียบ 9 หน้าที่ mirror แล้ว vs reference (2026-08-11)

> ใบ 04 ของแผน `.scratch/bond-crisis-100/` — เทียบจริงผ่าน preview (reference login) + prod ของเรา

## วิธีเทียบ

- reference: เปิดทุกหน้าใน preview (login olay097056@gmail.com) — อ่าน AX tree เต็ม
- ของเรา: prod https://portfolio-tracker-taupe-two.vercel.app (Bond-crisis tab) — browser snapshot + API payload

## Gap ต่อหน้า (เรียงตามความรุนแรง)

### 1. ข้อมูลมหภาค (/macro) — gap ใหญ่สุด 🔴
| # | reference มี | ของเรา | ระดับ |
|---|---|---|---|
| 1 | CME กรอบ ±1σ 11 ผลิตภัณฑ์ (OG/SO/HXE/PO/LO/BZO/LN/BTC/ETH/SOL/XRP + "0/11 นอกกรอบ" + ลิงก์ CME) | ข้อความ "ไม่มีแหล่งข้อมูลฟรี — ข้ามไปก่อน" | 🔴 เพิ่ม |
| 2 | ทองคำ CME โฟลว์ (OI 400,331 · Δ+2,629 · วอลุ่ม 142,327 · OI ออปชัน 797,501) | "—" ทั้งหมด | 🔴 เพิ่ม |
| 3 | FedWatch 5 การ์ด (ตลาดคิด 3.63% · โอกาส 56% ขึ้น 25bp · ขนาด +13.9bp · สัญญา 96.305 OZQU6) | ไม่มี | 🔴 เพิ่ม |
| 4 | CME IV 19 ตัว (ทอง/เงิน/เบรนต์/TTF 90% ฯลฯ) + IV ATM 6 ตัว (บอนด์ 2-30Y/SOFR) | ไม่มี | 🔴 เพิ่ม |
| 5 | EIA สต็อก 5 ตัว (ดิบ 406.99 · เบนซิน 209.66 · ดีเซล 107.16) | "ไม่มีข้อมูล" | 🔴 เพิ่ม |
| 6 | เงินฝาก $19,362.7B · Discount Window $5.3B · WRESBAL ฯลฯ สด | 19.4B (หน่วยผิด!) · 0B · เก่า 2 สัปดาห์ | 🔴 แก้บั๊ก |
| 7 | CDS proxy ≈25bps · หางประมูล 10Y 5bps · ดีลเลอร์รับ 7.78% · SRF $0B · หนี้ธุรกิจ 72.2% | ไม่มี | 🟡 เพิ่ม |
| 8 | Bid-to-Cover แยกค่า (2Y 2.66 / 5Y 2.28 / 30Y 2.44 / Indirect 81.5%) | ทุก tenor = 2.59x ซ้ำ (ผิด) | 🔴 แก้ |
| 9 | CPI 3.46% · PCE 3.67% (สด) | CPI 3.23% · PCE 3.49% (เก่า 2 เดือน) | 🟡 freshness |

### 2. สัญญาณเทรด (/signals) — บั๊กที่เจอระหว่างเทียบ 🔴
- **prod พัง**: `Signal data is unavailable right now: ProgrammingError` (503)
- **root cause**: `app/database.py` ขาด `prepare_threshold: None` → Supabase pooler (pgbouncer) ทำ executemany พัง (DuplicatePreparedStatement)
- **แก้แล้วระหว่างเทียบ**: เพิ่ม connect_args → prod 200 ✓ (39 signals) — ควร commit
- reference มีสถิติ: P&L ลอยตัว/ปิดแล้ว/อัตราชนะ/Profit Factor 1.97/DD -24.86%/สถิติละเอียด (ค่าคาดหวัง/payoff/ถือเฉลี่ย/R:R) + แยกหมวด (STOCKS/CRYPTO/MACRO/FOREX + WR) + เส้นทุนสะสม — ของเรามี stats อยู่แล้วแต่ต้องเทียบฟิลด์ (เช่น Profit Factor/ค่าคาดหวัง) 🟡

### 3. โมเดลทำกำไร (/models) 🟡
| # | reference | ของเรา |
|---|---|---|
| 1 | องค์ประกอบ 5 ตัว: โครงสร้าง /25 · มหภาค /30 · ข่าว /15 · ยืนยัน /20 · บทลงโทษ /15 | /25 ทุกตัว (125) |
| 2 | ความมั่นใจต่อโมเดล (90/89/88/95/92%) | 100% ตายตัว |
| 3 | เกณฑ์ก่อตัว 40 / ทำงาน 60 (เส้นบนกราฟ) | มีกราฟ — ตรวจเส้นเกณฑ์ |

### 4. วิกฤตแบงก์รัน (/banking) 🟡
- reference มี **ตาราง 10 หุ้นแบงก์** (BKX/FITB/HBAN/KBE/KEY/KRE/RF/TFC/USB/WAL/ZION + %1D) — ของเราไม่มี (มีแค่ gauge/funding/model/stat_cards ครบ)

### 5. ข่าวสาร (/news) 🟢 ใกล้เคียง
- reference: filter สำนักข่าว 28 รายการ + counts (Yahoo 4444...) + เรียงตาม (ล่าสุด/ผลกระทบ) + ผลกระทบขั้นต่ำ slider + pagination 771 หน้า
- ของเรา: API มี sources/pages/impact_score/AI วิเคราะห์ (title_th/analysis_th/related_models) ครบ — ตรวจ UI filter/slider ว่ามีครบไหม

### 6. รายประเทศ (/countries) 🟢 ใกล้เคียง
- ของเรา mirror ครบ (27 ประเทศ + score + 10Y + sort) — reference มี "ข้อมูลจำกัด/รายวัน/เรียลไทม์" badge ต่อประเทศ + "±bps vs US" — ตรวจของเรามีไหม

### 7. จำลองสถานการณ์ (/forecast) 🟢 เหมือน
- ของเรามี sliders 10 ตัว + Reset + ผลต่อ 6 โมเดล เหมือน reference เป๊ะ

### 8. ห้องประชุม (/boardroom) 🟢 เหมือน (mirror ล่าสุด — มีประวัติ/เปิดจากข่าว/โมเดลขยับ/ล้มเหลว)

### 9. ทีมเทรด (/trade-desk) 🟡
- reference: 9 ทีม (claude/gpt/gemini/deepseek/grok/glm/kimi/qwen/mistral) — ของเรา: **2 ทีม** (design ที่ user อนุมัติรอบก่อน — trade-desk-two-team-design) — ต้อง user ตัดสิน: ขยายเป็น 9 ทีมไหม?

## สรุปขนาดงาน

- 🔴 ต้องทำ: macro (8 จุด) + signals บั๊ก (แก้แล้ว รอ commit)
- 🟡 ต้องเทียบ/เพิ่ม: models (3 จุด) + banking (ตารางหุ้น) + trade-desk (9 vs 2 ทีม — ถาม user)
- 🟢 ใกล้เคียง: news/countries/forecast/boardroom (ตรวจรายละเอียดย่อย)

## Decision ที่รอ user

1. **trade-desk**: ขยาย 2 → 9 ทีม (เหมือน reference) หรือคง 2 ทีม?
2. **ลำดับแก้**: เริ่มจาก macro (ใหญ่สุด) ก่อน หรือ signals/models?
