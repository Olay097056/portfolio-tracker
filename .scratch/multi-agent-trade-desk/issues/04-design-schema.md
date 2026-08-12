# 04 — Design: Trade desk schema

Type: task
Status: closed
Claimed: hermes/2026-08-12
Blocked by: 01

## Answer

Schema ออกแบบ + implement — commit `c48ebcc`

**Models** (SQLAlchemy, 4 tables):
- **TradeTeam**: code/capital/equity/constitution (lead_system_prompt + analyst_prompts JSON), weekly targets, turn config, LLM model
- **TradeTurn**: agenda, analyst_opinions (JSON[{seat, opinion, key_signals, tokens}]), lead_decision (JSON), consensus/dissent, token_cost, trigger type
- **TradePosition**: symbol/side/size_pct/entry/sl/tp, status, closed_by (reason code), realized/live PnL
- **TradeKnowledge**: win→team_id (team KB), loss→team_id=NULL (central KB), lesson_summary, key_signals snapshot

**Default prompts**: lead + 4 analysts (trend/technical/macro/contrarian) — Thai, JSON output format
**seed_team()**: idempotent, creates single DEEPSEEK team
**Tests**: 4 passed — full suite **527 passed**
