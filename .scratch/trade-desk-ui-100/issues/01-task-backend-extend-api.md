# 01 — Task: Backend — extend API with all missing fields

Type: task
Status: open
Claimed: hermes/2026-08-12

## Question

Extend GET /api/trade-desk/team/{code} + GET /api/trade-desk/state with ALL fields the reference UI needs:

**Team stats**: win_rate, win_count, loss_count, avg_win, avg_loss, rr_ratio, profit_factor, max_drawdown, max_drawdown_dates, total_fees, total_tokens, total_llm_calls, wakes_today, closed_count, net_pnl, reserved_margin

**Analyst scoring**: per-analyst hit_rate_pct, hit_evaluations, trust_score, trust_history (last N evals), peer_scores[] (from peer review)

**Equity snapshots**: GET /api/trade-desk/team/{code}/equity?days=30 → [{date, equity}] — for SVG chart

**Meeting history extend**: per-turn — type (turn/wake), success_count, fail_count, reject_count, seats_total, seats_participated, latency_s, error (nullable)

**Weekly directive**: CRUD — POST/PUT/DELETE /api/trade-desk/team/{code}/directive

**Coach log extend**: delivered status update endpoint

**Reviews**: compute or store weekly/monthly scorecards — GET /api/trade-desk/team/{code}/reviews

Deliverable: updated trade_desk_service, router, tests, Supabase migration
