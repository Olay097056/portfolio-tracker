from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import Base, engine
from app.routers import holdings, portfolios, watchlist


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Portfolio Tracker API", lifespan=lifespan)
app.include_router(portfolios.router)
app.include_router(holdings.router)
app.include_router(watchlist.router)


@app.get("/health")
def health():
    return {"status": "ok"}
