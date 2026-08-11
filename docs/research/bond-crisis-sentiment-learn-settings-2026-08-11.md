# Research — หน้า sentiment / learn / settings ของ reference (2026-08-11)

> ใบ 03 ของแผน `.scratch/bond-crisis-100/` — ทุกหลักฐาน raw (chunk URL + quote)

## 1. แหล่ง dig

| ไฟล์ | URL | bytes |
|---|---|---|
| `sentiment-page.js` | `/_next/static/chunks/app/sentiment/page-fda56724f6b8001b.js` | 10,727 |
| `learn-page.js` | `/_next/static/chunks/app/learn/page-077c4cf293ea711e.js` | 8,514 |
| `settings-page.js` | `/_next/static/chunks/app/settings/page-7bfcac609d62a585.js` | 25,739 |
| `chunk-8440` (module 28440 = บทเรียน 7 บท) | `/_next/static/chunks/8440-de27c4ca13e2c7f3.js` | 50,153 |
| Supabase tables | REST (anon key จาก bundle) | — |

## 2. /sentiment (อารมณ์ตลาด)

**2 queries พร้อมกัน** (auto-refresh 5 นาที = 3e5 ms):
```js
a.ND.from("retail_sentiment").select("*").order("recorded_at",{ascending:false}).limit(800)
a.ND.from("index_hourly").select("*").order("recorded_at",{ascending:false}).limit(400)
```

**retail_sentiment** (row จริง): `{"id":125974, "indicator":"fear_greed", "value":65, "label":"Greed", "recorded_at":"2026-08-11T00:00:00+00:00"}` — รายวัน (00:00 UTC)
- indicators: `fear_greed` (CNN) + `crypto_fear_greed` + 4 ตัวชี้วัด: `euphoria`/`pain`/`panic`/`disbelief`
- UI: `y("fear_greed")` + `y("crypto_fear_greed")` — gauge 0-100 (Extreme Fear..Extreme Greed)

**index_hourly** (row จริง): `{"id":2707, "series_id":"us_hy_spread", "value":270, "change_pct":-0.369, "recorded_at":"2026-08-11T12:00:00+00:00"}` — รายชั่วโมง
- series: `move`/`vix`/`dxy`/`us_hy_spread` + `x=["move","vix","dxy","us_hy_spread"]` — "เทียบชั่วโมงก่อน"

**4 ตัวชี้วัด map** (h): `euphoria` ความคึกคะนอง #34d399 "ตลาดโลภจัด — ระวังจุดกลับตัว" · `pain` ความเจ็บปวด #fbbf24 "แรงกดดันต่อพอร์ตช่วงตลาดกลัว" · `panic` ความตื่นตระหนก #f87171 "ความกลัวสุดขั้ว + ความผันผวนพุ่ง" · `disbelief` ความไม่เชื่อมั่น #a78bfa "ตลาดนิ่งแต่คนยังกลัว — มักเป็นช่วงสะสม"

**ดัชนี map** (p): `move` MOVE #f59e0b dec1 · `vix` VIX #f87171 dec2 · `dxy` DXY #38bdf8 dec2 · `us_hy_spread` HY Spread #a78bfa unit bps dec0

**กราฟ**: แนวโน้มย้อนหลัง 1 ปี (2 แกน — FG + crypto FG?) ใช้ Sparkline component (lazy: n.e(9763),n.e(4776),n.e(8545),n.e(2732) → module 22732)

## 3. /learn (บทเรียน)

**โครงสร้าง**: บทเรียน = **hardcoded module 28440** (chunk-8440) — export `l1` (7 บท) + `Vy` + `mH`
- progress: `ND.from("lesson_progress").select("chapter_slug")` → Set ของ slug ที่เรียนแล้ว
- reset: `ND.rpc("reset_my_lessons")` (confirm ก่อน: `t.retakeConfirm`)

**บทเรียน 7 บท (l1 — slug/icon/title/th+en/blurb/th+en/minutes/blocks/quiz):**
0. `intro` Compass "เริ่มที่นี่ — ยินดีต้อนรับ" 1 นาที — พื้นฐานระบบ (5 paragraphs + list + callout "วิธีเรียน")
1. `bond-basics` Coins "พันธบัตรคืออะไร" 4 นาที — ใบกู้เงิน/ดอกเบี้ย-ราคาวิ่งสวนกัน
2. `read-dashboard` Gauge "อ่านระบบให้เป็น" 4 นาที — หน้าต่างๆ ดี/ร้าย
3. `crisis-chain` Network "ถ้าวิกฤตพันธบัตรมา" 4 นาที — ลูกโซ่กระทบไทย
4. `six-models` BarChart3 "โมเดลทำกำไร 6 แบบ" 4 นาที — แต่ละโมเดลจับช่วงตลาด
5. `key-numbers` CalendarClock "ตัวเลขเศรษฐกิจสำคัญ" 4 นาที — ประกาศที่ขยับตลาด
6. `put-together` Flag "ประกอบร่าง & ใช้งานจริง" 3 นาที — ภาพเดียว + กิจวัตรเช้า

**block kinds**: `paragraph` / `heading` / `list` (ordered) / `callout` (tone: info) — ทุก block มี `th` + `en` (สองภาษาเต็ม) + `quiz` ต่อบท (คำถามสั้นๆ)
- เนื้อหาทั้งหมด hardcode ใน bundle — **คัดลอกได้ตรงๆ** (เป็นเนื้อหาการศึกษา ~7 บท)

## 4. /settings (ตั้งค่า)

**บัญชี**: Supabase auth (Google login) + `user_profiles` (`select role, banned, onboarded_at eq user_id`) + signOut

**Telegram link flow** (edge function):
```js
// 1) ดูสถานะปัจจุบัน
ND.from("telegram_links").select("chat_id, telegram_username, prefs, connected_at").maybeSingle()
// 2) ขอ deep link (login required)
fetch(VI + "/functions/v1/telegram-link", {method:"POST", headers:{Authorization:"Bearer " + access_token}})
//    → {deep_link, token?, bot_username?, tg_link?, expires_at?} — เปิด deep_link ใน tab ใหม่
// 3) poll ทุก 3s × 40 (120s) จนกว่า telegram_links มี row → แสดง username ที่เชื่อมแล้ว
```
- `telegram_links` 401 anon (RLS — ต้อง login) · admin: `admin-settings` edge fn (action=set, job, preset — ตั้งค่า jobs)

**i18n**: ตั้งค่าการแจ้งเตือน · บัญชี · เข้าสู่ระบบด้วย · ออกจากระบบ · การแจ้งเตือน Telegram · เชื่อมต่อ Telegram เพื่อรับแจ้งเตือนโมเดลและสัญญาณเทรดแบบเรียลไทม์ · เชื่อมต่อ Telegram

## 5. ข้อค้นพบสำคัญ

- **sentiment ข้อมูลครบใน 2 tables** (retail_sentiment + index_hourly) — mirror ได้ง่าย: CNN FG (มี API) + crypto FG (alternative.me ฟรี) + MOVE/VIX/DXY/HY จาก macro เดิม — เก็บรายชั่วโมงเอง
- **learn เนื้อหาทั้งหมด hardcode ใน bundle** — คัดลอก th+en ได้ตรง (ลิขสิทธิ์: เนื้อหาของ reference — ถาม user ใบ 09)
- **settings**: Telegram bot ต้องมี bot จริง (deep_link + webhook) — ใบ 09 ถาม user จำเป็นไหม
- 4 ตัวชี้วัด (euphoria/pain/panic/disbelief) เป็น **ค่าคงที่ใน row ตาราง** (indicator column) — สูตรอยู่ฝั่ง cron (เปิดคำถาม backend)

## 6. เปิดคำถาม

- สูตร 4 ตัวชี้วัด (euphoria/pain/panic/disbelief) — ฝั่ง cron ของ reference ไม่เห็น → ออกแบบเอง (HITL ใบ backend)
- learn: คัดลอกเนื้อหา reference หรือเขียนใหม่ (ใบ 09)
- telegram: bot จริง หรือ UI อย่างเดียว (ใบ 09)
