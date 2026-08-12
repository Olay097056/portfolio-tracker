# Map — Trade Desk UI 100% Match (main page + team detail)

## Destination

Trade desk pages เหมือน reference 100%:
- **หน้า Main** (`/trade-desk`): 9 team cards, competition chart, monthly ranking, open positions all teams, market table with TA signals + TIER
- **หน้า Team Detail** (`/trade-desk/DEEPSEEK`): header stats 15 fields, equity chart 30d, MANDATE+constitution+weekly target, meeting history paginated with stats, org chart 6 analysts with hit rates+trust bars+full prompt, coach log with delivery, reviews scorecards, KB, ledger

## Notes

- **Frontend**: NO Tailwind, inline style + shared INK palette
- **Backend**: extend GET /api/trade-desk/team/{code} + GET /api/trade-desk/state with missing fields
- **Data**: 1 team (DEEPSEEK) — main page simplifies to 1-team view but with all reference data density
- **Tracker**: local-markdown (`.scratch/trade-desk-ui-100/`)

## Decisions so far

<!-- empty — new map -->

## Not yet specified

- TA signals algorithm (bull trend+12, golden cross+8...)
- TIER calculation (1/2/3)
- Trust bars / peer scoring algorithm
- Equity chart data resolution (daily snapshots?)

## Out of scope

- 9 teams (1 team DEEPSEEK ตัดสินแล้ว)
- Real Hyperliquid order execution
- Telegram bot
