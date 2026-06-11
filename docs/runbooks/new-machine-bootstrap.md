# New-Machine Bootstrap

What a fresh workstation needs before V16 scripts and builds run. Written
2026-06-11 (the previous setup silently depended on the V15 sibling repo and
one specific external drive).

## 1. Clone and path

```bash
git clone https://github.com/ZINC-Digital-of-Miami/zinc-fusion-v16.git
```

`AGENTS.md` pins the canonical path on the original workstation as
`/Volumes/Satechi Hub/ZINC-FUSION-V16`. On any other machine, state the active
path explicitly at session start (AGENTS.md startup rule 3).

## 2. Node / frontend

```bash
npm ci
npm run lint && npm run build   # must pass clean
```

## 3. Python

Python 3.12+. Script dependencies: `psycopg2-binary`, `requests`
(plus `duckdb` for the training lane under `python/`).

## 4. Environment (.env.local)

Copy `.env.example` → `.env.local` and fill it. Sources of truth:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / anon key | Vercel env (`vercel env pull`) or Supabase dashboard |
| `POSTGRES_URL_NON_POOLING` (or `DATABASE_URL`) | Supabase dashboard → Database → direct connection (port 5432) |
| `GLIDE_BEARER_TOKEN` | Glide app settings (read-only token; V16 keeps its own copy — there is no V15 fallback anymore) |
| `FRED_API_KEY` | free at fred.stlouisfed.org |
| `FINANCIALDATA_API_KEY` | financialdata.net dashboard (subscription must be active) |

`.env.local` is gitignored; never commit real values.

## 5. Git hooks

```bash
git config core.hooksPath hooks
```

(`hooks/` is tracked: pre-commit runs the fusion guard; pre-push pins the
canonical origin URL.)

## 6. Local data stores (training lane only)

- `data/duckdb/zinc_fusion_raw.duckdb` is the gitignored Databento raw store
  (frozen asset, locked decision L2 2026-06-11). Restore it from the original
  workstation or external-drive backup if training-lane work is needed; the
  serving site does not depend on it after pivot-plan Phase 3.

## 7. Smoke test

```bash
python3 -m unittest discover -s scripts/tests          # contract tests
python3 scripts/sync_vegas_glide_to_supabase.py        # Glide sync end-to-end
curl -s https://zinc-fusion-v16.vercel.app/api/health  # live site
```
