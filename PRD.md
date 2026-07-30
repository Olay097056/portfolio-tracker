# PRD — Portfolio Tracker (พอร์ตหุ้น/ETF อเมริกา สำหรับใช้คนเดียว)

Status: ready for implementation
Source: assembled from the wayfinder map at [`.scratch/planning/map.md`](.scratch/planning/map.md) and its 6 resolved tickets, plus a follow-up feature sweep of the wethaiinvest.com reference product (features described in our own words — see Section 0).

## 0. Reference sweep — what informed this spec

หลังจากทำ map/ticket หลักเสร็จ ได้กลับไปสำรวจ flow ของ wethaiinvest.com (ผู้ใช้เป็นสมาชิกอยู่แล้ว) เพิ่มเติมแบบละเอียด เพื่อไม่ให้ตกหล่นฟีเจอร์หลักที่ควรมี — สรุปด้วยคำพูดของเราเอง ไม่ใช่การคัดลอกโค้ด/ข้อความ/ดีไซน์ต้นฉบับ ผลจากการสำรวจรอบนี้เพิ่มเข้าสเปกแล้ว: เงินสดในพอร์ต, กำไรที่ล็อคแล้ว, สัดส่วนเป้าหมายระดับพอร์ต, เครื่องคำนวณสถานการณ์ขาดทุน, และโหมดแสดงผลง่าย/แม่นยำ (รายละเอียดกระจายอยู่ในหัวข้อที่เกี่ยวข้องด้านล่าง)

**หมายเหตุสำคัญ**: บทวิเคราะห์ AI ต่อหุ้น (เนื้อหาที่ระบบของ wethaiinvest สร้างขึ้นเอง) ไม่ได้ถูกคัดลอกมาและไม่รวมอยู่ในสเปกนี้ — ฟีเจอร์ AI insight ยังคงเป็น fog/deferred ตามที่ตัดสินใจไว้เดิม (ดูข้อ 2)

## 1. Overview

เว็บแอปติดตามพอร์ตหุ้น/ETF ตลาดอเมริกา **สำหรับใช้คนเดียว** — บันทึกการถือครอง, คำนวณต้นทุนเฉลี่ยและสถานะ rebalancing เทียบสัดส่วนเป้าหมาย, แสดงกราฟราคาพร้อมเส้นแนวรับ-แนวต้าน (คำนวณอัตโนมัติ + แก้ไขเองได้) ได้รับแรงบันดาลใจด้านฟีเจอร์/เลย์เอาต์จาก wethaiinvest.com (ลงทุนหุ้นอเมริกา — ผู้ใช้เป็นสมาชิกอยู่แล้ว) และ Google Finance โดยไม่ก๊อปปี้แบรนด์หรือข้อมูลที่คนอื่นคำนวณมาโดยเฉพาะ

**ไม่ใช่**: ระบบเทรดจริง, ระบบหลายผู้ใช้/login, เครื่องมือ import จากโบรกเกอร์ (v1)

## 2. Scope

### In scope (v1)

- บันทึก/แก้ไข/ลบ holding ในพอร์ต (manual entry เท่านั้น)
- รองรับหลายพอร์ตพร้อมกัน (เช่น พอร์ตระยะยาว, พอร์ตเก็งกำไร)
- **สัดส่วนเป้าหมายระดับพอร์ต** — แต่ละพอร์ตมี target % ของเงินทั้งหมด (ไม่ใช่แค่ target % ของหุ้นในพอร์ตเดียว) แก้พร้อมกันหลายพอร์ตได้เพราะสัดส่วนรวมต้อง = 100%
- **เงินสดในพอร์ต** — ยอดเงินที่ยังไม่ได้ลงทุน นับรวมในมูลค่าพอร์ต
- **กำไรที่ล็อคแล้ว (realized P&L)** — แยกจากกำไรที่ยังไม่รับรู้ (unrealized), กรอกเองเป็นยอดสะสม (ไม่ต้องมี transaction history เต็มรูปแบบ)
- Watchlist แยกจาก holdings
- ดึงราคาหุ้น/ETF (real-time-ish + historical) จาก external API
- กราฟราคาพร้อมเส้นแนวรับ-แนวต้าน (auto-calculated default + manual override)
- คำนวณต้นทุนเฉลี่ยใหม่เมื่อเติมเงินลงทุน (DCA calculator)
- **เครื่องคำนวณสถานการณ์ขาดทุน (stress-test)** — กรอกเงินลงทุน แล้วดูมูลค่าที่เหลือ/เงินที่หายไปถ้าราคาร่วง -5%/-10%/-20% หรือกำหนดราคาเป้าหมายเอง
- Rebalancing: เทียบสัดส่วนปัจจุบัน vs เป้าหมาย (ทั้งระดับหุ้นและระดับพอร์ต), แจ้งเตือนตามเกณฑ์
- แปลงสกุลเงิน USD → THB สำหรับมูลค่าพอร์ตรวม
- **โหมดแสดงผลง่าย/แม่นยำ** — toggle ปรับความละเอียดของตัวเลข/ความหนาแน่นของ UI

### Out of scope

- ระบบ login/multi-user — แอปเดสก์ท็อปสำหรับใช้คนเดียว
- การเชื่อมต่อซื้อขายจริงกับ broker (ส่งคำสั่งซื้อขาย) — เครื่องมือติดตาม/วิเคราะห์เท่านั้น
- "ดูพอร์ตแอดมิน" — ฟีเจอร์เฉพาะของ membership ของ wethaiinvest.com ไม่มีความหมายในแอปคนเดียว

### Deferred (fog — ในสโคประยะยาวแต่ยังไม่ specify สำหรับ v1)

- AI-generated insights / chat ถาม-ตอบเกี่ยวกับพอร์ตหรือข่าว — ยังไม่เลือกว่าจะต่อ LLM ตัวไหน งบเท่าไหร่ (เนื้อหา AI analysis ของ wethaiinvest ไม่ได้ถูกใช้เป็นข้อมูลอ้างอิงเชิงเนื้อหา แค่ยืนยันว่ามีฟีเจอร์แบบนี้อยู่จริง)
- แถบข่าว/สรุปภาพรวมตลาด (แบบหน้าแรก Google Finance) — ยังไม่เลือก data source ข่าว
- Import รายการซื้อจากไฟล์ broker/CSV — รูปแบบต่างกันไปตามโบรก ยังไม่เลือกว่าจะรองรับโบรกไหนก่อน

## 3. Tech stack

| Layer | Choice |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | React + Vite |
| Charting | TradingView Lightweight Charts |
| Database | SQLite via SQLAlchemy |
| Price data | yfinance (primary), Twelve Data (fallback) |
| FX rate | Free FX API (e.g. exchangerate-api.com / Frankfurter), no key required |

Rationale for each pick is in the map's Decisions-so-far and the linked tickets — most notably the price-data and stack choices (tickets 01, and the initial chart-the-map grilling).

## 4. Data model

```
Portfolio
- id
- name (string)
- cash_usd (float, default 0)                  // uninvested cash held in this portfolio
- target_allocation_pct (float, optional)       // this portfolio's target share of total capital across all portfolios
- created_at

Holding
- id
- portfolio_id (FK → Portfolio)
- ticker (string, required)
- shares (float, required)
- avg_cost_usd (float, required)                // per-share average cost, USD
- target_allocation_pct (float, optional)       // target share of THIS portfolio
- realized_pnl_usd (float, default 0)           // cumulative locked-in profit, entered manually (no lot history)
- created_at, updated_at

WatchlistItem
- id
- ticker (string, required)
- category (string, optional — e.g. "ETF", "Growth"; used for tab-style grouping)
- created_at

SRLevel                                         // support/resistance lines per ticker+interval
- id
- ticker (string)
- interval (string — minute/day/week/month, matches the chart's "ความถี่" control)
- price (float)
- kind (enum: support | resistance)
- source (enum: auto | manual)
- created_at, updated_at
```

Notes:
- ไม่มี per-transaction/lot history — เก็บแค่สถานะรวมของแต่ละ holding (ยืนยันจากฟอร์ม "เพิ่มหุ้นใหม่" จริงของ wethaiinvest.com) — `realized_pnl_usd` จึงเป็นตัวเลขสะสมที่ผู้ใช้กรอกเอง ไม่ได้คำนวณจาก lot อัตโนมัติ
- ไม่มี currency field ต่อ holding — ราคาหุ้นอเมริกาทุกตัวเป็น USD; การแปลง THB เกิดที่ display layer เท่านั้น (ดูข้อ 9)
- เพิ่ม watchlist item เข้าพอร์ตจริง = สร้าง `Holding` แถวใหม่ ไม่ auto-convert/ลบ `WatchlistItem`
- **Allocation มี 2 ระดับที่ต้อง validate แยกกัน**: `Portfolio.target_allocation_pct` ของทุกพอร์ตรวมกัน = 100%, และ `Holding.target_allocation_pct` ของทุก holding ภายในพอร์ตเดียวกันรวมกัน = 100% (หรือ ≤100% ถ้าเผื่อ cash) — validation นี้ทำที่ backend ตอนบันทึก

Persistence: SQLite ไฟล์เดียว ผ่าน SQLAlchemy — ไม่ต้องมี client-server DB แยก เพราะเป็นแอปคนเดียวรันโลคัล

Total portfolio value = `cash_usd` + Σ(`shares` × current price) ต่อ holding ในพอร์ตนั้น; unrealized P&L = Σ((current price − `avg_cost_usd`) × `shares`); realized P&L = Σ `realized_pnl_usd` ของ holdings ในพอร์ต

## 5. Price data

- **Primary**: yfinance — ฟรี ไม่ต้อง API key ครอบคลุมประวัติราคาย้อนหลังยาว (รองรับ 5Y+ daily ตามที่ range selector ต้องการ) แต่เป็น unofficial library ที่อาจพังเมื่อ Yahoo เปลี่ยน backend หรือโดน rate-limit ถ้าเรียกถี่เกินไป — ควร wrap ด้วย retry/backoff และ cache response (อย่า fetch ใหม่ทุกครั้งที่โหลดหน้า)
- **Fallback**: Twelve Data — official ToS-compliant, free tier 800 requests/day, ต้องสมัคร API key ฟรีเก็บเป็น environment variable (ห้าม commit) — สลับมาใช้เมื่อ yfinance ล่มหรือโดนบล็อก
- ตัดออก: Alpha Vantage (25 req/day แคบเกินไป), Finnhub (free-tier candle access ของหุ้นสหรัฐฯ ต้องเช็คให้ชัดก่อนพึ่งพา — ยังไม่ยืนยัน)

## 6. Support/Resistance (S/R)

**Default (auto)**: swing high/low (fractal) pivot detection — หา pivot ที่ high/low สุดขั้วเทียบกับ N แท่งรอบข้าง (แนะนำ N=5) แล้ว cluster pivot ที่ใกล้กัน (~1-2%) เป็นโซน จัดอันดับความแข็งแรงตามจำนวนครั้งที่ราคาสัมผัส วิธีนี้ timeframe-agnostic — รันบน bar series ของ interval ปัจจุบัน (minute/day/week/month) ได้โดยไม่ต้อง special-case

**Manual override**: ผู้ใช้ลาก/เพิ่ม/ลบเส้นได้ผ่าน controls "S" / "R" / "Freestyle" — พอแตะเส้นของ ticker+interval ไหนแล้ว ระบบ mark `source=manual` และหยุด auto-recompute ทับจนกว่าจะกด "recompute defaults" เพื่อรีเซ็ตกลับไปใช้ค่า auto

## 7. Scenario / stress-test calculator

Panel ต่อ holding ที่ตอบคำถาม "ถ้าราคาร่วง จะเสียหายเท่าไหร่":

- Input: เงินลงทุนเริ่มต้น (USD) — ใช้ราคาปัจจุบันของ ticker คำนวณจำนวนหุ้นที่ได้
- Output: 3 scenario คงที่ที่ราคาร่วง **-5%**, **-10%**, **-20%** จากราคาปัจจุบัน — แต่ละ scenario แสดง "มูลค่าที่เหลือ" และ "เงินที่หายไป"
- Input เสริม: กำหนดราคาเป้าหมายเองแทน 3 scenario ที่ตั้งไว้ล่วงหน้าได้ (custom target price)
- Pure client/server-side calculation จากราคาปัจจุบัน — ไม่ต้องมี data source หรือ state เพิ่มเติมนอกจากที่มีอยู่แล้ว

## 8. Rebalancing

- **Threshold**: absolute deviation ระหว่าง current allocation % กับ `target_allocation_pct`, ค่าเริ่มต้น **±5 percentage points**, ปรับได้ (global setting เดียว ไม่ใช่ต่อ holding) — ใช้กฎเดียวกันทั้งระดับ holding-in-portfolio และระดับ portfolio-of-portfolios
- **ระดับสี**:
  - เขียว — ภายใน ±5pp
  - เหลือง — เบี่ยง 1×–2× ของ threshold (เช่น 5–10pp ที่ค่าเริ่มต้น)
  - แดง — เบี่ยงเกิน 2× ของ threshold (เช่น >10pp)
- **การแสดงผล**: สีบน progress bar ต่อ holding และต่อพอร์ต + badge สรุปที่ dashboard หลัก ("N holdings need rebalancing") — ไม่มี push notification/popup (แอปเดสก์ท็อปที่เปิดดูเอง)

## 9. Currency (USD/THB)

- **แหล่งเรท**: free FX API (ไม่ต้อง key) + ช่องแก้ไขเรทด้วยมือเป็น fallback หาก API ล่ม
- **อัปเดต**: วันละ 1 ครั้ง cache ไว้ ไม่ fetch ทุกครั้งที่โหลดหน้า
- **จุดที่แปลง**: เฉพาะระดับสรุปพอร์ต (มูลค่ารวม, กำไร/ขาดทุนรวม ทั้ง unrealized และ realized) มี toggle USD/THB — ตัวเลขรายหุ้น (ต้นทุนเฉลี่ย, ราคา, P&L ต่อหุ้น) คง **USD เสมอ** เพราะข้อมูลตลาดเป็น USD โดยธรรมชาติ

## 10. UI layout

เลือกจาก prototype 3 แบบ ([`.scratch/planning/prototype-06-dashboard/index.html`](.scratch/planning/prototype-06-dashboard/index.html), `?variant=A|B|C`) — ผลลัพธ์คือ **Variant A: fixed 3-column trading-terminal layout**, ขยายเพิ่มเป็น 2 หน้า สลับกันด้วยแท็บ Dashboard/Portfolios ที่ top nav (แทนที่จะยัดทุกอย่างไว้หน้าเดียว):

### 10.1 Top nav (ทุกหน้า)

แถบบนสุด: ชื่อแอป, แท็บ **Dashboard** / **Portfolios**, currency toggle USD/THB (มุมขวา), UI density toggle โหมดง่าย/แม่นยำ

### 10.2 หน้า Dashboard — ดูกราฟ/จัดการหุ้นรายตัว ของพอร์ตที่เลือก

3 คอลัมน์ตายตัว:
- **Sidebar ซ้าย**: dropdown สลับพอร์ต (เลือกจากพอร์ตทั้งหมดที่มี) → การ์ดมูลค่ารวมของพอร์ตนั้น (รวมเงินสด, แสดงแยก) → holdings list (ticker, % ปัจจุบัน/เป้าหมาย, สีแถบ rebalance ตามข้อ 8) → watchlist ด้านล่าง
- **แผงกลาง**: header ของ ticker ที่เลือก (ราคา, % เปลี่ยนแปลง) → chart toolbar (range 1D/5D/1M/6M/YTD/1Y/5Y, interval minute/day/week/month, overlay toggles) → กราฟราคาพร้อมเส้น S/R (auto/manual)
- **Sidebar ขวา** เรียงเป็น 3 panel: (1) "Manage [ticker]" — shares, avg cost, target %, **realized P&L**, ปุ่มแก้ไข holding; (2) DCA/average-cost calculator; (3) **Stress-test calculator** (ข้อ 7)

### 10.3 หน้า Portfolios — ภาพรวมทุกพอร์ต + จัดการระดับพอร์ต

- **แถวสรุปบนสุด** (4 การ์ด): มูลค่ารวมทุกพอร์ต, เงินสดรวม, unrealized P&L รวม, realized P&L รวม
- ปุ่ม **"+ Add portfolio"**
- **รายการพอร์ต** — 1 การ์ดต่อพอร์ต ประกอบด้วย: โดนัทชาร์ตสัดส่วน holdings ในพอร์ตนั้น, ชื่อพอร์ต, badge สี (เขียว/เหลือง/แดงตามเกณฑ์ข้อ 8) แสดง % ปัจจุบัน vs เป้าหมายระดับพอร์ต, มูลค่า/เงินสด/unrealized/realized ของพอร์ตนั้น, ปุ่ม **"แก้ไข"** (เปิด/ปิด edit panel inline) และ **"เปิดใน Dashboard"** (สลับไปหน้า Dashboard พร้อมเลือกพอร์ตนั้นให้อัตโนมัติ)
- **Edit panel** (แสดงเมื่อกด "แก้ไข"): ช่องชื่อพอร์ต, ช่องสัดส่วนเป้าหมาย % (ของเงินทั้งหมดทุกพอร์ตรวมกัน), หมายเหตุเตือนว่าต้องปรับพอร์ตอื่นให้ผลรวม = 100%, ปุ่มบันทึก
- **รายการ holdings ย่อ** ใต้แต่ละการ์ด: ticker, จำนวนหุ้น @ ต้นทุนเฉลี่ย, มูลค่าปัจจุบัน, ปุ่มแก้ไข/ลบ

รายละเอียด interaction เพิ่มเติม (เช่น flow การเพิ่มหุ้นใหม่, flow ย้าย watchlist → holding) อ้างอิงจากฟอร์มที่ยืนยันไว้ในข้อ 4 และ mockup ที่ลิงก์ไว้ข้างบน — mockup ตอนนี้ครอบคลุมทั้ง 2 หน้าแล้ว (เปิดไฟล์แล้วกดแท็บ Dashboard/Portfolios ดูได้โดยตรง)

## 11. Setup prerequisites before implementation starts

- สมัคร Twelve Data free API key (fallback price source) — เก็บเป็น env var
- เลือก free FX API provider ตัวจริง (exchangerate-api.com หรือ Frankfurter) และสมัคร key ถ้าจำเป็น
- ไม่ต้องมี API key สำหรับ yfinance

## 12. Open items for later (not blocking v1 build)

ดู "Not yet specified" ใน [map.md](.scratch/planning/map.md) — AI insights, แถบข่าวตลาด, CSV import จากโบรกเกอร์

### จาก stockvision-app merge (2026-07-24) — ยังไม่ grill รายละเอียด เก็บเป็น ticket ไว้ก่อน

4 แท็บ (Dividend Ranking, Momentum Scanner, Pre-Squeeze Scanner, Trending Stocks Today) ที่เคยอยู่ในดราฟท์ stockvision-app แบบ preset/mock data — grill แล้ว (spec: `docs/specs/2026-07-25-watchlist-and-scanners.md`), build เสร็จและ merge เข้า master ทั้งหมดแล้ว (2026-07-25) ดูรายละเอียด residual ที่เหลือจากงานนี้ในหัวข้อถัดไป

ที่ยังเหลือ ยังไม่ grill:

- **AI News Summary** — สรุปข่าวหุ้น + AI (ซ้ำกับ "แถบข่าว/สรุปภาพรวมตลาด" ที่ deferred อยู่แล้วด้านบน) — ต้องเลือก news API ใหม่ก่อน
- **AI Stock Analysis** — สร้าง AI analysis report ต่อหุ้น (ในดราฟท์ใช้ prompt/logic ที่ระบุว่า "exact" มาจาก doohoon.net ตรงๆ — ถ้าทำจริงต้องคิด prompt ใหม่เอง ไม่ใช้ของ doohoon.net ตามหลักเดียวกับที่ห้ามใช้เนื้อหา AI ของ wethaiinvest.com) — ต้องเลือก LLM API ใหม่ก่อน ความเสี่ยงเรื่อง copyright/provenance สูงสุดในบรรดา 6 แท็บเดิม
- **ETF Comparison — fundamentals ลึก** (dividend yield, P/E, forward P/E, beta, MA score จาก yfinance `.info` จริง) — v1 ของ ETF Comparison ใช้แค่ราคา/P&L จาก `price_service` เดิม ส่วนนี้ค่อยขยายทีหลัง

### จาก Watchlist and Scanners effort (2026-07-25) — build เสร็จแล้ว, residual ที่เหลือ

ticket 1-7 ทั้งหมด merge เข้า master แล้ว (Extract shared tab nav → Watchlist area → Momentum Scanner walking skeleton → Momentum Scanner remaining signals → Pre-Squeeze Scanner → Dividend Ranking → Trending Stocks Today) ทุก final review ผ่าน READY TO MERGE: Yes

Residual ที่แก้ไปแล้ว (2026-07-30):

- ~~ไม่มี unique constraint บน `watchlist_items.ticker`~~ — เพิ่ม DB unique index (backfill บน DB เดิมด้วย เพราะ `create_all` ไม่ alter table ที่มีอยู่แล้ว) + 400 ที่ endpoint สำหรับ ticker ว่างหรือซ้ำ (case-insensitive, normalize เป็นตัวพิมพ์ใหญ่ก่อนเทียบ)
- ~~ไม่มี README/`.env.example`~~ — เพิ่ม `backend/README.md` + `backend/.env.example` document ทั้ง `FMP_API_KEY` และ `TWELVE_DATA_API_KEY`
- ~~ไม่มี caching/TTL บน Trending response~~ — เพิ่ม TTL cache 15 นาที (ตาม `history_service.py`) แยก cache ต่อ endpoint (gainers/losers/actives)
- ~~Sort-utility ไม่ retrofit~~ — Momentum Scanner และ Pre-Squeeze Scanner retrofit ไปใช้ `useSortableColumn`/`sortByNullableNumber` แล้ว (pure refactor, test เดิมผ่านหมดโดยไม่แก้)
- ~~ข้อความ empty-watchlist ไม่พูดถึง Trending Stocks Today~~ — แก้ทั้ง 3 แท็บ scanner ให้ชี้ไปที่ Trending Stocks Today แล้ว
- ~~Cross-provider ticker symbology ไม่ได้ validate~~ — **grill แล้ว (2026-07-30), ตัดสินใจไม่ทำอะไร**: ticker ที่หา resolve ใน yfinance ไม่ได้ (ไม่ว่าจะเพิ่มจาก Trending หรือพิมพ์เองใน Manage Watchlist) แสดงผลเป็น "Unavailable" ทุกคอลัมน์อยู่แล้วผ่าน `formatNumber`/`formatSignedPercent` — ตรงกับหลัก "never fabricate" ที่ยึดมาตลอดโปรเจกต์ ไม่ใช่ของพัง การเพิ่ม validation call ตอน add จะขัดกับดีไซน์ "one-click, instant add" ของ Trending ที่ตกลงกันไว้ตอน Ticket 7 ด้วย

Residual ที่ยังเหลือ:

- **FMP v3 `stock_market` endpoints อาจเป็น legacy API path** — FMP มี `/stable/biggest-gainers` เป็นเวอร์ชันใหม่กว่าแล้ว ยังไม่เคยทดสอบกับ real API key เลย **แนะนำให้ smoke test ด้วย real `FMP_API_KEY` เป็นอันดับแรกที่ทำได้** พร้อมยืนยันว่า `change_pct` ไม่ได้เป็น null ทั้งหมด (เผื่อ field type เปลี่ยนไปในเวอร์ชันใหม่) — รอ user ให้ key มา (2026-07-30: ยังไม่มี key)
- **`_fetch_dividend_yield_pct` scaling ยังไม่ยืนยัน 100% ว่าถูกกับ yfinance 0.2.51 ที่ pin ไว้** — ตอนนี้ใช้ heuristic (>1 = ถือว่าเป็น % อยู่แล้ว, ≤1 = คูณ 100) ที่ครอบคลุมกรณีหลัก (ETF yield สูงอย่าง JEPQ) ถูกต้อง แต่ยังมีความเสี่ยงที่หุ้น yield ต่ำกว่า 1% (เช่น AAPL ~0.44%) อาจถูกคูณผิด 100 เท่า ถ้า yfinance เวอร์ชันนี้คืนค่าเป็น % อยู่แล้วจริงๆ — ยืนยันไม่ได้เพราะ yfinance โดน rate-limit (429) ตลอด session นี้ ต้องลองเรียกจริงตอน rate limit หายแล้วเพื่อ confirm รูปแบบ แล้วปรับ/ลบ heuristic ถ้าจำเป็น
- **Portfolio Builder wizard ไม่ rollback เมื่อสร้าง holding ล้มเหลวกลางทาง** — ถ้า `createPortfolio` สำเร็จแต่ `createHolding` ตัวใดตัวหนึ่งล้มเหลว ระบบกัน duplicate portfolio จากการกด retry ซ้ำได้แล้ว (ต้อง preview ใหม่ก่อนถึงจะสร้างซ้ำได้) แต่ portfolio ที่สร้างไปแล้วบางส่วน (พร้อม holdings ที่ทันสร้างก่อนพัง) ยังค้างอยู่ใน backend ไม่มีการลบทิ้งอัตโนมัติ — ผู้ใช้ต้องไปลบเองถ้าเจอ
