Type: grilling
Status: resolved

## Question

What is the exact data schema for a portfolio holding, and how is it persisted?

Nail down: the full field list per holding (ticker, shares, average cost, target allocation %, currency, others?), whether the app supports more than one portfolio at once, how watchlist/favorites entries differ from holdings, and the persistence mechanism (SQLite vs. a JSON file) given this is a single-user local app with no need for a client-server database.

## Answer

**Multiple portfolios**: supported from the start (e.g. long-term vs. speculative), via a `portfolio_id` foreign key — cheaper to build in now than to retrofit later.

**Holding schema** (one row per ticker held in a portfolio):

```
Holding
- id
- portfolio_id (FK → Portfolio)
- ticker (string, required)
- shares (float, required)
- avg_cost_usd (float, required)        // per-share average cost, USD
- target_allocation_pct (float, optional, nullable)
- created_at, updated_at
```

No per-holding currency field — all US-ticker prices are USD; THB display conversion is handled at display time (ticket 05), not stored.

**Watchlist**, kept separate from holdings (not-yet-owned tickers being tracked):

```
WatchlistItem
- id
- ticker (string, required)
- category (string, optional — e.g. "ETF", used for tab-style grouping)
- created_at
```

Adding a watchlist ticker to an actual portfolio creates a new `Holding` row; the `WatchlistItem` isn't converted/deleted automatically.

**Persistence**: SQLite (via SQLAlchemy from the FastAPI backend) — not a JSON file. Reasoning: real relational structure (Portfolio → Holding), safer concurrent writes than whole-file JSON rewrites, and straightforward FastAPI/SQLAlchemy integration.
