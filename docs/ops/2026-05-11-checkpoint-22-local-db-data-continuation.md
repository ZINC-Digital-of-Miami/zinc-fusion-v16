# Checkpoint 22 - Local DB/Data Continuation

Date: 2026-05-11
Repository: `/Volumes/Satechi Hub/ZINC-FUSION-V16`
Status: OPEN - LOCAL DATA REMEDIATION IN PROGRESS

## Starting State

`main` is clean and aligned to `origin/main` at `47e418c`.

Checkpoint 21 corrected the readiness gate:
- local PostgreSQL `localhost/fusion` is the AG readiness source;
- all local hourly symbols are in scope by default;
- all local raw FRED series are in scope by default;
- options are excluded unless explicitly enabled;
- active local training matrix and target tables must each meet `500,000` rows by default;
- dry-run readiness runs the real read-only checks.

## Current Blockers To Work

1. Active `training.matrix_1d` and `training.matrix_targets_1d` have only `6,439` rows.
2. Local raw hourly market data has enough row mass (`4,967,276` rows across `84` symbols) but is stale versus the 72-hour readiness freshness window.
3. Local daily/hourly symbol coverage does not match.
4. Local raw hourly OHLC integrity has violations that must not leak into the model surface.
5. Local weather and alt/econ source tables are stale.
6. Local `alt.profarmer_news` is missing, so cloud-only ProFarmer is not AG-ready local source truth.

## Work Completed In This Checkpoint

### Local Cloud Mirror

Added a local-only cloud source mirror path:

- `python/fusion/sync_cloud_sources_to_local.py`

The script reads cloud Supabase and writes only to local PostgreSQL `localhost/fusion`. It refuses non-local database URLs and records the run in `ops.local_cloud_sync_manifest`.

Executed local mirror run:

- run_id: `local-cloud-sync-20260511T022244Z`
- no cloud writes
- no model training

Mirrored local row counts:

| Local table | Rows | Range |
| --- | ---: | --- |
| `mkt.price_1h` | `309,369` | `2010-06-06 18:00:00-05` to `2026-05-10 20:00:00-05` |
| `mkt.price_1d` | `24,350` | `2000-03-14 18:00:00-06` to `2026-05-10 19:00:00-05` |
| `econ.weather_1d` | `659,884` | `2005-01-01` to `2026-05-09` |
| `alt.profarmer_news` | `8,492` | `2021-05-24 19:00:00-05` to `2026-05-08 13:55:55.647-05` |
| `alt.news_events` | `1,153` | `1999-12-31 18:00:00-06` to `2026-05-07 09:00:00-05` |
| `alt.legislation_1d` | `2,683` | `1999-12-31 18:00:00-06` to `2026-05-06 19:00:00-05` |
| `alt.executive_actions` | `10` | `2026-04-21 13:49:23-05` to `2026-05-05 11:52:13-05` |

### Readiness Gate Correction

Updated `python/fusion/training_readiness_gate.py` so the gate recognizes normalized local mirrors:

- `econ.weather_1d`
- `alt.profarmer_news`
- `alt.news_events`
- `alt.legislation_1d`
- `alt.fed_speeches`
- `alt.executive_actions`

Raw alt/weather tables remain supporting inventory, but stale raw alt tables no longer block when current normalized `alt.*` mirrors are present. ProFarmer remains a separate mandatory check.

Post-mirror readiness dry-run now passes:

- `fred_local_universe`
- `weather_local_universe`
- `alt_local_sources`
- `profarmer_news`
- `options_data` excluded by policy (`TRAINING_REQUIRE_OPTIONS=0`)

### Databento Key/Local File Findings

Databento/FRED key presence was checked without printing secrets:

- Supabase Vault contains `databento_api_key`
- Supabase Vault contains `databento_api_key_v2`
- Supabase Vault contains `fred_api_key`
- Vercel env list does not expose Databento/FRED names

Local files include current May 2026 Databento batch shards, but the current local no-cost file coverage found so far is not the full 84-symbol hourly universe:

- `Data/GLBX-20260506-7BPL6SK86F/` has hourly shards for the parent query `ZM.FUT,ZL.FUT,HE.FUT,ZS.FUT,AW.FUT,CPO.FUT,RSO.FUT,SOM.FUT,BCE.OPT`.
- `Data/GLBX-20260508-4HPF5RCNKG/` has daily shards for `LNE.OPT,TN.FUT,ZB.FUT,ZF.FUT,ZN.FUT,ZQ.FUT,ZT.FUT`.
- Existing local historical parquet/raw hourly data has `4,967,276` rows across `84` symbols, but its max timestamp is still `2025-12-15 23:00:00`.

The Databento API key exists in Vault, but no external Databento pull was started in this checkpoint because that can create vendor usage/cost and needs an explicit backfill decision.

## Current Readiness Dry-Run After Local Mirror

The active readiness dry-run remains blocked, but the blocker set is narrower and accurate:

1. Local matrix artifact has `6,439` rows, below `500,000`.
2. `raw.databento_ohlcv_1h` is stale: latest age about `3,507` hours, above the 72-hour window.
3. `raw.databento_ohlcv_1d` is missing or stale for symbols in the 84-symbol hourly scope.
4. `raw.databento_ohlcv_1h` is stale for the 84-symbol hourly scope.
5. `raw.databento_ohlcv_1h` has `7,706` OHLC integrity violations.
6. `training.matrix_1d` has `6,439` rows, below `500,000`.
7. `training.matrix_targets_1d` has `6,439` rows, below `500,000`.

## Structural Finding

The old single daily matrix contract cannot satisfy the corrected `500,000` row floor as currently implemented.

Current local training tables are keyed by `trade_date` only:

- `training.matrix_1d.trade_date DATE NOT NULL UNIQUE`
- `training.matrix_targets_1d.trade_date DATE PRIMARY KEY`

That schema caps the active matrix to one row per date. A production-scale AG source using all symbols must become a local-only symbol-time panel with a stable key such as `(symbol, bucket_ts)` or an equivalent `sample_id`. Without that change, any claim that the `500,000` row floor can pass is false.

## Non-Negotiables

- No Docker.
- No local Supabase.
- No model training.
- No cloud promotion.
- Local PostgreSQL writes are allowed only for local AG staging/data remediation.
- Cloud reads are allowed for backfilling local AG staging if credentials are already available.

## Continuation Plan

1. Re-inventory local schemas/tables and exact blocker counts.
2. Identify which blocker data can be backfilled from cloud Supabase into local PostgreSQL.
3. Add a local-only loader/backfill path where the repo has no safe existing command.
4. Build toward a production-scale local AG matrix using all-symbol local source data without mutating cloud tables.
5. Re-run readiness dry-run and record the remaining blockers.
