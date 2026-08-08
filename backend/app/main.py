from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, engine
from app.routers import ai_narrative, compare, dca, fear_greed, fx, holdings, investors, macro, market, market_data, models, portfolios, prices, screener, signals, watchlist

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # `unique=True` on WatchlistItem.ticker (models.py) only reaches databases created fresh
    # by create_all above. Existing on-disk databases already have the watchlist_items table
    # without that constraint, and create_all never alters existing tables — so backfill it
    # explicitly here for upgrades from before this constraint existed.
    with engine.connect() as conn:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_watchlist_items_ticker ON watchlist_items (ticker)"))
        # trading_signals gained a sparkline column after the first deployment;
        # SQLite ALTER TABLE ADD COLUMN is idempotent only if the column is
        # missing, so check the pragma first (create_all never alters existing tables).
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(trading_signals)")).fetchall()]
        if "sparkline" not in cols:
            conn.execute(text("ALTER TABLE trading_signals ADD COLUMN sparkline TEXT"))
        conn.commit()
    yield


app = FastAPI(title="Portfolio Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Both hostnames need to be allowed: on this Windows host "localhost"
    # resolves to the IPv6 loopback (::1) first and Docker Desktop's port
    # mapping doesn't answer there, so the frontend is accessed via
    # 127.0.0.1 instead -- which is also the browser Origin the API sees.
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)
app.include_router(prices.router)
app.include_router(fx.router)
app.include_router(market_data.router)
app.include_router(market.router)
app.include_router(screener.router)
app.include_router(dca.router)
app.include_router(ai_narrative.router)
app.include_router(investors.router)
app.include_router(compare.router)
app.include_router(fear_greed.router)
app.include_router(macro.router)
app.include_router(models.router)
app.include_router(signals.router)


@app.get("/health")
def health():
    return {"status": "ok"}
