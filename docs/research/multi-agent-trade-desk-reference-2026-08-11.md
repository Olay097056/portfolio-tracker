# Research — Reference Trade Desk Architecture (2026-08-11)

> ใบ 01 แผน multi-agent-trade-desk

## แหล่ง

- **Preview**: trade desk page (`bond-crisis-dashboard-v2.vercel.app/trade-desk`) — user `olay097056@gmail.com` login แล้ว
- **JS dig**: chunk-8673 (shared UI), chunk-9704 (trade desk main, 42KB), trade-desk-page.js (dynamic import wrapper), layout.js (route mapping)
- **Edge function**: `/functions/v1/trade-admin` (auth-required — **401** with anon key)

## 1. จำนวนทีมและโครงสร้าง

**9 ทีม 9 LLM**: deepseek, kimi, mistral, claude, gpt, gemini, qwen, glm, grok
— reference ใช้ OpenRouter API (หนึ่ง API key → 9 โมเดล) — ต้นทุน ~$5-7/วัน

แต่ละทีมมี:
```
{
  team_code: "deepseek-g1",
  name_th: "ทีม DeepSeek",
  name_en: "Team DeepSeek",
  status: "active",
  capital: 10000,
  equity: 10806,
  pnl_pct: 8.06,
  margin_used: 967,
  cash: 9867,
  mtd_target: { low: 5, high: 20 },
  weekly_target: 1.5,
  weekly_kpi: 1.5,
  turns_won: 3,
  turns_lost: 0,
  turns_pending: 0,
  next_turn_at: "43m",
  lead_model: "claude-4-sonnet",  // model used for team lead
  analysts: [
    { seat: "trend", model: "...", tokens_in: N, tokens_out: N },
    { seat: "technical", ... },
    { seat: "macro", ... },
    { seat: "contrarian", ... },
  ],
  constitution: { ... },  // team charter
}
```

## 2. Multi-Agent Flow

### Per Turn:
1. **Lead ตั้งวาระประชุม** (meeting agenda) — e.g. "สรุปตัวเลขสหรัฐวันนี้ + Fed — เลนส์ contrarian"
2. **Analyst seats** (2-4 คน) — แต่ละคนรับ context คนละชุด:
   - `tdCtxBoardroom` — สัญญาณที่ประชุม
   - `tdCtxCandles` — แท่งเทียน
   - `tdCtxCme` — ข้อมูล CME
   - `tdCtxData` — ข้อมูลทั่วไป
   - `tdCtxMacro` — ข้อมูลมหภาค
   - `tdCtxNews` — ข่าวสาร
   - `tdCtxPhase` — เฟสตลาด/REGIME
   - `tdCtxQuant` — ข้อมูลควอนต์
   - `tdCtxSentiment` — อารมณ์ตลาด
   - `tdCtxSymbolNews` — ข่าวเฉพาะ symbol
   - `tdCtxTa` — Technical Analysis
   - `tdCtxTaDaily` — TA รายวัน
3. **Analyst เสนอ opinion** → lead รวบรวม → **consensus** / **dissent**
4. **Lead เคาะออเดอร์** — size_pct, SL, TP, market, side
5. **บันทึก meeting** — `tdConsensus`, `tdDissent`, token cost

### Peer Review:
- ลูกทีมให้คะแนนกัน — `tdScore`
- หัวหน้าปรับ prompt ลูกทีมที่คะแนนน้อย — `tdCharterUpdated`
- ธรรมนูญทีม (constitution) ถูกปรับตามผลงาน

### Knowledge Base:
- **คลังทีม**: ไม้กำไร (take-profit) — ให้ทีมตัวเองเรียนรู้
- **คลังกลาง**: ไม้ขาดทุน (stop-loss) — ให้ทุกทีมเรียนรู้
- Reason codes: `tdCloseReasonSl`, `tdCloseReasonTp`, `tdCloseReasonLiq`, `tdCloseReasonSignal`, `tdCloseReasonAdmin`, `tdCloseReasonFired`

### Autonomous SL/TP:
- AI สามารถสั่ง `tdCancelOrder` / `tdClosePos` ได้เอง
- "น้องๆ ประชุมกันและสั่งแก้ไขออเดอร์ ปรับ SL มาหน้าทุน" — ระบบไม่มี trailing stop logic ตายตัว

## 3. ตลาดและ Price Feed

**122 ตลาด จาก Hyperliquid** (perpetual futures):
- **Crypto** (40): BTC, ETH, HYPE, SOL, ZEC, PUMP, XRP, LIT, CRV, XMR, DOGE, TAO, WLD, UNI, ADA, FARTCOIN, LINK, NEAR, PAXG...
- **Stocks** (65): SKHX, SPCX, MU, SNDK, DRAM, SKHY, SMSN, PLTR, MSFT, META, NVDA, AMZN, INTC, LITE, CRCL, GOOGL, RKLB, TSLA, NBIS, MRVL...
- **Macro** (15): CL, BRENTOIL, SP500, XYZ100, SILVER, GOLD, EWY, NATGAS, COPPER, PLATINUM, JP225, KR200, XLE, EWJ, EWT
- **FX** (2): JPY, EUR

แต่ละ market มี: ราคา, 24h change, funding rate, ปริมาณ 24h, TA signals (bull trend, ma golden cross, shrink pullback, box top...), TIER (1-3)

## 4. UI Components (จาก chunk-8673 + chunk-9704)

- **LeaderBoard**: จัดอันดับ 9 ทีม — equity curve เทียบกัน, monthly ranking
- **TeamCard**: equity, P&L, margin, cash, MTD, weekly KPI, turn stats, next turn countdown, status dot (pulse animation)
- **OpenPositions**: 17 ไม้ (mark price, entry, margin, unrealized P&L, SL/TP, liquidation, age)
- **MarketTable**: 122 markets — filter by category, sort by various columns
- **Meetings**: meeting log — analysts opinions, consensus, dissent, token cost
- **Gauge**: SVG semi-circle gauge (0-100)
- **Sparkline**: inline SVG chart (60×22)
- **FreshnessDot**: pulse animation (green/amber/red)

## 5. ข้อมูลที่ยังเข้าไม่ถึง (RLS — ต้อง user login)

- `trade_teams` schema เต็ม (constitution field, lead_model, analysts JSON)
- `trade_turns` schema (meeting logs, analyst opinions, consensus)
- `trade_knowledge` schema (KB entries — team vs central)
- `trade-admin` edge function response shape
- Prompt templates จริง (lead vs analyst personas)

## 6. Implication สำหรับแผนเรา (1 ทีม deepseek)

- เรามี LLM ตัวเดียว → 1 ทีม แต่ภายในมี lead + 4 analysts (5 persona calls ต่อ turn)
- Context data: เราให้ bond-crisis data ที่มีอยู่แล้ว (macro/models/signals/news/sentiment)
- Price feed: Hyperliquid API (ฟรี — validated แล้วใน bond-crisis-100 ใบ 07)
- KB: Supabase tables (`trade_knowledge` — team_id + type='win'|'loss')
- Constitution: JSON field ใน trade_teams — lead ปรับได้ผ่าน prompt
- Meetings: `trade_turns` table — log analysts opinions + lead decision

**Token cost estimate** (1 turn):
- 4 analysts × ~500 tokens = 2,000
- 1 lead × ~800 tokens = 800
- Total ~2,800 tokens/turn @ deepseek-v4-flash pricing = ~$0.0004/turn
