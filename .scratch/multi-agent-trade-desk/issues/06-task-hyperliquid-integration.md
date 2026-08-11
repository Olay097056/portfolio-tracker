# 06 — Task: Hyperliquid price feed integration

Type: task
Status: open
Claimed:
Blocked by: 01

## Question

เชื่อมต่อ Hyperliquid API สำหรับ 122 ตลาด (เหมือน reference):

1. **API endpoint**: Hyperliquid info + perp metadata — `https://api.hyperliquid.xyz/info`
2. **Market discovery**: ดึงรายชื่อตลาดทั้งหมด → กรองเฉพาะ crypto/stocks/macro/FX → แยก category
3. **Price feed**: real-time prices via WebSocket หรือ REST polling (ขั้นต่ำ: REST `/info` + L2 snapshot)
4. **TA signals**: implement basic TA (MA crossover, trend detection, pullback)
5. **Cache**: TTL 30-60s (Hyperliquid rate limit generous — but cache anyway)
6. **Mock execution**: สำหรับ dev — simulate order placement/fill (prod: real Hyperliquid orders ต้องมี wallet — out of scope?)

Deliverable: `backend/app/hyperliquid_service.py` — price feed + market list + TA signals
