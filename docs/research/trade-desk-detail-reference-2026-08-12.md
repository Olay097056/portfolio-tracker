# Research — Reference Team Detail Page (2026-08-12)

> ใบ 01 แผน trade-desk-detail · Preview + JS dig

## Sources

- **Preview**: `/trade-desk/deepseek-g1` — 12,575 chars of rendered text
- **JS dig**: `td-detail-page.js` (30KB) — 82 i18n keys extracted
- **Route**: Next.js `[teamId]` dynamic route at `/trade-desk/[teamId]`

## 1. Page Structure (12 sections)

จาก preview (เรียงตามที่แสดง):

### Header + Stats Row
- Team name + status badge + gen ("รุ่น 1")
- Lead info: หัวหน้าทีม model (deepseek-v4-pro), analysts ×6 (deepseek-v4-flash)
- Next turn countdown
- Equity card: $10,798 (+7.98%), capital $10,000
- Closed P&L: $941.22 (70 ไม้ปิด, กำไรสุทธิ $852.66)
- Cash: $9,694 · margin $950 (9% of equity) · 3 pos
- Live P&L: -$46.51 (-0.47%)
- Max drawdown: -6.62% ($10,946→$10,221, 31 ก.ค.)
- Win rate: 50% (W35/L35), R:R 1.56:1, Profit factor 1.56
- Fees: $97.16, Tokens: 11.80M (~$2.25, 3,382 calls), wakes today: 2

### Equity Curve (30 days)
- SVG area chart — 21 ก.ค. to 11 ส.ค., range $9,450-$11,250

### 🎯 เป้าสัปดาห์ (Weekly Target)
- หัวหน้าตั้งเอง: +1.50% (~$124 จากทุน)
- แผนการเทรด: text description
- "ตั้งเมื่อ 2 วันที่แล้ว"

### 🛤️ ลู่ทีม (MANDATE)
- **Central-mandated** — ทีมแก้ไม่ได้
- "ลู่: สวนฝูง (contrarian)" — fade funding/positioning/sentiment extremes
- Specific rules: [XW] warning, mean-revert, avoid [HV] heavy macro

### ธรรมนูญทีม (Constitution)
- หัวหน้าเขียนเอง · versioned ("9 วันที่แล้ว")
- Rules: SL breakeven at ≥1.0%, trailing stop ATR1h*1.5, no TP=null unless 5/6 consensus
- SL must be outside 1σ band

### Open Positions (3) + Pending Orders (20)
- Positions table: symbol, entry, mark, margin, P&L, SL/TP, liquidation, hold time
- Orders: type (LIMIT/STOP), target price, size (USD), margin reserved, expiry, status (รอเข้า/เข้าแล้ว/ยกเลิกแล้ว)

### ประวัติการประชุม (267) — paginated
- Type: turn or wake
- Success/fail/reject stats per turn (e.g. "2 สำเร็จ · 0 ถูก reject")
- Seats participated: "6/6"
- Tokens, latency
- "เทิร์นล้มเหลว: lead_failed:time_starved" — error handling

### ผังทีม (Org Chart)
6 analysts with:
- **Hit rate** (%) + number of evaluations (e.g. 55% · 38)
- **Duty** (หน้าที่): detailed role description
- **Style** (สไตล์): specific trading/analysis rules
- **Last edited**: timestamp
- "ดู prompt เต็ม" — expandable prompt view
- "ประวัติ & คะแนน" — history link
- Analysts: มหภาค (macro), เทรนด์ (trend), news, ควอนต์ (quant), สวนฝูง (contrarian), เทคนิคอล (technical)

### ประวัติการปรับทีม (Coach/Adjustment Log)
- Type: ปรับตัวตน (adjust identity), สั่งโค้ช (coach order)
- Detailed change description
- "✓ ส่งถึงลูกทีมแล้ว" — delivery status
- Paginated (1/12)

### รีวิวของทีมนี้ (Reviews)
- สรุปสัปดาห์/สรุปเดือน — scorecards
- Metrics: PnL score, Sharpe, DD max, PF, discipline, dissent%
- Monthly target: 5-20% — tracking with ⚠️

### KB: บทเรียนของทีมนี้ (Loss Lessons) + เพลย์บุ๊กไม้กำไร (Profit Playbook)
- Loss: symbol, PnL, hold time, timestamp
- Profit: symbol, PnL, hold time, timestamp

### บัญชีเดินสะพัด (Ledger)
- Paginated transaction history (50 entries)

## 2. Data Model (inferred from UI + i18n keys)

### Team (extensions to TradeTeam)
```
{
  mandate: "contrarian",        // tdMandate — ลู่ทีม (immutable by lead)
  directive: string,            // tdDirective — เป้าสัปดาห์ (lead-editable)
  directive_at: timestamp,      // "ตั้งเมื่อ 2 วันที่แล้ว"
  gen: number,                  // tdGen — "รุ่น 1"
  lead_model: string,           // tdLead
  analyst_models: { seat: model },
  paused: boolean,              // tdPause
}
```

### Analysts (extends analyst_prompts JSON)
```
[
  {
    seat: "macro" | "trend" | "news" | "quant" | "contrarian" | "technical",
    duty: string,               // tdMissionLabel — หน้าที่
    style: string,              // สไตล์
    hit_rate_pct: number,       // computed nightly
    hit_evaluations: number,    // number of closed positions evaluated
    last_edited: timestamp,
    full_prompt: string,        // expandable
    scores: PeerScore[],        // tdPeerScores
  }
]
```

### Meetings (extends TradeTurn)
```
{
  type: "turn" | "wake",        // tdKindDaily
  seats_total: number,          // "6/6"
  decisions_made: number,       // "2 สำเร็จ"
  decisions_rejected: number,   // "0 ถูก reject"
  error: string | null,         // "lead_failed:time_starved"
}
```

### Pending Orders (new table)
```
{
  symbol, side,
  type: "LIMIT" | "STOP",
  target_price,
  size_notional,
  margin_reserved,
  sl, tp,
  status: "pending" | "filled" | "cancelled",
  expires_at,
}
```

### Coach Log (new table)
```
{
  team_id,
  analyst_seat,
  type: "coach" | "adjust",
  content: string,              // detailed change description
  delivered: boolean,
  created_at,
}
```

### Reviews (new table or computed)
```
{
  team_id,
  kind: "weekly" | "monthly",
  period_start, period_end,
  pnl_pct, pnl_score,
  sharpe, dd_max, dd_score,
  profit_factor, pf_score,
  discipline_score, dissent_pct,
  composite_score,
  rank: number, rank_total: number,
}
```

## 3. i18n Key Categories

| Category | Keys |
|---|---|
| **Team stats** | tdCapital, tdMarginUsed, tdNetPnl, tdAvgWin, tdAvgLoss, tdDDNow, tdClosedCount, tdClosedCap, tdOfCapital, tdOfEquity |
| **MANDATE** | tdMandate, tdMandateHint |
| **Charter** | tdCharter, tdCharterNone, tdDirective, tdDirectiveClear, tdDirectiveHint, tdDirectiveSave, tdDirectiveSaved |
| **Meeting history** | tdMeetingHistory, tdForceTurn, tdNextTurn, tdKindDaily, tdKindWeekly, tdKindMonthly |
| **Analysts** | tdAnalystsShort, tdPersonaBy, tdHeritage, tdGen, tdMissionLabel |
| **Peer review** | tdPeerScores, tdPeerAvg, tdPeerLowestLast, tdPeerReasons, tdPeerNoData, tdComposite |
| **Coach log** | tdCoachDelivered, tdCoachDeliveredHint, tdCoachOrderedOnly, tdCoachOrderedOnlyHint |
| **Ledger** | tdLedger, tdLlmCalls, tdCostLedgerHint, tdAge |
| **Chart** | tdChartEmpty |
| **Pause** | tdPause |

## 4. Implication for our plan

- **6 analysts** required (add `news`, `quant` to our 4)
- **MANDATE** = new field on TradeTeam (immutable by lead)
- **Constitution versioning** = `trade_constitutions` table
- **Coach log** = `trade_coach_log` table
- **Pending orders** = `trade_pending_orders` table
- **Reviews** = computed or stored per period
- **Analyst scoring** = nightly computation from closed positions
- **Hit rate** = bias accuracy vs actual outcome

All data comes through `/functions/v1/trade-admin` (auth-required — cannot inspect directly).
