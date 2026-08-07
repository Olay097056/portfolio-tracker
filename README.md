# Portfolio Tracker

FastAPI + SQLAlchemy backend, React + TypeScript + Vite frontend. See
`backend/README.md` for backend-specific details (environment variables,
running tests).

## Running it

### Option A — Docker (recommended, no local Python/Node setup needed)

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

### Option B — Native (Windows convenience script)

Double-click [`start-app.bat`](start-app.bat) at the repo root — it activates
the backend's `.venv`, starts `uvicorn`, starts `npm run dev`, and opens the
app in your browser. See `backend/README.md` for manual setup steps if you'd
rather run each piece yourself.
