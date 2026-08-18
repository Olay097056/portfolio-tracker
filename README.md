*English · [ภาษาไทย](README.th.md)*

# Portfolio Tracker

A web app for running a US stock and ETF portfolio — holdings and live pricing,
scanners over a watchlist, forward-looking planning calculators, and an AI
analyst layer — built around one rule: **never show a number the app can't
account for.**

### ▶ [Open the live app](https://portfolio-tracker-taupe-two.vercel.app)

Running in production on Vercel + Supabase — real market data, not a mock.

## The idea

Most portfolio tools answer "how am I doing?" with a single confident-looking
score. This one started that way too — and then the score was measured against
actual outcomes and turned out to have **no predictive validity at all**. Rather
than re-weighting it until it looked better, it was thrown out and replaced with
two things shown side by side:

- a **logistic regression fitted on historical outcomes**
  (`backend/app/backtest/model_fit.py`), which reports its own accuracy openly,
  including when that accuracy is unimpressive; and
- an **LLM analyst** that writes a plain-language read of the same position.

Two independent opinions the user can disagree with beats one authoritative
number that was never checked.

That principle is enforced structurally, not by good intentions. Scanners
present **raw signals** — one measurement, one traceable source, one sortable
column — and are contractually forbidden from folding them into a composite
score (`docs/adr/0005-no-composite-scores-or-subjective-tags-in-scanners.md`).
The project's glossary goes as far as banning the word *score* for anything
lacking a validated weighting.

## What's in it

- **Portfolio and holdings** — multi-portfolio, live pricing, allocation donut,
  per-holding P&L, TradingView charts
- **Watchlist scanners** — momentum, pre-squeeze (volatility contraction against
  a ticker's *own* history, not against other tickers), dividend ranking,
  market breadth, trending tickers
- **Planning calculators** — DCA (both the average-cost recalculation and the
  multi-year compound projection), position sizing, stress test, THB-native
  where the user actually thinks in baht
- **AI analyst layer** — narrative reads, pattern-history lookup ("what happened
  the last N times this setup appeared"), earnings-proximity warnings
- **Macro and market context** — fear/greed, FX, CME, country-level and
  macroeconomic services
- **Background worker** — scheduled jobs with an overlap lock and automatic
  takeover of wedged runs

## Engineering notes

- **24 backend services** behind a FastAPI app, deployed as serverless functions
- **132 test files** (75 frontend, 57 backend), co-located with the code they cover
- **7 ADRs** in `docs/adr/` recording the decisions that future changes must not
  silently reverse
- Deployed on Vercel + Supabase Postgres, with the worker on `pg_cron`

## Design system

Uses **HyperUI** (hyperui.dev) as the governing design language — light-first
gray surfaces, semantic color tokens, flat cards (no glass/glow). The frontend
ships with a **light / dark toggle** (persisted in `localStorage` + cookie, no
flash of wrong theme on load). Token mapping and porting notes live in
`docs/design/hyperui-v2-tokens.md`; the same system was first applied to
`switch-wr-tool`.

## Stack

FastAPI + SQLAlchemy + Alembic on the backend; React + TypeScript + Vite on the
frontend; Postgres (Supabase) in production, SQLite for local development. See
`backend/README.md` for backend-specific details (environment variables, running
tests).

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
