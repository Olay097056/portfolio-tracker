# 07 — Task: Backend turn engine

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 04, 05, 06

## Answer

Turn engine + router — commit `3f50628`

**Core**:
- `_build_base_context()`: macro + models + sentiment + news
- `_build_seat_context()`: per-analyst context with Hyperliquid prices
- `run_turn()`: parallel 4 analysts (ThreadPoolExecutor) → lead → DB
- `_parse_lead_json()`: robust extraction (markdown wrapping)
- `run_due_turns()`: check due + daily cap + scheduled trigger
- `get_state()`: full state (teams/positions/turns)

**Router**: POST /api/trade-desk/turn · GET /api/trade-desk/state
**Tests**: 4 passed (empty, seeded, 404, mock turn with mocked LLM)
**Suite**: **538 passed**
