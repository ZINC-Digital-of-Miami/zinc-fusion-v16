# Recovery Runbook

Procedures for the failure modes that have actually occurred. Written 2026-06-11
after a 10-day silent outage (paused Supabase) overlapped a 16-day-stale
production deploy (dead GitHub→Vercel link).

## 1. Supabase project paused (site loads but no data; SQL times out)

Symptoms: every page renders its empty state; `/api/health` shows
`dbReachable: false`; MCP/SQL queries time out; `list_projects` shows
status `INACTIVE`. Free-tier projects auto-pause after ~7 idle days
(decision CP-1 in the 2026-06-11 pivot plan tracks the plan upgrade).

1. Restore from the Supabase dashboard (project `iptjkulvyhpddigovssd`) or the
   Supabase MCP `restore_project`. Takes ~1–3 minutes to `ACTIVE_HEALTHY`.
2. **Do not trust `pg_stat_user_tables.n_live_tup` after a restore — it resets
   to 0.** Use `COUNT(*)` for any row-existence claim.
3. Run the data catch-up, in order:
   - `python3 scripts/sync_vegas_glide_to_supabase.py`
   - `python3 scripts/fill_site_with_trusted_data.py`
   - `SELECT ops.ingest_trusted_site_fill();` (the weekly cron also self-heals
     the following Monday 11:17 UTC)
4. Verify: `curl https://zinc-fusion-v16.vercel.app/api/health` →
   `ok: true, dbReachable: true`; dashboard risk-factors `as_of_date` = today.
5. The daily heartbeat workflow (`.github/workflows/heartbeat.yml`) should have
   caught this — if it did not, check whether its schedule is enabled
   (GitHub disables cron workflows after 60 days of repo inactivity).

## 2. Vercel production stale (pushes don't deploy)

Symptoms: `vercel ls zinc-fusion-v16` shows the newest production deployment
older than the newest commit; GitHub deployment records (`gh api
repos/ZINC-Digital-of-Miami/zinc-fusion-v16/deployments`) stop at an old SHA.

Known root cause (June 2026): the repo moved from `zincdigitalofmiami/` to the
`ZINC-Digital-of-Miami` org on ~May 26; git pushes follow the redirect but the
Vercel GitHub App webhook does not.

1. Preferred fix: install/authorize the Vercel GitHub App on the
   `ZINC-Digital-of-Miami` org (dashboard → Project Settings → Git), then
   `vercel git connect https://github.com/ZINC-Digital-of-Miami/zinc-fusion-v16 --yes`.
2. Interim deploy from this machine: `vercel deploy --prod --yes`.
   If it hangs silently at "Deploying…", the upload file tree has bloated —
   check `.vercelignore` covers `.venv-ag311/`, `.next-local/`, `.kilo/`,
   `models/`, `logs/`, `/data/` (78k-file uploads die without an error).
3. Verify the alias flipped: `vercel inspect zinc-fusion-v16.vercel.app`
   (created date must be now), and the live `ai.generatedAt` matches the
   latest snapshot commit.

## 3. Stale chart bars (price data frozen)

Until pivot-plan Phase 3 lands, `mkt.price_1h/price_1d` move only when the
local DuckDB promote runs:

```bash
python -m fusion.zl_duckdb_pipeline refresh --promote
```

Databento is frozen as a sunk asset (locked decision L2, 2026-06-11): no new
Databento pulls. Go-forward bars come from financialdata.net/Yahoo per the
pivot plan; after Phase 3, chart freshness recovers via pg_cron inside
Supabase and this section becomes training-lane-only.

## 4. Git push blocked with "[BLOCKED] wrong origin"

The local `.git/hooks/pre-push` hook pins the canonical origin URL. After the
org move the canonical URL is
`https://github.com/ZINC-Digital-of-Miami/zinc-fusion-v16.git` — update the
`expected=` line in the hook if the repo ever moves again.
