# backend/app/main.py
from fastapi import FastAPI

from app.database import Base, engine

app = FastAPI(title="Portfolio Tracker API")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}
