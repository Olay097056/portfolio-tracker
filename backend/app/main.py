from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import Base, engine
from app.routers import ai_narrative, compare, dca, fx, holdings, investors, market, market_data, portfolios, prices, screener, watchlist

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # `unique=True` on WatchlistItem.ticker (models.py) only reaches databases created fresh
    # by create_all above. Existing on-disk databases already have the watchlist_items table
    # without that constraint, and create_all never alters existing tables — so backfill it
    # explicitly here for upgrades from before this constraint existed.
    with engine.connect() as conn:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_watchlist_items_ticker ON watchlist_items (ticker)"))
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


@app.get("/health")
def health():
    return {"status": "ok"}
