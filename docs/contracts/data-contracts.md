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
- Sentiment and Legislation page content is model-driven from approved news/policy sources.
- Generated summaries/scores must remain attributable to source records and run timestamps.
- Runtime AI provider calls must bypass Vercel AI Gateway. Direct provider APIs are allowed only from server-side code using private account keys; OpenRouter keys are the selected provider path for current daily card work.
- A ChatGPT/OpenAI Pro subscription can be used only for manual local work unless a separate API credential is configured; do not imply that Pro web billing automatically funds backend API calls.

## Vegas Intel Turnover Contract (Body Scope)
- `/api/vegas/intel` must return DB-backed `events`, `opportunities`, and `stats` payloads used by the Vegas body sections.
- Vegas Intel is not a real-time surface. Refresh cadence is bounded to at most one published refresh per calendar day for page-facing Vegas payloads and snapshots.
- `events` rows must remain future-dated and sorted by soonest upcoming date for display.
- `events` rows must include `durationDays` derived from verified start/end dates (default `1` when end date is missing/invalid).
- `opportunities` rows represent the live Glide service-account universe only and must preserve customer/prospect classification from verified service cadence fields while surfacing missing oil, fryer, capacity, contact, shift/report cadence, and export-list fields explicitly rather than inventing values.
- `opportunities` must use only Glide-synced restaurant rows (`metadata.source = glide`) and must not fall back to legacy non-Glide rows.
- Contact, service cadence, oil type, and schedule fields must resolve from both normalized metadata keys and nested Glide row payload fields when present.
- `shiftCount` and `exportListed` must come from verified Glide operational joins (`vegas.shift_restaurants`, `vegas.export_list`) or explicit Glide-derived metadata landed during sync. If a field cannot be joined safely, return it as missing rather than inferred.
- `fryerCount` and `totalCapacityLbs` must come from real Glide fryer telemetry (`vegas.fryers` serving rows rebuilt from Glide fryer records) or explicit missing state.
- `location` resolves from the linked casino address (Glide field `L9K9x`, stored in `vegas.casinos.metadata.address`/`glide_data`); `contactEmail` resolves from Glide contact fields (`a3ffP`/`maCR5`); `oilForm` resolves from Glide oil-form field (`0RcWz`). Missing values stay null.
- `estimatedOilLbsPerWeek` is a deterministic, Glide-only estimate: `totalCapacityLbs * changesPerWeek`, where `changesPerWeek` is derived from the service schedule (`Po4Zg` frequency + `lf0gF` days) via the documented cadence model in `lib/vegas/normalizeVegasIntel.ts` (mirrored in `scripts/sync_vegas_glide_to_supabase.py`). It is `null` when fryer capacity or service cadence is missing; no synthetic volume is invented. The cadence→changes/week coefficients are a documented default pending Chris/Kevin confirmation.
- Each opportunity row links to the nearest upcoming verified event (`events[0]` by soonest date) for demand-window context (`eventDaysUntil`); there is no synthetic per-account event-impact matrix.
- Opportunity ranking uses real signals only: customers before prospects, then `estimatedOilLbsPerWeek` desc, then event adjacency (`eventDaysUntil`), then Glide field completeness. No synthetic `opportunityScore`/`zfusionScore`/`eventPressure`/`expectedSpend`/`hospitalityImpact` is computed; cuisine-event affinity is surfaced as optional context only.
- `customerStatus` is `customer` when a Glide service schedule is present, otherwise `prospect`.
- Server output must track all 8 Glide source groups (restaurants, casinos, fryers, export_list, scheduled_reports, shifts, shift_casinos, shift_restaurants) through DB-backed counts.
- Vegas Intel must surface shift-service coverage in the rendered body using verified `vegas.shifts`, `vegas.shift_casinos`, `vegas.shift_restaurants`, and restaurant-level shift metadata; do not replace missing shift rows with synthetic service schedules.
- Raw Glide operational tables live in `vegas.export_list`, `vegas.scheduled_reports`, `vegas.shifts`, `vegas.shift_casinos`, and `vegas.shift_restaurants`, each storing `glide_row_id`, `source_table_id`, `data`, and `synced_at`.
- `stats` must include actual row counts for the current Glide-backed `vegas.*` serving and raw tables; do not label missing promoted groups as available.
- `vegas.events` can be extracted by the AI event scraper (`scripts/scrape_vegas_events.py`, OpenRouter-backed) from public Las Vegas listing pages. The older `VEGAS_EVENT_SOURCES` fill-script path remains a legacy event refresh source until the scraper cutover is explicitly approved; neither path may create synthetic account-level opportunity scores. Event rows store `event_type`/`category`, `venue`, `end_date`, `predicted_attendance`, `location`, and `is_active` in metadata, or explicit null. No synthetic events.
- `/api/vegas/intel` merges the AI snapshot from `app/config/vegas-intel-ai.json` (`readAiSnapshot`), returning `cards` (Upcoming Events, AI Sales Strategy, Restaurant Accounts, Fryer Tracking) plus an `ai` envelope (`enabled`, `source`, `model`, `generatedAt`, `refreshScheduleEt`). Snapshot card bodies are recomputed from Glide counts + estimated weekly oil aggregates, not synthetic score thresholds.
- `vegas.restaurants`, `vegas.casinos`, and `vegas.fryers` are owned exclusively by `scripts/sync_vegas_glide_to_supabase.py`. `scripts/fill_site_with_trusted_data.py` must not insert proxy accounts, synthetic `customer_scores`, or `event_impact` rows.
- The route may include AI card narratives, but body rendering must remain grounded in verified DB rows and include hard-stop language when required source rows are missing.
- If Intel buttons are enabled in the body, `/api/vegas/intel/draft` must provide a server-side draft payload keyed by verified `restaurantId` (with `eventId` when supplied) and return draft-only pitch output without Glide writes.
- Intel draft generation may call a direct provider only when a private provider key is configured. If no provider key is available, the route must return a verified structured draft with an explicit provider warning rather than inventing AI output.

## Dashboard AI Card Instruction Contract
- `/api/dashboard/risk-factors` must provide per-card `strategicSpecialInstructions` for each driver card and the AI Market Intelligence card.
- Instructions must be topic-specific, quant-research oriented, and include:
  - strategic objective
  - neural connection thesis
  - quant research protocol
  - inference constraints
  - output requirements
- Generic instruction text is not allowed for AI card instruction payloads.
- AI narrative content is sourced from `app/config/dashboard-risk-factors-ai.json` (no request-time OpenAI API key path).
- Snapshot metadata must include `model`, `reasoningEffort`, `source`, `generatedAt`, and daily `refreshScheduleEt`.
- Current locked snapshot target: `gpt-5.5-heavy` with `high-think`, refreshed daily at `07:00 America/New_York`.

## AI Daily Card Pull Contract (All Pages)
- Daily AI pull is the default source for card content on all primary pages.
- AI card refresh cadence is bounded to at most one committed refresh per calendar day per page surface. No intraday/real-time card refresh claims are allowed.
- AI pulls must use direct provider account paths (`ai-daily-refresh` or `openrouter-daily-refresh`) and must not use Vercel AI Gateway, Vercel OIDC model routing, or `AI_GATEWAY_API_KEY`.
- When the direct provider path is selected, committed snapshot metadata must identify the model as `gpt-5.5-heavy`; runtime server calls still require `OPENROUTER_API_KEY`.
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
