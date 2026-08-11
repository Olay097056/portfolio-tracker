# 03 - Prototype: 2 ทีม prompt + วัดต้นทุน + พิสูจน์ "ต่างจริง"

Type: prototype
Status: closed
Claimed: hermes/2026-08-10
Blocked by: 02

## Question

จากผัง ticket 02 — เขียน prompt จริงของ 2 ทีม (หัวหน้า+ลูกทีม 2) รันประชุมเทสต์บนข้อมูลจริง
วัดต้นทุน/เวลา/คุณภาพ **และพิสูจน์ว่าสองทีมตัดสินใจต่างกันจริง** (หัวใจของแผน —
โมเดลเดียวกัน อคติร่วม — ถ้าเทรดเหมือนกัน = ออกแบบยังไม่ต่างพอ ต้องปรับ)

## ⚠️ กติกา

- prototype = scratch (`.scratch/trade-desk/prototype-01/`) — **ห้ามแตะโค้ด production**
- ใช้ DeepSeek จริง (คีย์ `backend/.env` — DEEPSEEK_API_KEY) — ต้นทุนเล็ก (~$0.003/เทิร์น × 2 ทีม × 2 รอบ)
- รายงานเลขจริง: คอล/tokens/ต้นทุน/เวลา/ผลการตัดสินของแต่ละทีม

## สิ่งที่ต้องทำ

1. **Prompt pack 2 ชุด** — TEAM_A (เทรนด์+เทคนิคอล — technical pack: ราคา/MA/RSI/คะแนนโมเดล) vs TEAM_B (กลับค่า+มหภาค — macro pack: FRED/ข่าว/COT/จุดตรวจ) + หัวหน้า (เห็นทั้ง 2 + พอร์ตทีม — เคาะ + SL/TP)
2. **รัน 2 เทิร์น** (ข้อมูลจริงจาก `build_snapshot` — reuse อย่างเดียวกับ boardroom) — กับ scenario เดียวกัน (เช่น น้ำมันช็อก + ตลาดแรงงานอ่อน)
3. **วัด**: ต้นทุน/เทิร์น/ทีม · เวลา · tokens · **ข้อเสนอของ 2 ทีมต่างกันไหม** (สินทรัพย์/ทิศทาง/ขนาด/SL) — ถ้าเหมือนกัน → ปรับ TEAM_A/B_CONFIG ให้ต่างขึ้น แล้วรันใหม่
4. **สลับ scenario** อีกรอบ (กัน "บังเอิญต่าง") — อย่างน้อย 2 scenario
5. สรุป → `## Answer` → ป้อน prompt/config จริงเข้า ticket 06

## Answer

**Prototype เสร็จ + พิสูจน์แล้ว (2026-08-10) — ตัวเลขจริงจากการยิง DeepSeek**

### ผลพิสูจน์: สองทีมต่างจริง ✅ (ครบทั้ง 2 scenario — คนละสินทรัพย์)
| Scenario | ทีม A (เทรนด์) | ทีม B (กลับค่า) | Verdict |
|---|---|---|---|
| น้ำมันช็อก/ฮอร์มุซ | **long BTC-USD** 5% (ลูกทีม 8/7%) | **short CL** 4% (ลูกทีม 4/3%) | ต่างจริง — คนละสินทรัพย์ สวนตรรกะ |
| CPI สูง + แรงงานอ่อน | ลูกทีมอยากเปิด BTC/TLT → **หัวหน้า hold** | **long US10Y** 3% | ต่างจริง — A ระวัง B เปิด |

- risk bands ทำงานจริง: A ใช้ 5–10% (size 7–8) · B ใช้ 2–5% (size 3–4) — แต่ละทีมเคารพกรอบตัวเอง
- หัวหน้า "สวนลูกทีม" ได้ (S1/A hold ทั้งที่ลูกทีมอยากเปิด) — ตรงดีไซน์

### ต้นทุนจริง (DeepSeek v4-flash — 4 เทิร์น 12 คอล รวม $0.001888 · 33s)
- ต่อเทิร์น (2 ทีม 6 คอล): **$0.00047** · ~8–9s · ~2.9k tokens
- ต่อวัน (4 เทิร์น) ≈ $0.002 · ต่อเดือน ≈ **$0.06** — ถูกกว่าที่คาด (Q1: $0.003/เทิร์น) 6 เท่า

### บทเรียน → ป้อน ticket 06 (สำคัญ)
1. **ต้องปิด thinking** — `"thinking": {"type": "disabled"}` ใน payload — ไม่ปิด = content ว่าง (โมเดลเผา budget บน reasoning — 4500 completion tok แต่ content '') + ช้า 6 เท่า + แพง 3 เท่า (วัดจริง)
2. parser JSON ต้อง robust (fenced block/ข้อความรอบ — ใช้ pattern `_parse_json_block` ของ boardroom)
3. ลูกทีม/หัวหน้า schema: action/market/side/size_pct/sl_pct/tp_pct/horizon_days/reason — ใช้ได้จริงทั้ง 12 คอล
4. yfinance env นี้ดึง XAUUSD/USOIL/FX ไม่ได้ (delisted — 404) — ได้ ^GSPC/^IXIC/TLT — ticket 06 ใช้ resolver ladder (boardroom_stance_service) แทนการ hardcode

### ไฟล์
- `.scratch/trade-desk/prototype-01/prototype_td.py` (prompt pack 2 ทีม + ตัวรัน) · `analyze_td.py` · `runs/prototype_td.json`

**ปลดบล็อก: ticket 06 (backend engine) ✅ — มี prompt/config/ต้นทุนจริงแล้ว**
