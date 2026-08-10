# Boardroom page (ห้องประชุม AI) — reverse-engineered 2026-08-09

Result of wayfinder ticket **01 - Research: ขุดหน้า /boardroom ของต้นฉบับ** (`.scratch/boardroom/issues/01-research-boardroom-page.md`).

## หลักฐานดิบ (raw evidence)

- **Chunks ที่โหลดสด HTTP 200 เมื่อ 2026-08-09** (บันทึกไว้ที่ `.scratch/boardroom/dig/`):
  - `https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/app/boardroom/page-51e536c4d27fa7dd.js` — รายการประชุม (7,749 B)
  - `https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/app/boardroom/%5Bid%5D/page-e7f32132ef3ef608.js` — หน้าประชุมสด/ย้อนหลัง (14,297 B)
  - `https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/7317-9c94f4234f11962d.js` — component ชุดกลาง + ตัวประมวลผล claims (54,255 B)
  - `https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/3474-e1aec38ee927d485.js` — i18n ไทย+อังกฤษ (146,483 B)
  - settings / stats / memory / knowledge / data-gaps / signals page chunks (ขนาด 8–37 KB)
- วิธีค้น chunk หน้า detail: fetch `/boardroom/xyz-nosuch` → HTML อ้าง `static/chunks/app/boardroom/%5Bid%5D/page-e7f32132ef3ef608.js` (หน้า render 404 ได้แต่ chunk โผล่ใน HTML)
- ข้อความดิบทุกบรรทัดด้านล่างคัดลอกตรงจากไฟล์ใน `.scratch/boardroom/dig/`

**คำตอบครบ 10 ข้อ — ข้อไหนต้นฉบับฝัง logic ไว้ฝั่งเซิร์ฟเวอร์ (edge function) เขียน "หาไม่เจอ" กำกับไว้ชัดเจน**

---

## 1) `resolution_json` — โครงสร้างเต็ม ⭐ (แผน boardroom-signals รอข้อนี้)

Client อ่านจากคอลัมน์ `resolution_json` ของตาราง `boardroom_meetings` โดยตรง (detail page: `.from("boardroom_meetings").select("*")`) และ `resolution_md` (markdown ฉบับวิเคราะห์เต็ม) แยกอีกคอลัมน์ — component มติ (module 7317, fn `P`) เปิดด้วย:

```
let v=m.resolution_md,j=f.plain,N=f.claim_summary,k={short:u.brHorizonShort,medium:u.brHorizonMedium,long:u.brHorizonLong};
```

### โครงสร้าง (ฟิลด์ที่ client อ่านจริงทุกตัว พร้อมดิบ):

```jsonc
{
  "plain": {
    "summary": "...",            // f.plain.summary — สรุป (ดิบ: <p ... children:j.summary)
    "proven": ["..."],           // ✅ ข้อสรุปที่พิสูจน์แล้ว (brPlainProven)
    "unproven": ["..."],         // ⚖️ ข้อที่ยังฟันธงไม่ได้ (brPlainUnproven)
    "watch": ["..."],            // 👀 จับตา (brPlainWatch)
    "outlook": "..."             // คาดการณ์อนาคต (brPlainOutlook)
  },
  "claim_summary": {             // badge มุมบนขวาของกล่องมติ (ดิบ: N.verified N.failed N.unverified)
    "verified": 0, "failed": 0, "unverified": 0
  },
  "premise_risk": "...",         // ความเสี่ยงของตัววาระ (ดิบ: <span ...>brPremiseRisk</span> f.premise_risk)
  "stances": [                   // ⭐ จุดยืนรายสินทรัพย์
    {
      "asset": "US10Y", "stance": "long|short|neutral|insufficient_evidence",
      "consensus": "unanimous|contested",   // 🤝 เห็นตรงกันตั้งแต่รอบวิเคราะห์อิสระ / ⚔️ เห็นต่างตอนต้น เคาะหลังโต้แย้ง
      "confidence": 72,          // ตัวเลข 0-100 แสดง "72%"
      "horizon": "short|medium|long",       // ระยะสั้น 1-7 / กลาง 8-30 / ยาว 31-90 วัน (จาก brPredDesc)
      "horizon_days": 14,
      "price_at": 4.32,          // ราคา ณ วิเคราะห์ (brPredPriceAt)
      "due_at": "2026-08-23T07:00:00Z",     // ครบกำหนดตัดสิน
      "reason": "...",
      "qualified": true          // ⭐ false = "มุมมอง" ไม่เข้าบัญชี (conf<60 หรือมีคนหนุนอิสระ <2 — จาก brSigViewsDesc)
    }
  ],
  "watchlist": ["..."],          // สิ่งที่ต้องจับตา
  "verification": [              // ผลตรวจสอบข้อกล่าวอ้าง (brVerification)
    {"claim": "...", "verdict": "true|false|?"}   // ดิบ: "true"===e.verdict ? ✓ : "false"===e.verdict ? ✗ : ?
  ],
  "perspectives": ["..."],       // มุมมองเสริม (ยังพิสูจน์ไม่ได้) — แสดงเป็น “...”
  "knowledge": {                 // 📚 มติข้อมูลภายนอก (brKbResolutionHead)
    "proposals": [{
      "id": "K1", "title": "...", "statement": "...",
      "adopted": true, "dup_of": "K3?", "source_type": "web_research|model",
      "ref": "...", "as_of": "2026-08-01",
      "votes": {"by": [{"seat_id": "...", "adopt": true, "reason": "..."}], "adopt": 2, "reject": 1},
      "ceo_adopt": true, "supersedes": "...", "supersedes_label": "..."
    }],
    "reaffirmed": [...], "retired": [...]
  },
  "external_data": {             // 🔎 ตัวเลขภายนอกที่ที่ประชุมขอ (brVerifiedDataTitle)
    "requests": [{"metric": "US TGA", "requested_by": ["seat_id", ...]}],
    "items": [{
      "id": "V1",                // ⭐ id = "V" + (ลำดับ request+1) — data-gaps ใช้ n.find(e=>e.id==="V".concat(a+1))
      "metric": "...", "value": 123, "as_of": "...", "url": "...", "source": "...",
      "origin": "api|web|...",   // api = ดึงตรงจาก API (brVdApiOrigin)
      "status": "confirmed|rejected|not_found|unconfirmed",
      "matches": 2,              // จำนวนตัวตรวจ (ผู้ท้าทาย) ที่ตรงกัน — ใช้ได้เฉพาะ 2/2
      "verdicts": [{"seat_id": "...", "found_value": 123, "url": "...", "source": "...", "note": "..."}]
    }]
  },
  "room_view": {                 // มุมมองที่ประชุม (brRoomView)
    "news_read": "overhyped|as_reported|underrated|uncertain",  // ข่าวเกินจริง/ตามเนื้อข่าว/ตลาดประเมินต่ำไป/ยังไม่ชัด
    "summary": "markdown...",    // สรุป (มี ref chips ได้)
    "forecasts": [{              // มุมมองต่อตัวเลขที่จะประกาศ (brForecastHead)
      "event": "...", "event_time": "...", "consensus": 3.2, "previous": 2.8,
      "expected": "3.0-3.5", "reason": "...",
      "view": "above|inline|below|no_view",
      "scored_at": "...", "actual": 3.1, "correct": true, "due_at": "..."
    }]
  },
  "outcome": {                   // ⭐ ผลตัดสิน (ฝั่ง backend ค่อยเขียนหลังครบกำหนด)
    "h": {                       // ตามกรอบที่ประกาศ (brPredByHorizon) — array ขนานกับ stances (index เดียวกัน)
      "results": [{"asset": "US10Y", "stance": "long", "correct": true|null, "change_pct": 12.3, "horizon_days": 14, "unit": "pct|bp"}]
    },
    "d1": {"results": [...]},    // จุดตรวจ +1 วัน (brPredD1)
    "d3": {"results": [...]},    // +3 วัน (brPredD3)
    "d7": {"results": [...]}     // +7 วัน (brPredD7)
  }
}
```

หลักฐานว่า `outcome.h.results` เป็น **array ขนานกับ stances** (stats page ดิบ — `n[s]` คือผลของ stance ลำดับ `s`):

```
let n=function(e){let t={sig:{w:0,n:0},view:{w:0,n:0}};for(let a of e){var s,l;let e=null!=(s=a.stances)?s:[],n=null!=(l=a.outcome_h)?l:[];e.forEach((e,s)=>{if("long"!==e.stance&&"short"!==e.stance)return;let l=n[s];...
```

และ resolution card (module 7317) ใช้ index เดียวกัน: `f.stances.map((e,t)=>[e,t]).filter(...).map(e=>{let a,[i,d]=e; ... o=f.outcome?.h?.results?.[d] ...})` — สรุป: **`outcome[horizon].results[i]` = ผลของ `stances[i]`** ทุก horizon (h/d1/d3/d7 ใช้ index ร่วมกัน).

นอกจากนี้ meeting ยังมีคอลัมน์ `snapshot` (detail page `select("*")` จึงเห็น) — client อ่าน `L.snapshot.research.items`, `L.snapshot.research2.items`, `L.snapshot.memory` ([]{label, statement, confidence}), `L.snapshot.knowledge.items` — ใช้สร้าง ref chips ในบทสนทนา (R1../M../K../V../C..)

### ref code 5 ชนิด (ใน markdown ถูกแปลงเป็น chip — module 95090 fn `Dx` ดิบ):

```
([RMCKV])(\d{1,3})  →  [R12](#ref-R12)  // R=รายงานแมวมอง, M=ความจำห้อง, K=คลังความรู้, V=ตัวเลขภายนอก, C=ข้อกล่าวอ้าง
```

- `R{n}` = item ของ `snapshot.research.items` (มี `fact`, `source`)
- `M{label}` = item ของ `snapshot.memory` (มี `statement`, `confidence` — chip แสดง "ความจำของห้องประชุม: <statement> (<confidence>%)")
- `K{label}` = item ของ `snapshot.knowledge.items` (มี `title`, `statement`, `as_of`, `stale`)
- `V{id}` = item external_data (สถานะ confirmed → "ยืนยัน <matches>/2 ✓✓", rejected → "ถูกหักล้าง ✗", not_found → "หาไม่พบ", else "รอยืนยัน")
- `C{n}` = ข้อกล่าวอ้างในที่ประชุม (สถานะ verified/failed/unverifiable จากผลตรวจ)
- ข้อความพิเศษ: `[มุมมอง]` → `[💭 มุมมอง](#tag-opinion)`, `[ข่าวลือ-ยังไม่ยืนยัน]` → `[🕵️ ข่าวลือ-ยังไม่ยืนยัน](#tag-rumor)`; บรรทัดขึ้นต้น `ท้าทายวาระ:` → ⚠️, `ท้าทาย:` → ⚔️ (ดิบ regex `o=/^\*{0,2}(ท้าทายวาระ|ท้าทาย)\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/`)

---

## 2) ที่นั่งในห้องประชุม — 8 ตำแหน่ง

ตำแหน่ง 8 แบบ (module 7317 ดิบ — `j` map ตำแหน่ง + `N` map ไอคอน + `k` map สี):

```
let j={macro:{th:"นักเศรษฐศาสตร์มหภาค",en:"Macro Economist"},technical:{th:"นักวิเคราะห์เทคนิค",en:"Technical Analyst"},quant:{th:"นักวิเคราะห์ตัวเลขการเงิน",en:"Quant Analyst"},news:{th:"นักวิเคราะห์ข่าว",en:"News Analyst"},conspiracy:{th:"นักวิเคราะห์ข่าวลือ",en:"Conspiracy Analyst"},challenger:{th:"ผู้ท้าทาย",en:"Challenger"},ceo:{th:"ประธาน (CEO)",en:"CEO"},research:{th:"แมวมอง (วิจัยภายนอก)",en:"Scout (Outside Research)"}}
```

| position_key | ชื่อไทย | บทบาท |
|---|---|---|
| `ceo` | ประธาน (CEO) | คนสรุปมติ (brByJames: "สรุปโดย เจมส์ (CEO) จากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น") — นั่งแยกบนสุด เปิด/ปิดไม่ได้ (settings: `disabled:p` เมื่อเป็น ceo) |
| `research` | แมวมอง (วิจัยภายนอก) | ค้นเว็บสดก่อนอภิปราย (R1..Rn) + ค้นตัวเลขภายนอกที่ห้องขอ (V1..Vn) |
| `challenger` | ผู้ท้าทาย | ท้าทายวาระ/ข้อกล่าวอ้าง + ตรวจตัวเลขซ้ำอิสระ (2 คน — brVerifiedDataHint: "ให้ผู้ท้าทายทั้งสองออกไปค้นซ้ำจากแหล่งอิสระ") |
| `macro` | นักเศรษฐศาสตร์มหภาค | ผู้เชี่ยวชาญประจำสินทรัพย์/มุมมอง |
| `technical` | นักวิเคราะห์เทคนิค | ↑ |
| `quant` | นักวิเคราะห์ตัวเลขการเงิน | ↑ |
| `news` | นักวิเคราะห์ข่าว | ↑ |
| `conspiracy` | นักวิเคราะห์ข่าวลือ | ↑ |

**ที่นั่งจริง** = ตาราง `boardroom_seats` (ดิบ: `.from("boardroom_seats").select("*").order("sort")`) — ฟิลด์ต่อที่นั่ง (จาก settings set_seat + การ์ดที่นั่ง): `seat_id, position_key, provider, model, name_th, name_en, enabled, sort` — การ์ดที่นั่งแสดง `name_th/name_en` + `provider/model` (title: `"<ชื่อ> — <provider>/<model>"`) และ seat ปิด (`enabled:false`) จางลง `opacity-35`

**โมเดลต่อที่นั่ง — กำหนดได้ใน settings** (ดิบ provider map + model list):

```
let k={anthropic:"Anthropic (Claude)",openai:"OpenAI (GPT)",gemini:"Google (Gemini)",deepseek:"DeepSeek",openrouter:"OpenRouter (Llama/Grok/Qwen ฯลฯ)",glm:"Z.ai (GLM)"},
v={anthropic:["claude-opus-4-8","claude-sonnet-5","claude-haiku-4-5-20251001"],openai:["gpt-5.1","gpt-5.1-mini"],gemini:["gemini-2.5-pro","gemini-2.5-flash"],deepseek:["deepseek-chat","deepseek-reasoner"],openrouter:["x-ai/grok-4","meta-llama/llama-4-maverick","qwen/qwen3-235b-a22b"],glm:["glm-4.7","glm-4.6","glm-4.5"]}
```

**Fallback**: ค่ายที่ไม่มี key → Anthropic claude-sonnet-5 อัตโนมัติ (ดิบ i18n `brSeatsConfigDesc` = "ค่ายที่ไม่มี key จะ fallback เป็น Anthropic claude-sonnet-5 อัตโนมัติ" + settings แสดงป้าย "→ fallback claude-sonnet-5" เมื่อ `!h&&"anthropic"!==r.provider`; `brDeleteKeyConfirm` = "ที่นั่งที่ใช้ค่ายนี้จะสลับไปใช้ Anthropic อัตโนมัติ")

**Layout**: CEO อยู่กึ่งกลางแถวบน แยกกรอบ, ที่นั่งอื่นอยู่ในกล่องโค้งมนด้านล่าง (ดิบ fn `w`/TN); จอเล็กเลื่อนแนวนอน (`md:hidden` + `overflow-x-auto`) — ที่นั่งที่กำลังพูดมี ring + จุดเต้น (`speakingSeatId` = `turn_plan.turns[current_turn].seat`)

---

## 3) `turn_plan` — รูปร่างที่ client เห็น

Client อ่านเพียง 2 จุด (หน้า detail):

```
// ที่นั่งที่กำลังพูด = turns[current_turn].seat
L&&"running"===L.status&&null!=(s=null==(a=L.turn_plan)||null==(t=a.turns)||null==(e=t[L.current_turn])?void 0:e.seat)?s:null
// stepper ฟิลเตอร์เฟสเสริมโดยดูว่า turns มีเฟสนั้นไหม
let o=d.turn_plan.turns.some(e=>"evidence"===e.phase),x=d.turn_plan.turns.some(e=>"research"===e.phase),m=d.turn_plan.turns.some(e=>"external_data"===e.phase)
```

สรุป: `turn_plan = { turns: [{ phase, seat, ... }] }` + `current_turn` (index) — แต่ละ turn มีอย่างน้อย `phase` + `seat`; เฟส `evidence` / `research` / `external_data` เป็นเฟสเสริม (stepper ซ่อนถ้า turn_plan ไม่มี turn ของเฟสนั้น); เปลี่ยนเฟสเมื่อ current_turn เลื่อนข้าม turn

**ลำดับเฟสเต็ม 8 คีย์** (ดิบ `D` array + i18n map):

```
let D=["opening","research","briefing","debate","verification","evidence","external_data","resolution"]
es={opening:z.brPhaseOpening,research:z.brPhaseResearch,briefing:z.brPhaseBriefing,debate:z.brPhaseDebate,verification:z.brPhaseVerification,evidence:z.brPhaseEvidence,external_data:z.brPhaseExternalData,resolution:z.brPhaseResolution}
```

| คีย์ | ไทย | หมายเหตุ |
|---|---|---|
| opening | เปิดวาระ | ประธานเปิดคำถาม (settings `opening_questions` default 5 — brOpeningQuestions "จำนวนคำถามหลักของประธาน (ข้อ/ประชุม)") |
| research | วิจัยภายนอก | แมวมองค้นเว็บสดก่อนอภิปราย |
| briefing | นำเสนอ | รอบวิเคราะห์อิสระ (แต่ละที่นั่งเสนอจุดยืน — consensus "unanimous" มาจากรอบนี้) |
| debate | โต้แย้ง | มี turn ประเภท rebuttal/attack |
| verification | ตรวจสอบ | มี turn ประเภท review (claims ถูกตรวจ) |
| evidence | หาหลักฐานเพิ่ม | เฟสเสริม — ขอข้อมูลเพิ่ม (data_requests) |
| external_data | ตรวจตัวเลขภายนอก | เฟสเสริม — แมวมองค้นตัวเลข + ผู้ท้าทายตรวจซ้ำ |
| resolution | ลงมติ | CEO สรุปมติ (มี turn ประเภทที่ลงมติ) |

**จำนวนเทิร์นต่อเฟส / ใครพูดลำดับไหน: หาไม่เจอใน client** — `turn_plan` ถูก generate ฝั่ง edge function (`boardroom-start`/`orchestrate`) ซึ่งไม่มี source ใน client chunks; client เห็นแค่ผลลัพธ์ `turns[]` + `current_turn`

---

## 4) เฟส "วิจัยภายนอก" ดึงอะไร

**เฟส research**: แมวมองค้นเว็บสดก่อนเปิดอภิปราย — หลักฐาน i18n ดิบ:

```
brResearchHint = ข้อมูลค้นเว็บสดโดยแมวมองก่อนเปิดอภิปราย — ที่ประชุมอ้างอิงเป็น R1, R2, ...
brResearchTitle = 🔭 มุมมองโลกภายนอก
brResearchTypeHeadline = ข่าวใหม่ / brResearchTypeAnalyst = มุมมองนักวิเคราะห์ / brResearchTypePositioning = โพซิชัน/โฟลว์ / brResearchTypeAnalog = เหตุการณ์ในอดีต / brResearchTypeContrarian = มุมมองแย้ง
```

item โครงสร้าง (component UW ดิบ): `{id, type: "headline|analyst|positioning|analog|contrarian", fact, url, source}` — แสดง fact + ลิงก์ source (url)

**API ที่ใช้ค้นจริง: หาไม่เจอใน client** (อยู่ฝั่ง edge function) — แต่มีหลักฐานทางอ้อมว่า "ข้อมูลภายนอก" ของระบบใช้:
- **Trading Economics** เป็นแหล่งตัวเลขภายนอก (data-gaps header ดิบ: `"โควตา Trading Economics เดือนนี้: <n> / 500 (คำขอ · fetch-te-data ~5/รอบ · หยุดอัตโนมัติที่ 450)"` — อ่านจากตาราง `pipeline_runs` job `fetch-te-data`)
- **ตาราง `macro_series`** เช็คว่า metric มีในระบบแล้วหรือยัง (data-gaps: `.from("macro_series").select("series_id, value")`)
- แผนที่ regex metric→series_id 21+ รายการ (FRED `us_fima_repo_used` ฯลฯ, NY Fed `us_on_rrp`, `us_tga`, `us_sofr_effr_spread`, Yahoo `^MOVE`, CFTC COT gold/silver ฯลฯ — ดู `.scratch/boardroom/dig/br-page-d40c8d9844eb0f49.js` ตัวแปร `v`)

ข้อควรรู้สำหรับแผนเรา: ต้นฉบับมี web search + TE เป็น "ภายนอก" — ของเรามี `news_service` (RSS+DeepSeek) + macro/model data — คำถามเดิมใน map "จะนับว่าพอเป็นภายนอกไหม" ต้องตัดสินกันต่อใน ticket 02/03

---

## 5) `functions/v1/*` — signature ฝั่ง client (request/response ที่เห็นจริง)

### boardroom-start (เปิดประชุม) — ดิบจาก route chunk:

```
await fetch("".concat(p.VI,"/functions/v1/boardroom-start"),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer ".concat(A.access_token)},body:JSON.stringify({agenda:O.trim())})
```

- Request: `POST {agenda: string}` (textarea `maxLength: 2e3` = 2,000 ตัวอักษร)
- Response: `{meeting_id}` → redirect `/boardroom/<id>`; **409 + `{meeting_id}`** → มีประชุม running อยู่ → redirect ไปประชุมนั้น; error → `{error}` (แสดงข้อความ)
- เงื่อนไขปุ่ม: ต้อง login + มี agenda + ไม่มีประชุม running (`disabled:R||!O.trim()||!!I` — I = meetings.find(status==="running"))

### boardroom-orchestrate (เดินเครื่องประชุม) — ดิบจาก [id] page effect:

```
fetch("".concat(u.VI,"/functions/v1/boardroom-orchestrate"),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer ".concat(C.access_token)},body:JSON.stringify({meeting_id:P})})
```

- Request: `POST {meeting_id}` — **client เป็นคนเรียกซ้ำเองทุกครั้งที่**: meeting status=running และ `claim_until` หมดอายุ (`!Date.parse(claim_until)>Date.now()`) และ `updated_at` เก่ากว่า 8 วินาที และยังไม่เคยลองใน 15 วินาทีที่ผ่านมา → นี่คือกลไก worker ของสถาปัตยกรรม serverless (browser ที่เปิดหน้านี้ช่วยเดินเครื่องต่อ) — ของเรา single-process อาจไม่ต้องมี แต่ `claim_until` คือกลไก lock ของต้นฉบับ

### boardroom-admin — request ตาม action (settings/stats/knowledge/data-gaps ดิบ):

```
{action:"get_config"}                                  → config {providers[], seats[], settings{}}
{action:"set_api_key",provider,key}                    {action:"test_key",provider} → {ok, detail}
{action:"list_models",provider}                        → {ok, count, models[]}
{action:"delete_api_key",provider}
{action:"set_seat",seat_id,seat:{...ทั้งออบเจกต์ที่นั่ง}}
{action:"set_settings",settings:{...}}                 (calendar_countries ส่งเป็น array)
{action:"cancel_meeting",meeting_id}                   {action:"clear_memory"}
{action:"resume_meeting",meeting_id}                   ← ปุ่ม "ประชุมต่อ" เมื่อ status=failed
{action:"retire_knowledge",knowledge_id}               {action:"restore_knowledge",knowledge_id}
{action:"analyze_data_gap",metric}                     → {ok, provider_id, analysis_md}
```

### boardroom-trigger (ทดสอบ trigger) — ดิบจาก settings:

```
fetch("".concat(h.VI,"/functions/v1/boardroom-trigger"),{method:"POST",headers:{...},body:"{}"}) → {trigger: {...}}
```

**source ของ edge functions: หาไม่เจอ** — server-side ไม่มีใน client chunks; ที่เห็นคือ request/response ตามข้างบนเท่านั้น

---

## 6) Trigger 4 แบบ + เกณฑ์อัตโนมัติ

`trigger_type` 4 ค่า → ป้าย (ดิบ route chunk): `{manual:brTriggerManual, news:brTriggerNews, model:brTriggerModel, calendar:brTriggerCalendar}` = เปิดโดยแอดมิน / เปิดจากข่าว / เปิดจากโมเดลขยับ / เปิดจากข่าวแดง

**เกณฑ์อัตโนมัติ — knobs ทั้งหมดใน settings** (ดิบ state เริ่มต้น + ชื่อไทย):

```
{auto_trigger_enabled, news_impact_min, news_batch_hours:6, model_delta_min, calendar_countries:[...],
 cooldown_minutes, daily_cap, max_tokens_speech, max_tokens_resolution, max_llm_calls_per_meeting,
 knowledge_enabled:true, opening_questions:5, data_request_enabled:true}
```

| ฟิลด์ | ช่วง (input min/max) | ชื่อไทย (ดิบ) | ความหมายที่อนุมานได้ |
|---|---|---|---|
| `news_impact_min` | 10–100 | ข่าว impact ขั้นต่ำ | ข่าวต้องมี impact ≥ ค่านี้ถึงเปิดประชุม |
| `news_batch_hours` | 1–24 (default 6) | รวมข่าวแรงเปิดประชุมทุก (ชม.) | รวมข่าวแรงในกรอบเวลาแล้วเปิด 1 ครั้ง (batching) |
| `model_delta_min` | 2–50 | โมเดลขยับขั้นต่ำใน 6 ชม. (จุด) | คะแนนโมเดล (0-100) ขยับ ≥ ค่านี้ใน 6 ชม. |
| `calendar_countries` | CSV เช่น `USD,EUR` | สกุลเงินปฏิทินข่าวแดง (คั่นด้วย ,) | ข่าวแดง = ปฏิทินเศรษฐกิจของสกุลเงินเหล่านี้ (มี `brCalendarCountries`; แอปเรามีปฏิทินข่าวแดงของตัวเองจาก tab ข่าว?) |
| `cooldown_minutes` | 10–1440 | เว้นระยะระหว่างประชุม (นาที) | กันประชุมถี่เกิน |
| `daily_cap` | 0–12 | เพดานประชุมต่อวัน | 0 = ไม่จำกัด? |

คำโปรยยืนยันพฤติกรรม (ดิบ i18n): `brNoMeetings = ยังไม่มีการประชุม — ระบบจะเปิดวาระเองเมื่อมีข่าวแรง ตัวเลขโมเดลขยับ หรือประกาศข่าวแดง`

**เกณฑ์ข้างในจริงๆ (ข่าว impact คำนวณยังไง, โมเดลขยับวัดอะไรเป๊ะ): หาไม่เจอใน client** — อยู่ใน edge function `boardroom-trigger`; สิ่งที่ client เห็นคือค่าที่ตั้งได้กับผลลัพธ์ `{trigger}` — ของเราต้องออกแบบเอง (ticket 08)

---

## 7) สมองส่วนกลาง (memory) + คลังความรู้ (knowledge)

### boardroom_memory — หน้า /boardroom/memory (ดิบ select):

```
boardroom_memory.select("id, statement_md, tags, confidence, status, source_meeting_id, created_at, expires_at")
  .in("status",["active","challenged"]) / ["challenged"] / ["retired"] / all
  .order("confidence",{ascending:!1}).order("id",{ascending:!1})  // เรียง confidence มาก→น้อย
```

- ฟิลด์: `statement_md` (ข้อสรุป), `confidence` (0-100), `status` = active/challenged/retired, `tags[]`, `source_meeting_id`, `created_at`, `expires_at`
- การ์ด (component CU): แถบ confidence (เขียว ≥70 / ฟ้า-หลัก ≥50 / เหลือง <50 — ดิบ `a.confidence>=70?"bg-emerald-400":a.confidence>=50?"bg-accent":"bg-amber-400"`), แท็ก `#...`, ครบกำหนด `expires_at`, สถานะ challenged (⚔️) / retired (จาง opacity-60)
- **ความเชื่อมั่นลดลงตามเวลา** — กลไก exact (สูตร decay): **หาไม่เจอใน client** (อยู่ฝั่ง backend) — client เห็นแค่ `confidence` ที่คำนวณมาแล้ว + `expires_at`; คำโปรย (ดิบ): `brMemoryDesc = จำเฉพาะข้อสรุปที่รอดจากการโจมตี ความเชื่อมั่นลดลงตามเวลาและถูกท้าทายซ้ำได้เสมอ`
- **"ถูกท้าทายซ้ำ" ในทางกลไก** = status เปลี่ยนเป็น `challenged` (memory + knowledge มีสถานะนี้) — เกิดจากรอบโต้แย้ง/ตรวจสอบของที่ประชุม; memory ที่ถูกท้าทายยังโผล่ใน filter "ถูกท้าทาย" และถูกฉีดกลับเข้า snapshot (`snapshot.memory` — client อ่านเป็น ref chips M{label})

### boardroom_knowledge — หน้า /boardroom/knowledge (ดิบ select):

```
boardroom_knowledge.select("*",{count:"exact"}).in("status",["active","challenged"]/["challenged"]/["superseded"]/["retired"]/null)
  .order("created_at",{ascending:!1}).order("id",{ascending:!1}).range(20t,20t+19)
```

- ฟิลด์ (component RI ดิบ): `id, title, statement, status` (active/challenged/superseded/retired), `source_type` (web_research/model), `source_ref`, `as_of`, `category`, `votes{by:[{seat_id,adopt,reason}], ceo}`, `supersedes`, `superseded_by`, `created_at` — การ์ดแสดง "⇄ แทนที่ #Kx" / "ถูกแทนโดย → #Ky" / ถูกท้าทาย ⚔️ / stale ⏳
- **เกณฑ์ "อาจล้าสมัย" ตามหมวด** (ดิบ — วัน):

```
let b={policy:60,rates:60,flows:14,positioning:14,macro_data:45,ratings:365,liquidity:30,earnings:90,geopolitics:45,other:90}
// stale ถ้า (now - as_of) > b[category] วัน — ดิบ: (Date.now()-a)/864e5>(null!=(t=b[e.category])?t:90)
```

- **การฉีดเข้าประชุม**: i18n ดิบ `brKbDesc = ข้อเท็จจริงภายนอกที่ที่ประชุมลงมติรับ — ฉีดกลับเข้าประชุมรอบถัดไปเป็น K1..K8 ท้าทาย/แทนที่ได้เมื่อล้าสมัย` → ฉีดผ่าน `snapshot.knowledge.items` (ref chips K{label}); `brKbEnableLabel = คลังความรู้กลาง (เสนอ + โหวตข้อมูลภายนอก)` — ปิดได้กลางคันไม่กระทบประชุมที่วิ่ง
- **การลงมติรับความรู้**: proposal มี `votes{by:[seat_id, adopt, reason], adopt, reject}` + `ceo_adopt` (ประธานชี้ขาด) — adopted → เข้าคลัง, dup_of → "ซ้ำกับ Kx", reject → ไม่รับ
- Admin: `retire_knowledge` / `restore_knowledge` (brKbRetireConfirm: "ปลดระวางความรู้ข้อนี้? มันจะไม่ถูกฉีดเข้าประชุมอีก (กู้คืนได้ภายหลัง)")

---

## 8) สถิติความแม่นยำรายที่นั่ง — วัดจากอะไร

### ข้อมูล (หน้า /boardroom/stats ดิบ — 5 query ขนาน):

```
boardroom_seats.select("*").order("sort")
boardroom_seat_stats.select("*")                              // ต่อที่นั่ง
boardroom_seat_model_stats.select("*")                        // ต่อ (ที่นั่ง, โมเดล)
boardroom_meetings.select("id, agenda, ended_at, resolution_json").eq("status","completed").limit(20)
boardroom_meetings.select("tokens_in, trigger_type, created_at, stances:resolution_json->stances, outcome_h:resolution_json->outcome->h->results").eq("status","completed").limit(120)
```

- **seat_stats**: `seat_id, meetings, claims_total, claims_verified, stances_total, stances_correct` — คอลัมน์ตาราง: ประชุม / claim ผ่านพิสูจน์ % / ทิศทางถูก % (ดิบ `n.claims_verified/n.claims_total*100`, `n.stances_correct/n.stances_total*100`)
- **seat_model_stats**: `seat_id, model, stances_total, stances_correct` — "โมเดลปัจจุบันถูก" นับเฉพาะ stance ที่โมเดลปัจจุบันพูด (brModelAccuracyTip ดิบ)
- **advisory flag**: `i<45 && stances_total>=50` → ป้าย "⚠️ advisory" (brAdvisoryTip: "ความแม่นรวม <45% บนฐาน ≥50 ครั้ง — ประธานถูกกำชับให้ลดน้ำหนักมุมมองที่นั่งนี้")

### ตัดสินถูก/ผิด (win/loss/push) — module 7317/18551 ดิบ:

```
function d(e,t,s,n){return null==e||null==t?"unknown":e?"win":Math.abs(t)<("bp"===s?4:.5)*Math.sqrt(Math.max(1,null!=n?n:1)/3)?"push":"loss"}
```

- `correct=true` → win; `correct=false` และ |change_pct| < เกณฑ์ (bp: 4bp / pct: 0.5%) × √(horizon_days/3) → **push** (เสมอ — ไม่นับเข้า win rate); เกินเกณฑ์ → loss
- หน่วย/ประเภทสินทรัพย์ (ดิบ):

```
let n=/^(US|TH|JP|VN|FR|EA)\d{1,3}[YW]$/,l=new Set(["US_HY_SPREAD","US_IG_SPREAD","US_SOFR_EFFR_SPREAD","FR_OAT_BUND_SPREAD","LA_MOFL_SPREAD"]);
function a(e){let t=e.toUpperCase();return l.has(t)?"spread_bps":n.test(t)?"yield_pct":"price"}
```

- ราคาอ้างอิง + กรอบเวลา (ดิบ i18n): `brPredDesc = ...ตัดสินถูก/ผิดด้วยราคาจริง ณ วันครบกำหนด (ราคาอ้างอิง = สแนปช็อตตอนเปิดประชุม วันหยุดใช้ราคาปิดล่าสุด) ส่วน 1/3/7 วันคือจุดตรวจระหว่างทาง`; horizon = สั้น 1-7 / กลาง 8-30 / ยาว 31-90 วัน

### Tile สรุป (P54-style KPIs) — ดิบ:

- win rate: สัญญาณ (qualified) vs มุมมอง (non-qualified) — `!1===e.qualified?t.view:t.sig`; เกณฑ์ "มุมมอง" (brSigViewsDesc ดิบ): "stance ที่ความมั่นใจ <60 หรือมีนักวิเคราะห์หนุนอิสระ <2 คนตอนรอบวิเคราะห์อิสระ"
- tokens เข้า/นัด 7 วัน vs 7 วันก่อนหน้า — เป้า `<800k` (brTileTokensTip ดิบ)
- จำนวนนัดแยกตาม trigger_type 7 วัน (model/news/manual)

---

## 9) UI/UX — ดูสดแบบไหน

**ไม่ใช่ real-time streaming — เป็น polling + แอนิเมชันจำลอง:**

| หน้า | refresh (ดิบ) |
|---|---|
| /boardroom (รายการ) | `refreshMs:1e4` = ทุก 10 วินาที |
| /boardroom/[id] (ประชุม) | `refreshMs:3e3` = ทุก 3 วินาที |
| /boardroom/stats | `refreshMs:6e4` = ทุก 60 วินาที |
| /boardroom/signals | `refreshMs:9e4` = ทุก 90 วินาที |

- **เอฟเฟกต์พิมพ์ (typewriter)** เฉพาะข้อความล่าสุดระหว่าง running — ดิบ: `setInterval(()=>{a(s=>s>=t.length?(clearInterval(e),s):s+4)},28)` (4 ตัวอักษร/28ms) + จุด "กำลังพูด..." (brSpeaking) + `typing-dot` 3 จุดใต้บทสนทนา
- **auto-scroll** เมื่อมีข้อความใหม่ (ดิบ: `scrollIntoView({behavior:"smooth",block:"nearest"})`)
- **2 โหมดดูบทสนทนา**: `reader` (โหมดอ่านง่าย — markdown + ref chips + การ์ดหลักฐาน) / `data` (โหมดข้อมูลดิบ — kind · phase · model_used · tokens) — จำไว้ใน `localStorage["bcd-boardroom-view"]`; signals มี full/compact (`bcd-brsig-view`)
- **สถานะ 4 แบบ** (badge สี — ดิบ): running "กำลังประชุม" (accent pulse) / completed "เสร็จสิ้น" (เขียว) / failed "ล้มเหลว" (แดง + แสดง `error` + ปุ่ม "ประชุมต่อ" สำหรับ admin) / cancelled "ยกเลิก" (จาง) — ดิบ: `{running:{...},completed:{...},failed:{...},cancelled:{...}}[e.status]`
- **การ์ดรายการ**: badge สถานะ + ป้าย trigger + เวลา + agenda (line-clamp-2) + จุดยืน long/short สูงสุด 4 ตัว (`stances.filter(long/short).slice(0,4)`)
- **การ์ดประชุมสด** (ถ้ามี running): "กำลังประชุมสด" + agenda + `brCalls: <llm_calls>` → คลิกเข้าดูสด
- **หัวข้อประชุม**: agenda + สถานะ + `เรียก AI: <llm_calls> · tokens <in> / <out>` (toLocaleString) + pulse dot เมื่อ running
- **stepper เฟส**: pills เรียงตามเฟส (เฟสเสริมซ่อนถ้าไม่มีใน turn_plan), เฟสปัจจุบัน ring + pulse, เฟสผ่านแล้ว accent, เสร็จแล้วชี้ที่ resolution
- **การเปิดประชุม**: textarea วาระ (max 2,000) + ปุ่ม "เปิดประชุม" ("กำลังรีเฟรชข้อมูลและเปิดประชุม..." ขณะทำงาน) → 409 redirect กรณีมีประชุมซ้อน (brMeetingRunning "มีการประชุมกำลังดำเนินอยู่ — ต้องรอให้จบก่อน")
- **บทสนทนา 1 ข้อความ**: อวตารตำแหน่ง (ไอคอน+สีประจำตำแหน่ง) + ชื่อ + บทบาท + kind/phase (data mode) + model_used + เนื้อหา markdown + **การ์ด evidence** (claims badges ผ่าน/ขัด/ตรวจไม่ได้ + stance badge + reviews รับรอง + proposals 📚 + fact_votes + data_requests 🔎 + verify results + substitution "⚠️ ใช้โมเดลสำรอง: provider/model") + tokens
- **ข้อความข้าม** (status=skipped): "รอบค้นตัวเลขถูกข้าม — ไม่มีคำขอข้อมูลที่ผ่านเกณฑ์ในการประชุมนี้" (research2) / "รอบตรวจสอบถูกข้าม — แมวมองไม่พบตัวเลขให้ตรวจสอบ" (verify) / "ข้ามเทิร์นนี้" (generic); status=error: "⚠️ เรียกโมเดลไม่สำเร็จ — ข้ามที่นั่งนี้"
- **ข้อความพิเศษ**: บรรทัด `ท้าทายวาระ:`/`ท้าทาย:` ถูกแปลงเป็น blockquote ⚠️/⚔️
- **หน้าย่อย 6**: signals / memory / knowledge / data-gaps / stats / settings (ไอคอนมุมขวาบนของ /boardroom)
- **⚠️ ต้นฉบับหน้า boardroom ไม่มี disclaimer** — ค้น "disclaimer|คำแนะนำ" ใน chunk boardroom ทั้งหมด = 0 hits; คีย์ `disclaimer:"ข้อมูลเพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำการลงทุน"` เป็น global ของแอป (ใช้หน้า CME/อื่น) — แผนเราหลักการข้อ 3 บังคับมี disclaimer → **ต้องเพิ่มเองในการออกแบบ (ticket 07)**

---

## 10) copy ไทยทุกคีย์ `br*` — ครบทั้งบล็อก

คัดออกจาก `3474-e1aec38ee927d485.js` (บล็อก th + en) 590 คีย์ บันทึกเต็มที่ **`.scratch/boardroom/dig/i18n-br-th.txt`** — ใช้ตรงๆ ใน ticket 07 ตัวอย่างหัวข้อหลัก (ดิบ):

```
boardroomTitle = ห้องประชุม AI
boardroomSubtitle = ทีม AI หลายโมเดลหลายค่ายโต้แย้งกันเพื่อหาความจริง — ยอมรับเฉพาะข้อสรุปที่ผ่านการพิสูจน์ด้วยหลักฐาน
brLive = กำลังประชุมสด / brArchive = การประชุมย้อนหลัง
brOpenMeeting = เปิดประชุม / brStarting = กำลังรีเฟรชข้อมูลและเปิดประชุม...
brPhaseOpening = เปิดวาระ / brPhaseResearch = วิจัยภายนอก / brPhaseBriefing = นำเสนอ / brPhaseDebate = โต้แย้ง / brPhaseVerification = ตรวจสอบ / brPhaseEvidence = หาหลักฐานเพิ่ม / brPhaseExternalData = ตรวจตัวเลขภายนอก / brPhaseResolution = ลงมติ
brStatusRunning = กำลังประชุม / brStatusCompleted = เสร็จสิ้น / brStatusFailed = ล้มเหลว / brStatusCancelled = ยกเลิก
brResume = ประชุมต่อ / brResuming = กำลังเปิดต่อ…
brResolution = มติที่ประชุม / brByJames = สรุปโดย เจมส์ (CEO) จากข้อสรุปที่ผ่านการพิสูจน์เท่านั้น
brPlainProven = ข้อสรุปที่พิสูจน์แล้ว / brPlainUnproven = ข้อที่ยังฟันธงไม่ได้ / brPlainWatch = จับตา / brPlainOutlook = คาดการณ์อนาคต / brFullAnalysis = ฉบับวิเคราะห์เต็ม (มีอ้างอิง)
brStances = จุดยืนรายสินทรัพย์ / brWatchlist = สิ่งที่ต้องจับตา / brVerification = ผลตรวจสอบข้อกล่าวอ้าง
brClaimVerified = ผ่านการพิสูจน์ / brClaimFailed = ขัดกับข้อมูลจริง / brClaimUnverified = ตรวจไม่ได้
brMemoryTitle = สมองส่วนกลาง — ความรู้ที่พิสูจน์แล้ว / brMemoryDesc = จำเฉพาะข้อสรุปที่รอดจากการโจมตี ความเชื่อมั่นลดลงตามเวลาและถูกท้าทายซ้ำได้เสมอ
brScoreboard = สถิติความแม่นยำรายที่นั่ง / brSeats = ที่นั่งในห้องประชุม / brTranscript = บทสนทนาการประชุม
brTriggerManual = เปิดโดยแอดมิน / brTriggerNews = เปิดจากข่าว / brTriggerModel = เปิดจากโมเดลขยับ / brTriggerCalendar = เปิดจากข่าวแดง
brKbTitle = คลังความรู้กลาง / brKbDesc = ข้อเท็จจริงภายนอกที่ที่ประชุมลงมติรับ — ฉีดกลับเข้าประชุมรอบถัดไปเป็น K1..K8 ท้าทาย/แทนที่ได้เมื่อล้าสมัย
brDataGapsTitle = ช่องว่างข้อมูล — ตัวเลขที่ที่ประชุมเคยขอ
brSettingsTitle = ตั้งค่าห้องประชุม / brSeatsConfig = ที่นั่ง + โมเดล / brTriggerSection = เปิดวาระอัตโนมัติ (Trigger Engine)
```

---

## ข้อสรุปป้อน ticket อื่น

- **02 (ที่นั่ง/เฟส)**: 8 ตำแหน่ง + บทบาท + layout ครบ (หัวข้อ 2); 8 phase keys + เฟสเสริม 3 ตัว (หัวข้อ 3); ลำดับเทิร์นจริงต้องออกแบบเอง (หาไม่เจอ)
- **04 (ตรวจสอบข้อกล่าวอ้าง)**: claims/reviews/verdict 3 ค่า + เกณฑ์ "reviewed≥2 && supported ทั้งหมด" (module 95090 C fn — ดิบในหัวข้อ 1/ref); external_data 2/2 match (brVerifiedDataHint); เกณฑ์เทียบตัวเลข ±2%/±5% (module 95090 `a` fn ดิบ: `a<=Math.max(.02*Math.abs(s),.02)?"match":a>Math.max(.05*Math.abs(s),.05)?"mismatch":"incomparable"`)
- **05 (สมองส่วนกลาง/scoreboard)**: โครงสร้าง memory/knowledge + เกณฑ์ stale รายหมวด + win/loss/push สูตร + qualified/view + advisory — ครบ (หัวข้อ 7, 8); **สูตร decay ความเชื่อมั่น: หาไม่เจอ — ต้องออกแบบเอง**
- **07 (frontend)**: copy ไทยครบใน `i18n-br-th.txt`; layout/โหมด reader-data/typewriter/polling 3s/stepper/การ์ด evidence ครบ (หัวข้อ 9); **ต้องเพิ่ม disclaimer เอง (ต้นฉบับไม่มี)**
- **แผน boardroom-signals (Waiting on ปลดได้)**: `resolution_json.stances[]` (asset/stance/confidence/horizon/horizon_days/price_at/due_at/consensus/reason/qualified) + `outcome.h/d1/d3/d7.results[]` (array ขนาน) + แหล่งราคาสด `market_prices` (symbol/price/candles/recorded_at/quote_at) + `macro_series` (series_id/value) — โครงสร้างครบในหัวข้อ 1; เกณฑ์ "มุมมองไม่เข้าบัญชี" = `qualified:false` (conf<60 หรือหนุนอิสระ<2)
- **Cross-cutting**: ต้นฉบับเป็น multi-provider (6 ค่าย, fallback claude-sonnet-5) — แผนเราใช้ DeepSeek ตัวเดียวหลายบุคลิก (map ตัดสินแล้ว) → settings page ของเราตัดทิ้ง/ลดรูปได้; `llm_calls/tokens_in/tokens_out` เก็บทุกครั้ง (หัวข้อหลักการ 4) — เห็น pattern ครบทั้ง meetings + messages รายเทิร์น
