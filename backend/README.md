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

## Running

```bash
uvicorn app.main:app --reload
```

## Testing

```bash
pytest
```
