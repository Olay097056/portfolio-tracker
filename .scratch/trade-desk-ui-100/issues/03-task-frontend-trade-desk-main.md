# 03 — Task: Frontend — Trade Desk Main 100% match

Type: task
Status: open
Claimed:
Blocked by: 01

## Question

Rewrite TradeDeskDashboard main page to match reference 100%:

1. **Header**: "ห้องเทรดจำลอง 9 ทีม AI..." → adapted to "1 ทีม AI (DeepSeek)" — same layout
2. **Team Card** (full detail): rank badge, team name+status, equity chart mini-sparkline, P&L%, margin/cash, **MTD** (current vs 5-20%) + **Weekly** (current vs target), **turn stats** (✓wins ✗losses ⏳pending 📌flagged), next turn countdown with live timer
3. **Open Positions All Teams**: table with team column, entry/mark/margin/P&L/SL/TP/LIQ/age
4. **Available Markets** (122 → 200+): category tabs (คริปโต/หุ้น/MACRO/FX) with count (20/40 style), **TA signals column** (bull trend+12, golden cross+8 icons + scores), **TIER column** (1/2/3)
5. **Competition Chart** (simplified for 1 team): equity sparkline
6. **Turn stats summary**: total calls, cost today

Deliverable: rewrite `TradeDeskDashboard.tsx` + test · update types/client
