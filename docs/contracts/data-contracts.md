# V16 Data Contracts (Weekly Batch Pivot - 2026-05-07)

## Core Market Contracts (High-Frequency Path Retained)
- `mkt.price_1h`: hourly OHLCV feed for chart freshness.
- `mkt.price_1d`: daily OHLCV rollup for daily-bar path.
- `mkt.latest_price`: most recent price for live status.
- `forecasts.target_zones`: P30/P50/P70 horizontal levels.

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

## Operational Contracts
- `ops.ingest_run`: mandatory ingest lifecycle logging for batch and price paths.
- `ops.pipeline_alerts`: freshness and pipeline alerting.
- `ops.source_registry`: source ownership, cadence, and enablement state.

## Freshness Expectations
- Hourly contracts: update hourly for active market sessions.
- Daily rollup contract: refresh from hourly path on daily schedule.
- Weekly batch contracts: update on weekly schedule.
- Forecast contracts: refresh after successful weekly retrain.
