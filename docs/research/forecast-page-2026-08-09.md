# Forecast page (จำลองสถานการณ์) — reverse-engineered 2026-08-09

Result of wayfinder ticket **01 - Research: ขุดหน้า /forecast ของต้นฉบับ**.

## หลักฐานดิบ (raw evidence)

- **URL chunk ที่โหลด:** `https://bond-crisis-dashboard-v2.vercel.app/_next/static/chunks/app/forecast/page-13d84abe72938506.js`
- **ผลโหลดจริง:** HTTP 200, **10,641 bytes** (โหลดสดใหม่ 2026-08-09 — หน้า /forecast เอง login-gated แต่ route chunk สาธารณะ)
- ข้อความดิบทั้งหมดด้านล่างคัดลอกตรงจากไฟล์ `forecast-page-fresh.js` (บันทึกที่ temp research dir)

### 1) State object เริ่มต้น + fallback base — ข้อความดิบ:

```
let o={fedBps:0,oilPct:0,vixPts:0,hyBps:0,cpiPts:0,goldPct:0,depositPct:0,dwBillion:0,sofrSpreadBps:0,debtPts:0,auctionBtc:2.5},x=e=>Math.min(1,Math.max(0,e));
```

```
function h(e,t){var s,a,n,i,l,d;let r=(null!=(s=e.get("us10y"))?s:4.2)+t.fedBps/100*.5,c=(null!=(a=e.get("us2y"))?a:3.8)+t.fedBps/100,m=Math.max(9,(null!=(n=e.get("vix"))?n:18)+t.vixPts),o=(null!=(i=e.get("usoil"))?i:70)*(1+t.oilPct/100),h=Math.max(150,(null!=(l=e.get("us_hy_spread"))?l:300)+t.hyBps),u=(null!=(d=e.get("us_cpi_yoy"))?d:3)+t.cpiPts,p=t.goldPct,f=Math.max(0,-t.depositPct),b=Math.max(0,t.dwBillion),y=Math.max(0,t.sofrSpreadBps),g=Math.max(0,t.debtPts),k=x((2.4-t.auctionBtc)/.6);
```

### 2) Slider config ทั้ง 11 ตัว — ข้อความดิบ (ตัดจาก array หน้าตาเดียวกันทุกตัว):

```
[{key:"fedBps",label:"th"===t?"Fed ขึ้น/ลดดอกเบี้ย":"Fed rate change",min:-200,max:200,step:25,unit:"bps",signed:!0},
{key:"oilPct",label:"th"===t?"ราคาน้ำมันเปลี่ยน":"Oil price change",min:-40,max:60,step:5,unit:"%",signed:!0},
{key:"goldPct",label:"th"===t?"ราคาทองคำเปลี่ยน":"Gold price change",min:-20,max:40,step:5,unit:"%",signed:!0},
{key:"vixPts",label:"th"===t?"VIX เปลี่ยน":"VIX change",min:-10,max:30,step:1,unit:"pts",signed:!0},
{key:"hyBps",label:"th"===t?"HY Spread เปลี่ยน":"HY spread change",min:-100,max:400,step:25,unit:"bps",signed:!0},
{key:"cpiPts",label:"th"===t?"เงินเฟ้อ CPI เปลี่ยน":"CPI change",min:-2,max:3,step:.25,unit:"pt",signed:!0},
{key:"depositPct",label:"th"===t?"เงินฝากแบงก์ (2 สัปดาห์)":"Bank deposits (2w)",min:-3,max:1,step:.25,unit:"%",signed:!0},
{key:"dwBillion",label:"th"===t?"Fed Discount Window พุ่ง":"Discount window jump",min:0,max:100,step:5,unit:"$B",signed:!0},
{key:"sofrSpreadBps",label:"th"===t?"SOFR-EFFR spread (repo ตึง)":"SOFR-EFFR spread",min:0,max:100,step:5,unit:"bps",signed:!0},
{key:"debtPts",label:"th"===t?"หนี้สหรัฐต่อ GDP เพิ่ม":"US debt-to-GDP shift",min:0,max:20,step:1,unit:"pt",signed:!0},
{key:"auctionBtc",label:"th"===t?"ประมูล 10Y Bid-to-Cover":"10Y auction bid-to-cover",min:1.8,max:3.2,step:.1,unit:"x"}]
```

### 3) วิธีป้อนค่า (slider ล้วน) — ข้อความดิบ:

```
(0,a.jsx)("input",{type:"range",min:n,max:i,step:l,value:y[t],onChange:e=>g({...y,[t]:Number(e.target.value)}),className:"mt-1.5 w-full accent-sky-400"}
```

### 4) สูตร h() ต่อโมเดล (delta ของแต่ละโมเดล) — ข้อความดิบ:

```
return{"recovery-reflation":(x((18-m)/6)-.5)*24+(x((350-h)/150)-.5)*20+10*x(-t.fedBps/100)-5*Math.max(0,u-3)-.15*Math.max(0,p)-4*f-.08*y-6*k,
"inflation-oil":(x((o-75)/20)-.3)*30+8*Math.max(0,u-2.5)+4*(t.fedBps>0)-.4*Math.max(0,-t.oilPct)+.1*Math.max(0,p)+.3*g,
"fed-pivot":28*x(-t.fedBps/150)-7*Math.max(0,u-3)-4*Math.max(0,t.fedBps/50)+.25*Math.max(0,p),
"yield-shock":22*Math.max(0,r-4.2)+12*Math.max(0,t.fedBps/100)+5*Math.max(0,u-3.5)-10*Math.max(0,-t.fedBps/100)+.8*g+18*k,
"credit-panic":1.6*Math.max(0,(h-320)/10)+1.5*Math.max(0,m-22)+8*Math.max(0,r-4.6)+.2*Math.max(0,p)+5*f+.12*b+.15*y+.3*g+8*k,
"bank-run":1.2*Math.max(0,(h-320)/15)+1.2*Math.max(0,m-22)+6*Math.max(0,c-4.5)+6*Math.max(0,t.fedBps/100)+.2*Math.max(0,p)+12*f+.35*b+.4*y}
```

### 5) การคำนวณ simulated + sort — ข้อความดิบ:

```
v=(0,n.useMemo)(()=>s?function(e,t,s){let a=h(t,s),n=h(t,o);return e.map(e=>{var t,s;return{...e,simulated:Math.min(100,Math.max(0,Number(e.score)+((null!=(t=a[e.model_id])?t:0)-(null!=(s=n[e.model_id])?s:0))))}}).sort((e,t)=>t.simulated-e.simulated)}(s.models,N,y):[],[s,N,y])
```

### 6) Base series fetch list (7 ตัว, dxy ประกาศแต่ไม่ใช้ใน h()) — ข้อความดิบ:

```
let p=["us10y","us2y","vix","usoil","us_hy_spread","us_cpi_yoy","dxy"];
```

### 7) Missing-base warning + disclaimer — ข้อความดิบ:

```
M.length>0&&(0,a.jsxs)("p",{className:"-mt-3 text-xs text-amber-300",children:["⚠️ ",e.forecastMissingBase," ",(0,a.jsx)("span",{className:"num",children:M.join(", ")})," — ",e.forecastMissingBaseDesc]}
```

```
children:"th"===t?"การจำลองเป็นค่าประมาณทิศทางจากตรรกะเดียวกับ scoring engine (แบบย่อ) — ไม่ใช่ผลการคำนวณเต็มรูปแบบ":"Simulation approximates the scoring engine's directional logic (simplified) — not a full recomputation"
```

### 8) Delta + double progress bar + activate/deactivate — ข้อความดิบ:

```
l=s.simulated-Number(s.score),d=k===s.model_id,o=e=>e>=60?2:+(e>=40),x=o(Number(s.score)),h=o(s.simulated),p=0===x&&h>0
```

```
(0,a.jsx)("div",{className:"absolute inset-y-0 left-0 rounded-full bg-slate-600/60",style:{width:"".concat(s.score,"%")}}),(0,a.jsx)("div",{className:"absolute inset-y-0 left-0 rounded-full ".concat(l>=0?"bg-accent":"bg-orange-400"),style:{width:"".concat(s.simulated,"%"),opacity:.85}})
```

```
(0,a.jsxs)("span",{className:"ml-2 ".concat(l>.5?"text-emerald-400":l<-.5?"text-red-400":"text-ink-faint"),children:[l>0?"+":"",(0,c._E)(l,1)]})
```

```
p&&(0,a.jsx)("p",{className:"mb-2 text-xs font-medium text-accent",children:e.scenarioActivates}),x>0&&0===h&&(0,a.jsx)("p",{className:"mb-2 text-xs font-medium text-orange-400",children:e.scenarioDeactivates})
```

### 9) ชื่อโมเดลย่อไทย (L6 จาก registry chunk `7362-4aa258e42d947c01.js`) — ข้อความดิบ:

```
let r={"recovery-reflation":{id:"recovery-reflation",nameEn:"Recovery / Reflation Model",nameTh:"โมเดลฟื้นตัว / รีเฟลชัน",shortEn:"Recovery",shortTh:"ฟื้นตัว",...}
```

### 10) i18n ไทย (จาก chunk `3474-e1aec38ee927d485.js`) — ข้อความดิบ:

```
countries:"รายประเทศ",forecast:"จำลองสถานการณ์",backtest:"ผลทดสอบย้อนหลัง",
whatIf:"ปรับสถานการณ์สมมติ",forecastDesc:"จำลองผลกระทบต่อคะแนนโมเดลเมื่อตัวแปรสำคัญเปลี่ยน",forecastMissingBase:"ไม่มีค่าฐานสดของ",forecastMissingBaseDesc:"ใช้ค่ากลางแทน — ความไวของผลจำลองส่วนนั้นเป็นค่าประมาณ",
scenarioActivates:"ถ้าเกิดสถานการณ์นี้ โมเดลจะเริ่มพิจารณาสัญญาณเหล่านี้",scenarioDeactivates:"ถ้าเกิดสถานการณ์นี้ โมเดลจะต่ำกว่าเกณฑ์ก่อตัวและหยุดพิจารณาสัญญาณใหม่",
relatedAssets:"สินทรัพย์ที่เกี่ยวข้อง",thresholdActive:"เกณฑ์ทำงาน (60)"
```

---

## สรุปสิ่งที่ค้นพบ (จากหลักฐานดิบข้างต้น)

หน้าเป็น **what-if slider panel**: 11 ตัวแปร (slider ล้วน) → คำนวณคะแนนจำลอง client-side ด้วยฟังก์ชัน `h(state)` (ฝังเต็มใน bundle) แล้วเทียบ delta กับค่าปัจจุบัน

**ตัวแปร 11 ตัว (key / ไทย / min-max-step / unit):** fedBps (Fed ขึ้น/ลดดอกเบี้ย, −200..200/25, bps), oilPct (ราคาน้ำมันเปลี่ยน, −40..60/5, %), goldPct (ราคาทองคำเปลี่ยน, −20..40/5, %), vixPts (VIX เปลี่ยน, −10..30/1, pts), hyBps (HY Spread เปลี่ยน, −100..400/25, bps), cpiPts (เงินเฟ้อ CPI เปลี่ยน, −2..3/.25, pt), depositPct (เงินฝากแบงก์ 2 สัปดาห์, −3..1/.25, %), dwBillion (Fed Discount Window พุ่ง, 0..100/5, $B), sofrSpreadBps (SOFR-EFFR spread, 0..100/5, bps), debtPts (หนี้สหรัฐ/GDP เพิ่ม, 0..20/1, pt), auctionBtc (ประมูล 10Y Bid-to-Cover, 1.8..3.2/.1, x — default 2.5, ตัวเดียวที่ default ไม่ใช่ 0)

**Base series 7 ตัว** (มี fallback ค่ากลาง): us10y 4.2, us2y 3.8, vix 18, usoil 70, us_hy_spread 300, us_cpi_yoy 3 (+ dxy ประกาศใน fetch list แต่ไม่ใช้ใน h()) — ถ้าตัวไหนไม่มีค่าสด แสดง warning เหลือง "⚠️ ไม่มีค่าฐานสดของ <id> — ใช้ค่ากลางแทน — ความไวของผลจำลองส่วนนั้นเป็นค่าประมาณ"

**สูตร:** `simulated = clamp(0,100, scoreปัจจุบัน + h(state) − h(default))` — 6 โมเดลมีสูตร h() เต็ม (บันทึกในหัวข้อ 4) — คล้ายตรรกะของเราแต่เป็นเวอร์ชัน "แบบย่อ" (หน้าเองแจ้งว่าไม่ใช่การคำนวณเต็มรูปแบบ)

**UI:** header + warning + grid 5 คอลัมน์ (ซ้าย 2: sliders + Reset + disclaimer / ขวา 3: ผลกระทบต่อคะแนนโมเดล) — แต่ละโมเดล: `#rank + ชื่อย่อไทย + score → simulated + delta` (เขียว >0.5 / แดง <−0.5 / เท่าจาง) + **double progress bar** (base slate-600/60 = score%, overlay accent ถ้า delta≥0 / orange-400 ถ้า delta<0, opacity .85, width = simulated%) — คลิกขยาย: ถ้า scenario ทำให้ข้ามเกณฑ์ 40 (building) แสดง "ถ้าเกิดสถานการณ์นี้ โมเดลจะเริ่มพิจารณาสัญญาณเหล่านี้" / ต่ำกว่า "ถ้าเกิดสถานการณ์นี้ โมเดลจะต่ำกว่าเกณฑ์ก่อตัวและหยุดพิจารณาสัญญาณใหม่" + ตารางสินทรัพย์ที่เกี่ยวข้อง (signalMap จาก registry `7362`)

## คำตอบตามคำถามใบ 01 (8 ข้อ)

1. **ตัวแปรที่ปรับได้:** 11 ตัว (ตารางครบในหัวข้อ "สรุปสิ่งที่ค้นพบ") — key ไทย/อังกฤษ, unit, min/max/step, default (ทั้งหมด 0 ยกเว้น auctionBtc 2.5)
2. **วิธีป้อนค่า:** slider (`input type="range"`) ล้วน — เป็น**ค่าส่วนต่าง** (signed) ทุกตัว ยกเว้น auctionBtc ที่เป็นค่าสัมบูรณ์ (1.8–3.2) — มีปุ่ม Reset
3. **Preset scenarios:** **หาไม่เจอ** — ไม่มีคำว่า preset ใน bundle (0 hits) — ไม่มีฉากทัศน์สำเร็จรูป
4. **การแสดงผล:** แสดง ก่อน/หลัง คู่กัน (score → simulated) + delta (±, 1 ตำแหน่ง) + sort ตาม simulated มาก→น้อย + rank # + double progress bar + คลิกขยายดู signalMap + activate/deactivate text — **ไม่มีการแตกเป็นราย factor** (มหภาค/โครงสร้าง/ข่าว/ยืนยัน/บทลงโทษ)
5. **มีตัวแปรข่าวให้ปรับไหม:** **หาไม่เจอ** — คำว่า news ไม่มีใน bundle (0 hits) — หน้า /forecast ไม่มีตัวแปรข่าว — news factor เป็นการออกแบบของเราเอง (ticket 05)
6. **แสดงผลต่อสัญญาณเทรดไหม:** ไม่มี ta_score/สัญญาณเทรดโดยตรง แต่มีพื้นผิว "โมเดลจะเริ่มพิจารณาสัญญาณ" / "จะต่ำกว่าเกณฑ์ก่อตัว" (threshold 40) + ตารางสินทรัพย์ที่เกี่ยวข้อง (signalMap) — ใช้เกณฑ์ 60/40 (o=e=>e>=60?2:+(e>=40))
7. **การเตือนว่านี่คือค่าสมมติ:** disclaimer ใต้ปุ่ม Reset — "การจำลองเป็นค่าประมาณทิศทางจากตรรกะเดียวกับ scoring engine (แบบย่อ) — ไม่ใช่ผลการคำนวณเต็มรูปแบบ" + warning เหลืองเมื่อใช้ค่ากลาง (หัวข้อ 7)
8. **copy ภาษาไทยทั้งหน้า:** ครบในหัวข้อ 10 (จำลองสถานการณ์ / ปรับสถานการณ์สมมติ / ผลกระทบต่อคะแนนโมเดล / ไม่มีค่าฐานสดของ / scenarioActivates/Deactivates / สินทรัพย์ที่เกี่ยวข้อง / เกณฑ์ทำงาน (60) / Reset / disclaimer)

## ข้อสรุปป้อน ticket อื่น

- **Ticket 03** (variable set): 11 sliders ข้างต้นคือชุดตัวแปรอ้างอิง — mirror 1:1 (keys, ranges, steps, labels, defaults)
- **Ticket 05** (news factor): หน้า /forecast **ไม่มีตัวแปรข่าวให้ปรับเลย** — news factor เป็นการออกแบบของเราเอง
- **Ticket 06** (signals impact): พื้นผิว = scenario activate/deactivate (threshold 40/60) + signalMap table
- **Ticket 07** (UI): copy ไทย + layout + double bar + expandable rows ครบ
