# Decision: ZL Databento Raw Store Moves to Local DuckDB

**Date:** 2026-05-18

## Decision

Raw ZL Databento hourly chart history is stored in local DuckDB under the project folder:

- File: `data/duckdb/zinc_fusion_raw.duckdb`
- Raw table: `raw.databento_zl_ohlcv_1h`
- Refresh entrypoint: `python -m fusion.zl_duckdb_pipeline refresh --promote`

Supabase remains the frontend serving layer for the chart:

- `mkt.price_1h`
- `mkt.price_1d`
- `mkt.latest_price`

## Why

The chart freshness failure was not a chart-rendering problem. The Databento ingest path treated usable HTTP `206` NDJSON responses as failed runs, leaving `mkt.price_1h` pinned behind a stale cursor while daily rollup kept reprocessing old hourly bars.

Keeping raw Databento recovery history in DuckDB gives the project a local, inspectable, durable raw-data store that can overlap-fetch, dedupe, and replay promotions without requiring a Supabase migration for every ingest repair.

The project volume may not support DuckDB file locks. The refresh pipeline must therefore support a staged write path: copy the project-folder DuckDB file to a temporary lock-capable location, perform writes there, close/checkpoint it, then copy the closed DuckDB file back into `data/duckdb/`.

## Boundaries

- Follow-up hardening may use Supabase migration(s) that keep chart serving on Supabase while preserving DuckDB as raw recovery/training storage.
- No `supabase db push` is required unless explicitly approved.
- No Vercel cron route is introduced.
- No local Supabase is introduced.
- No model training is authorized by this decision.
- DuckDB is raw chart-data storage only; Supabase remains the serving surface that frontend API routes read.
- Temporary working copies are runtime implementation detail only; the durable raw store remains under `data/duckdb/`.

## Verification Contract

The active Python regression must cover:

- Databento HTTP `206` NDJSON parses into hourly bars.
- DuckDB stores hourly bars under the raw relation.
- The staged-workspace fallback copies rows back to the project-folder DuckDB file.
- UTC daily rollup is stable and does not use local timezone day boundaries.
- Supabase promotion boundary targets only `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`.
