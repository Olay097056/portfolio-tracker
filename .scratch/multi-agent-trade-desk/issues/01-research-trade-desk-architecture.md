# 01 — Research: Dig reference trade desk architecture

Type: research
Status: closed
Claimed: hermes/2026-08-11

## Question

Reference ทีมเทรดทำงานยังไง? ต้อง dig โค้ด reference (JS bundle + edge functions) เพื่อเข้าใจ: multi-agent flow, prompts, KB, peer review, order modification, price feeds, turn scheduling, state management.

## Answer

Deliverable: `docs/research/multi-agent-trade-desk-reference-2026-08-11.md` (raw evidence + analysis)

### Key findings:
- **9 ทีม 9 LLM** ผ่าน OpenRouter — แต่ละทีมมี: lead_model + analysts[] + constitution + weekly KPI
- **Multi-agent flow**: lead ตั้งวาระ → 4 analysts (trend/tech/macro/contrarian) รับ context — แต่ละคนเสนอ opinion → lead สรุป consensus/dissent → เคาะออเดอร์
- **Context data**: 12 types (boardroom, candles, CME, macro, news, phase, quant, sentiment, TA, TA daily, symbol news, general data)
- **122 ตลาด** (Hyperliquid): crypto 40, stocks 65, macro 15, FX 2
- **Edge function**: `/functions/v1/trade-admin` (auth-required — RLS)
- **KB**: คลังทีม (ไม้กำไร) + คลังกลาง (ไม้ขาดทุน) — close reason codes
- **Autonomous SL/TP**: AI สั่งแก้ order ได้เอง — ไม่มี trailing stop logic ตายตัว
- **Peer review**: analyst scores → lead ปรับ prompt — `tdCharterUpdated`
- **Token cost estimate** (1 ทีม deepseek): ~2,800 tokens/turn ≈ $0.0004/turn

### ยังเข้าไม่ถึง (RLS):
- Schema เต็มของ trade_teams, trade_turns, trade_knowledge
- Prompt templates จริง (lead vs analyst personas)
- trade-admin response shape
