# 04 — Design: Trade desk schema

Type: task
Status: open
Claimed:
Blocked by: 01

## Question

ออกแบบ DB schema สำหรับทีมเทรด (1 ทีม deepseek — multi-agent ภายใน):

1. **trade_teams**: team code, name_th/en, status, capital, equity, lead_model, constitution (JSON), weekly_kpi, weekly_target_pct, turn_interval_hours
2. **trade_turns**: turn_id, team_id, meeting_agenda, analyst_opinions (JSON), lead_decision (JSON), consensus, dissent, token_cost
3. **trade_positions**: position_id, team_id, turn_id, symbol, side, size_pct, entry_price, sl, tp, status, closed_by (reason code)
4. **trade_knowledge**: knowledge_id, team_id (null = central), type (win/loss), symbol, side, entry, exit, pnl_pct, lesson_summary, turn_id

Deliverable: SQL schema + SQLAlchemy models in `backend/app/trade_desk_service.py` (replace deleted old one)
