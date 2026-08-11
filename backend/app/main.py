from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import ai_narrative, banking, boardroom, boardroom_signals, compare, countries, dca, fear_greed, fx, holdings, investors, jobs, macro, market, market_data, models, news, portfolios, prices, screener, signals, trade_desk, watchlist

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema management moved to Alembic migrations (see migrations/ — vercel-supabase plan
    # ticket 05). Deploys run `alembic upgrade head`; for local SQLite dev we keep create_all
    # so a fresh file still boots without a manual migration step. Postgres (prod) schema is
    # created/upgraded exclusively by Alembic.
    if engine.url.get_backend_name() == "sqlite":
        Base.metadata.create_all(bind=engine)
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
app.include_router(news.router)
app.include_router(banking.router)
app.include_router(countries.router)
app.include_router(signals.router)
app.include_router(boardroom.router)
app.include_router(boardroom_signals.router)
app.include_router(trade_desk.router)
app.include_router(jobs.router)


@app.get("/health")
def health():
    return {"status": "ok"}
