# 02 — Task: Frontend — Team Detail 100% match

Type: task
Status: open
Claimed:
Blocked by: 01

## Question

Rewrite TeamDetailPage to match reference 100% (14 sections):

1. **Header**: team name + status + gen + lead model + analyst count + next turn + Force Turn/Pause/Resume buttons
2. **Weekly Target**: directive text + "ตั้งเมื่อ X" + edit/save/clear
3. **Stats Cards** (2 rows × 4 cards each): Equity/P&L, Closed P&L ($X / N ไม้ / กำไรสุทธิ), Cash/Margin/Reserved, Live P&L, Max DD (peak→trough+dates), Win Rate (W/L), Avg R:R (win avg $ / loss avg $), Profit Factor, Fees/Tokens/LLM calls/Wakes
4. **Equity Chart**: SVG 30-day area chart with time toggle
5. **MANDATE**: styled section — central-mandated, read-only
6. **Constitution**: lead-written rules + version date
7. **Open Positions**: full table — entry/mark/margin/P&L/SL/TP/LIQ/age
8. **Pending Orders**: type/target/size/reserved/expiry/status
9. **Meeting History**: paginated — type (turn/wake), success/fail/reject counts, seats, tokens, latency, errors
10. **Org Chart (6 analysts)**: hit_rate% + eval count, trust bars, "ตั้งโดยหัวหน้า", duty, style, "แก้ไขล่าสุด", "ดู prompt เต็ม" expandable, "ประวัติ & คะแนน" link
11. **Coach Log**: ปรับตัวตน/สั่งโค้ช + ✓ delivery + detail
12. **Reviews**: weekly/monthly scorecards — rank, composite, PnL/Sharpe/DD/PF/วินัย
13. **KB**: loss lessons + profit playbook (2-col)
14. **Ledger**: transaction history

Deliverable: rewrite `TeamDetailPage.tsx` + test · update types/client
