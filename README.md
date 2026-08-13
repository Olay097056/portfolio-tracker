*English · [ภาษาไทย](README.th.md)*

# Portfolio Tracker

FastAPI + SQLAlchemy backend, React + TypeScript + Vite frontend. See
`backend/README.md` for backend-specific details (environment variables,
running tests).

## Running it

### Option C — Production (Vercel + Supabase) — *what runs in prod today*

The live app is deployed on Vercel (static frontend + serverless API) with a
Supabase Postgres database, and the background worker runs on Supabase
pg_cron. **This is the production environment** — the Docker/start-app paths
below are for development only.

- **App + API**: https://portfolio-tracker-taupe-two.vercel.app
- **Database**: Supabase Postgres
- **Worker**: pg_cron every 10 min → `POST /api/jobs/run-due-turns` (job_runs
  table = overlap lock; wedged runs > 20 min are taken over automatically)

Deploying (requires `~/.scratch/vercel-supabase/secrets.env` with
`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN` — gitignored):

```bash
# 1. build the frontend against the prod API
cd frontend && VITE_API_BASE_URL=https://portfolio-tracker-taupe-two.vercel.app npm run build && cd ..

# 2. deploy everything (vercel.json routes /api/* + bare prefixes -> api/index.py)
vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

Schema migrations against Supabase (from `backend/`):

```bash
PORTFOLIO_DB_URL=<supabase pooler URL> python -m alembic upgrade head
```

Secrets live in Vercel env (DEEPSEEK_API_KEY / FINNHUB_API_KEY / FMP_API_KEY /
PORTFOLIO_DB_URL) — never committed. See `.scratch/vercel-supabase/` for the
full migration plan/tickets and `docs/` for research & specs.

### Option A — Docker (dev only; source bind-mounted, hot reload)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up
```

- App: http://localhost:5173
- API: http://localhost:8000

This is a **dev-mode** setup: source is bind-mounted from your machine into
the containers, so editing code hot-reloads exactly like running natively
(`uvicorn --reload` and Vite's dev server). `backend/portfolio.db` and
`backend/.env` live on your machine as normal — the containers just read and
write them through the mount, so nothing is lost between runs.

First run builds the images (a couple of minutes). After changing
`backend/requirements.txt` or `frontend/package.json`, rebuild with:

```bash
docker compose up --build
```

Stop with `docker compose down` (or Ctrl+C, then `docker compose down` to
remove the containers).

> **Note (2026-08-11):** Docker no longer runs production. It was
> decommissioned after the Vercel+Supabase cutover (plan ticket 09) and is
> kept purely as a dev environment.

### Option B — Native (Windows convenience script, dev only)

Double-click [`start-app.bat`](start-app.bat) at the repo root — it activates
the backend's `.venv`, starts `uvicorn`, starts `npm run dev`, and opens the
app in your browser. See `backend/README.md` for manual setup steps if you'd
rather run each piece yourself.
