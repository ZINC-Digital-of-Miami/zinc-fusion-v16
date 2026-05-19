# V16 Data Contracts (Weekly Batch Pivot - 2026-05-07)

## Core Market Contracts (High-Frequency Path Retained)
- `mkt.price_1h`: bounded hourly OHLCV serving cache for chart freshness.
- `mkt.price_1d`: daily OHLCV serving table rolled from the hourly path.
- `mkt.latest_price`: most recent price for live status.
- `forecasts.target_zones`: P30/P50/P70 horizontal levels.

### ZL Databento Raw Store Boundary (Locked 2026-05-18, Updated 2026-05-18)
- Raw ZL Databento hourly history for AG/training is stored in local DuckDB at `data/duckdb/zinc_fusion_raw.duckdb`.
- DuckDB relation `raw.databento_zl_ohlcv_1h` is the raw recovery table for Databento `ohlcv-1h` records.
- On filesystems that do not support DuckDB file locks, the refresh writes through a temporary lock-capable working copy and copies the closed DuckDB file back to `data/duckdb/zinc_fusion_raw.duckdb`.
- Supabase `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price` are the only active chart-serving tables read by frontend API routes.
- Supabase must not store deep ZL intraday history. `mkt.price_1h` is a bounded serving cache, `mkt.price_1d` is daily-only, and `mkt.latest_price` is one current row per symbol.
- Supabase `mkt.price_15m` and `mkt.price_1m` are retired from the active chart path. They must have no route dependency, no writer, and no schedule unless a new approved migration reverses this decision.
- Daily chart rows are filled from the DuckDB/Python 1h promotion path, not from finer Supabase intraday tables.
- Supabase-native `ingest_zl_intraday()` and `rollup_zl_daily()` are obsolete for ZL chart freshness and must remain unscheduled/revoked; they are not active serving writers.
- `python -m fusion.zl_duckdb_pipeline refresh --promote` is the raw-store recovery and replay path into Supabase serving tables, including Databento HTTP `200` and `206` NDJSON payload handling.

## Weekly Batch Contracts (Reduced Source Surface)
- Non-price market, macro, supply, and alternative source ingestion runs in weekly batch windows.
- Active source surface is reduced to approximately 25% of prior volume.
- Batch output must be traceable by run metadata and ingest timestamps.

## Forecast/Training Cadence Contract
- Weekly retraining is the default cadence.
- Weekly forecast publication follows successful weekly retrain.
- Deep AG source data, feature matrices, target labels, and training intermediates stay in DuckDB/local artifacts.
- Cloud `training.*` tables are for compact metadata, registry, and explicitly approved serving summaries only.
- Publication must remain explicit and auditable in compact `training.*` metadata and `forecasts.*` tables.

### Local AG Panel Foundation (Checkpoint 23)
- Active local training-source mode may run through `AUTOGLUON_TRAINING_SOURCE=local_postgres_panel` while symbol-time panel remediation is in progress.
- This mode is local-only and must read/write only localhost PostgreSQL tables:
  - `training.matrix_panel_1h`
  - `training.matrix_panel_targets_1h`
  - `ops.local_panel_build_manifest`
- No cloud Supabase training-source writes are allowed from this panel builder flow.
- Training remains blocked by readiness gates and explicit approval requirements.

## Sentiment and Legislation Contracts
- Sentiment and Legislation page content is GPT-driven from approved news/policy sources.
- Generated summaries/scores must remain attributable to source records and run timestamps.

## Vegas Intel Turnover Contract (Body Scope)
- `/api/vegas/intel` must return DB-backed `events`, `opportunities`, and `stats` payloads used by the Vegas body sections.
- `events` rows must remain future-dated and sorted by soonest upcoming date for display.
- `opportunities` rows must expose customer/prospect classification from service-cadence data and must surface missing oil, fryer, capacity, and contact fields explicitly rather than inventing values.
- `stats` must include actual row counts for currently wired `vegas.*` serving tables and set not-yet-wired Glide groups to `null` until promoted data exists.
- The route may include AI card narratives, but body rendering must remain grounded in verified DB rows and include hard-stop language when required source rows are missing.

## Dashboard AI Card Instruction Contract
- `/api/dashboard/risk-factors` must provide per-card `strategicSpecialInstructions` for each driver card and the AI Market Intelligence card.
- Instructions must be topic-specific, quant-research oriented, and include:
  - strategic objective
  - neural connection thesis
  - quant research protocol
  - inference constraints
  - output requirements
- Generic instruction text is not allowed for AI card instruction payloads.
- AI narrative content is sourced from `app/config/dashboard-risk-factors-ai.json` (no OpenAI API key path).
- Snapshot metadata must include `model`, `reasoningEffort`, `source`, `generatedAt`, and daily `refreshScheduleEt`.
- Current locked runtime target: `gpt-5.5-fast` with `high-think`, refreshed daily at `07:00 America/New_York`.

## AI Daily Card Pull Contract (All Pages)
- Daily AI pull is the default source for card content on all primary pages.
- Snapshot files are committed in-repo under `app/config/` and must be refreshed daily:
  - `dashboard-risk-factors-ai.json`
  - `strategy-posture-ai.json`
  - `sentiment-overview-ai.json`
  - `legislation-feed-ai.json`
  - `vegas-intel-ai.json`
- API routes must read their page snapshot and expose AI-derived card payloads, while preserving controlled DB fallback behavior.
- AI card payloads should include market prices, reasoning, risk framing, and math-oriented interpretation wherever applicable.
- Every AI-powered card on every page must include:
  - `strategicSpecialInstructions` (topic-specific, quant-research, non-generic)
  - `provenance` with table/source feeds and record hints
- Card-level provenance must identify the source tables/feeds used for the AI narrative and include `asOf` + `generatedAt`.

## Operational Contracts
- `ops.ingest_run`: mandatory ingest lifecycle logging for batch and price paths.
- `ops.pipeline_alerts`: freshness and pipeline alerting.
- `ops.source_registry`: source ownership, cadence, and enablement state.

## Freshness Expectations
- Hourly contracts: update hourly for active market sessions.
- Daily rollup contract: refresh from hourly path on daily schedule.
- Weekly batch contracts: update on weekly schedule.
- Forecast contracts: refresh after successful weekly retrain.
