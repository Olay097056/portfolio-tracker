# AGENTS.md

Conventions for any AI agent working in this repository.

## Git

- **This repo is PUBLIC on GitHub** (`origin` → `github.com/Olay097056/portfolio-tracker`). Anything pushed is visible to the world immediately.
- **Never `git push` unless the human explicitly asks for it in that message.** Committing locally is fine and expected; publishing is a separate decision that is always theirs.
- **Never `git add -A` / `git add .` blindly.** Stage named paths. If a bulk add is unavoidable, run `git status` first and read what is about to be staged.
- **Never commit secrets.** `.env*`, API keys (DEEPSEEK / FINNHUB / FMP), `PORTFOLIO_DB_URL`, Vercel/Supabase tokens, and `portfolio.db` are gitignored — do not add exceptions, do not inline a real value into code or docs "temporarily".
- **Do not put infrastructure identifiers in public docs** — Supabase project refs, internal URLs, database hostnames. The live app URL is fine; it is meant to be public.
- Commit author identity comes from global git config (`NW <olay097056@gmail.com>`). Do not override `user.name` / `user.email` per-repo or per-commit.
- Do not rewrite published history (`rebase`, `commit --amend`, `push --force`) on commits that already exist on `origin/main`.

## Code

- Architecture decisions live in `docs/adr/`. Read them before changing anything they cover, and do not silently reverse one — if a change requires it, say so explicitly and write a new ADR.
- **ADR-0005 is load-bearing:** scanners present raw signals as separate sortable columns and must never fold them into a composite score. The word *score* is reserved for weightings validated against outcomes.
- Tests are co-located with the code they cover (`*.test.tsx` next to the component). New behaviour ships with a test.
- Run tests before claiming work is done: `pytest backend/tests -q` and `npm test` in `frontend/`.

## Docs

- `README.md` and `README.th.md` are kept in sync. Updating one means updating the other.
