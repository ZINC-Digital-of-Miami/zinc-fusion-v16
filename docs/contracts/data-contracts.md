# V16 Data Contracts (Weekly Batch Pivot - 2026-05-07)

## Core Market Contracts (High-Frequency Path Retained)
- `mkt.price_1h`: hourly OHLCV feed for chart freshness.
- `mkt.price_1d`: daily OHLCV rollup for daily-bar path.
- `mkt.latest_price`: most recent price for live status.
- `forecasts.target_zones`: P30/P50/P70 horizontal levels.

### ZL Databento Raw Store Boundary (Locked 2026-05-18)
- Raw ZL Databento hourly chart history is stored in local DuckDB at `data/duckdb/zinc_fusion_raw.duckdb`.
- DuckDB relation `raw.databento_zl_ohlcv_1h` is the raw recovery table for Databento `ohlcv-1h` records.
- On filesystems that do not support DuckDB file locks, the refresh writes through a temporary lock-capable working copy and copies the closed DuckDB file back to `data/duckdb/zinc_fusion_raw.duckdb`.
- Supabase `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price` are frontend-serving tables populated from validated DuckDB rows.
- Chart freshness repair must use `python -m fusion.zl_duckdb_pipeline refresh --promote`; it must not require a Supabase migration or `db push`.
- Databento HTTP `200` and `206` responses with valid NDJSON are parseable raw-data inputs.

## Weekly Batch Contracts (Reduced Source Surface)
- Non-price market, macro, supply, and alternative source ingestion runs in weekly batch windows.
- Active source surface is reduced to approximately 25% of prior volume.
- Batch output must be traceable by run metadata and ingest timestamps.

## Forecast/Training Cadence Contract
- Weekly retraining is the default cadence.
- Weekly forecast publication follows successful weekly retrain.
- Training and publication must remain explicit and auditable in `training.*` and `forecasts.*` tables.

## Sentiment and Legislation Contracts
- Sentiment and Legislation page content is GPT-driven from approved news/policy sources.
- Generated summaries/scores must remain attributable to source records and run timestamps.

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
