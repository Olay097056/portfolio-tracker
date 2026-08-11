# 01 - Research: ขุดหน้า /boardroom ของต้นฉบับ

Type: research
Status: closed
Claimed: hermes/2026-08-09
Blocked by: —

## Question

หน้า `/boardroom` ทำงานยังไงในรายละเอียด — พอที่ ticket 02 (ออกแบบที่นั่ง/เฟส), 04 (ตรวจสอบข้อกล่าวอ้าง), 05 (สมองส่วนกลาง), 07 (frontend) จะตัดสินได้โดยไม่ต้องเดา

## วิธีทำ — ไม่ต้อง login

ยืนยันแล้วว่าเปิดสาธารณะ (ตรวจเมื่อ 2026-08-09) **ห้ามพยายามสมัครบัญชีหรือกรอกรหัสผ่าน**

```js
// ใน browser console ที่ origin ของเว็บนั้น
const html = await (await fetch('/boardroom')).text();
html.match(/\/_next\/static\/chunks\/app\/[^"'\s)]+\.js/g)
```

- **route chunk**: `/_next/static/chunks/app/boardroom/page-51e536c4d27fa7dd.js` (7,749 B)
- **copy ไทย**: `/_next/static/chunks/3474-e1aec38ee927d485.js` (98 KB) — ค้น `boardroomTitle` แล้วอ่านบล็อกรอบๆ (คีย์ขึ้นต้น `br*`)

**กติกาบังคับ:** ทุกข้อที่ตอบต้องแนบ**ข้อความดิบ**คัดลอกตรงจากไฟล์ + URL chunk — ข้อไหนหาไม่เจอเขียน "หาไม่เจอ" ห้ามเดาให้ครบ (บทเรียนจาก ticket 01 ของแผน forecast-tab ที่ทำถูกต้องแบบนี้)

## สิ่งที่ต้องได้กลับมา

1. **`resolution_json` โครงสร้างเต็ม** — สำคัญที่สุด เพราะแผน `boardroom-signals` รออันนี้อยู่ (cross-map): จุดยืนรายสินทรัพย์เก็บ field อะไรบ้าง (asset, stance, ทิศทาง, ราคาเข้า, กำหนดครบ, เหตุผล?), ข้อสรุปที่พิสูจน์แล้ว/ยังฟันธงไม่ได้/จับตา/คาดการณ์ เก็บยังไง, ผลตรวจสอบข้อกล่าวอ้างเก็บยังไง
2. **ที่นั่งในห้องประชุม** — มีกี่ที่นั่ง ชื่ออะไร บทบาทอะไร ("เจมส์ (CEO)" คือคนสรุป — มีใครอีก) แต่ละที่นั่งผูกกับโมเดลค่ายไหนในต้นฉบับ
3. **`turn_plan` หน้าตายังไง** — แต่ละเฟสมีกี่เทิร์น ใครพูดลำดับไหน เปลี่ยนเฟสเมื่อไหร่
4. **เฟส "วิจัยภายนอก" ดึงอะไร** — web search? API อะไร? หรือแค่ข้อมูลในระบบเขาเอง (ป้อนเข้าหมอกข้อ "วิจัยภายนอกเอาข้อมูลจากไหน")
5. **`functions/v1/boardroom-start`** — edge function รับ payload อะไร (เห็นชื่อแล้วจาก chunk แต่ยังไม่รู้ signature)
6. **trigger 4 แบบทำงานยังไง** — เกณฑ์อัตโนมัติคืออะไร (ข่าว impact เท่าไหร่? โมเดลขยับกี่จุด? "ข่าวแดง" คือปฏิทินอะไร)
7. **สมองส่วนกลาง** — เก็บอะไร ความเชื่อมั่นลดยังไงตามเวลา "ถูกท้าทายซ้ำ" หมายถึงอะไรในทางกลไก
8. **สถิติความแม่นยำรายที่นั่ง** — วัดจากอะไร ใครถูก/ผิดตัดสินยังไง
9. **UI/UX** — ดูสดแบบ streaming ไหม แสดงเทิร์นทีละอันหรือรอจบ layout เป็นยังไง
10. **copy ไทยทุกคีย์ `br*`** — คัดมาทั้งบล็อก (ใช้ตรงๆ ใน ticket 07)

## Answer

ขุดจาก JS bundle สาธารณะ 10 chunks โหลดสด HTTP 200 เมื่อ 2026-08-09 (บันทึกที่ `.scratch/boardroom/dig/` — route chunk + [id] page + shared 7317 + i18n 3474 + settings/stats/memory/knowledge/data-gaps/signals) — หลักฐานดิบ + คำตอบครบ 10 ข้ออยู่ใน **`docs/research/boardroom-page-2026-08-09.md`**

สรุปช็อต:

1. **`resolution_json` โครงสร้างเต็ม (ปลด Waiting on boardroom-signals ได้)** — `plain{summary,proven,unproven,watch,outlook}` + `claim_summary{verified,failed,unverified}` + `premise_risk` + `stances[{asset,stance(4 ค่า),consensus(unanimous/contested),confidence,horizon,horizon_days,price_at,due_at,reason,qualified}]` + `watchlist[]` + `verification[{claim,verdict}]` + `perspectives[]` + `knowledge{proposals[K1.., votes{by[],adopt,reject}, ceo_adopt],reaffirmed,retired}` + `external_data{requests[{metric,requested_by}],items[V1..{value,status,matches,verdicts,origin}]}` + `room_view{news_read,summary,forecasts[{event,consensus,previous,expected,view(4 ค่า),scored_at,actual,correct,due_at}]}` + `outcome{h/d1/d3/d7: {results[]}}` — **`outcome[horizon].results[i]` ขนานกับ `stances[i]`** (ดิบ `e.forEach((e,s)=>{let l=n[s]...})`)
2. **ที่นั่ง 8 ตำแหน่ง** — ceo (ประธาน/คนสรุป), research (แมวมอง), challenger, macro, technical, quant, news, conspiracy — ตาราง `boardroom_seats{seat_id,position_key,provider,model,name_th,name_en,enabled,sort}`; 6 ค่ายโมเดล (anthropic/openai/gemini/deepseek/openrouter/glm) fallback claude-sonnet-5
3. **`turn_plan`** = `{turns:[{phase,seat,...}],current_turn}` — client อ่านแค่นี้; 8 phase keys `opening→research→briefing→debate→verification→evidence→external_data→resolution` (evidence/research/external_data เป็นเฟสเสริม); **จำนวนเทิร์น/ลำดับ: หาไม่เจอ (server-side)**
4. **วิจัยภายนอก** = แมวมองค้นเว็บสดก่อนอภิปราย → `snapshot.research.items[{id R1..,type 5 แบบ,fact,url,source}]`; ตัวเลขภายนอกใช้ Trading Economics (โควตา 500/เดือน) + FRED/NY Fed/Yahoo/CFTC mapping; **API ค้นจริง: หาไม่เจอ (server-side)**
5. **`boardroom-start`**: `POST {agenda}` (max 2,000) → `{meeting_id}` redirect, 409+`{meeting_id}` = มีประชุมซ้อน; อีก 3 function: `boardroom-orchestrate{meeting_id}` (client เรียกซ้ำเมื่อ claim_until หมด + updated_at>8s + ไม่ซ้ำ 15s), `boardroom-admin{action: get_config/set_api_key/test_key/list_models/delete_api_key/set_seat/set_settings/cancel_meeting/clear_memory/resume_meeting/retire_knowledge/restore_knowledge/analyze_data_gap}`, `boardroom-trigger{}` (ทดสอบ)
6. **Trigger 4 แบบ** = manual/news/model/calendar; knobs settings: `news_impact_min(10-100), news_batch_hours(1-24, default 6), model_delta_min(2-50, 6 ชม.), calendar_countries(CSV สกุลเงิน), cooldown_minutes(10-1440), daily_cap(0-12)`; **เกณฑ์ข้างในจริง: หาไม่เจอ (server-side)**
7. **สมองส่วนกลาง** = ตาราง `boardroom_memory{statement_md,confidence,status(active/challenged/retired),tags,source_meeting_id,created_at,expires_at}` เรียง confidence; คลังความรู้ `boardroom_knowledge{title,statement,status(+superseded),source_type,as_of,category,votes,supersedes}` + เกณฑ์ stale รายหมวด 14-365 วัน; **สูตร decay ความเชื่อมั่น: หาไม่เจอ (server-side)**
8. **สถิติรายที่นั่ง** = `boardroom_seat_stats{meetings,claims_total,claims_verified,stances_total,stances_correct}` + `boardroom_seat_model_stats{model,...}`; win/loss/push สูตรดิบ `e?"win":|change|<(bp?4:.5)*√(days/3)?"push":"loss"`; ราคาอ้างอิง = สแนปช็อตตอนเปิดประชุม, วันหยุดใช้ราคาปิดล่าสุด; qualified=false = "มุมมอง" ไม่เข้าบัญชี (conf<60 หรือหนุนอิสระ<2); advisory ถ้า <45% ฐาน ≥50 ครั้ง
9. **UI/UX** = polling (รายการ 10s / detail 3s / stats 60s / signals 90s) + typewriter เฉพาะข้อความล่าสุด (4 ตัว/28ms) + auto-scroll + โหมด reader/data (localStorage) + stepper เฟส + การ์ด evidence ครบ + สถานะ 4 แบบ + ปุ่ม resume เมื่อ failed; **⚠️ ต้นฉบับไม่มี disclaimer ในหน้า boardroom — ต้องเพิ่มเอง (แผนหลักการข้อ 3)**
10. **copy ไทย `br*` ครบ 590 คีย์ (ไทย+อังกฤษ)** → `.scratch/boardroom/dig/i18n-br-th.txt` — ใช้ตรงๆ ใน ticket 07

ข้อสรุปป้อน ticket: 02/04/05/07 ครบ + ปลด `Waiting on` แผน boardroom-signals (stances + outcome + แหล่งราคา `market_prices{price,candles,quote_at}` / `macro_series{value}`) — รายละเอียด+ดิบทุกข้อใน doc

**ห้ามแตะโค้ด production** — ticket นี้เป็น `research` ผลลัพธ์คือเอกสารอย่างเดียว
