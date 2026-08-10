# Portfolio Tracker — backend

FastAPI + SQLAlchemy backend, SQLite database (`portfolio.db`).

## Setup

```bash
python -m venv .venv
.venv/Scripts/activate  # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
```

## Environment variables

These are optional, plain OS environment variables — the app does not load `.env` files
automatically. See `.env.example` for the full list. Set them in your shell before running
the server, e.g.:

```powershell
$env:TWELVE_DATA_API_KEY = "your-key"
$env:FMP_API_KEY = "your-key"
```

```bash
export TWELVE_DATA_API_KEY=your-key
export FMP_API_KEY=your-key
```

| Variable              | Used by                                    | Effect when unset                                          |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `TWELVE_DATA_API_KEY` | `app/price_service.py`                     | Price/FX lookups return null; features degrade to "Unavailable" |
| `FMP_API_KEY`         | `app/trending_service.py` (Trending Stocks) | `GET /market/trending` reports `api_key_configured: false`, and the tab explains what to set |
| `FINNHUB_API_KEY`     | `scripts/refresh_screener.py` (standalone CLI, loads `backend/.env` itself — see script docstring) | Stock Screener falls back to static demo data (51 stocks) instead of the full live universe |
| `PORTFOLIO_DB_URL`    | `app/database.py` (main SQLAlchemy engine)  | Defaults to `sqlite:///./portfolio.db`, relative to the working directory |
| `PORTFOLIO_DATA_DIR`  | `app/country_ai_service.py` (its own engine for `bondcrisis.db`) | Defaults to `backend/data/` |

## Running

```bash
uvicorn app.main:app --reload
```

## Testing

```bash
pytest
```

`tests/conftest.py` points `PORTFOLIO_DB_URL` and `PORTFOLIO_DATA_DIR` at a throwaway
temp directory before importing anything from `app`, so a test run never reads or writes
`portfolio.db` or `data/bondcrisis.db`. Several test modules use `SessionLocal` directly
(seeding and clearing rows the API exposes no endpoint for) and would otherwise hit real
data — set both variables the same way if you add a module that opens its own engine.
