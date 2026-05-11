# V16 Directive Synthesis - Page, Data, and Training Scope

Date: 2026-05-09
Status: Draft lock for review (planning only; no implementation in this document)

## Purpose

Synthesize two valid inputs into one operating contract:

1. Current V16 Vegas Intel implementation is directionally correct.
2. New operator directives tighten source scope, ML rigor, and page-by-page priorities.

This document is the merged truth set to execute against in subsequent checkpoints.

## Global Scope Locks

1. Keep work on external drive project roots only.
2. Do not touch landing page.
3. Do not change Dashboard layout geometry.
4. Do not change chart design/target-zone visuals until explicit design approval.
5. Keep V16 full-width design system and current Strategy-page idea; enhance via logic-rich cards.
6. Prioritize real data and direct-source truth; no synthetic data.

## Vegas Intel - Synthesis Contract

## Keep (already correct in V16)

1. Vegas Intel page remains a V16 authority surface.
2. AI card pattern and provenance-first response structure remain.
3. Core entities stay central: restaurants, fryers, events, customer scores, impact.

## Add / Restore from legacy depth

1. Reintroduce Glide JSON API as the canonical Vegas operational source for:
   - restaurants
   - casinos
   - fryers
   - export list
   - scheduled reports / maintenance cadence
   - shifts and shift-linked entities
2. Pull cadence for Glide Vegas sync: daily.
3. Preserve and expose Kevin weekly-maintenance fields for:
   - pitch timing recency
   - cuisine-aware targeting
   - account-level proposal intelligence
4. Expand Vegas top-card surface by porting the latest V15 proven card logic/data depth (not visual copy/paste).

## Data Source Simplification Locks

1. Drop/de-prioritize from active ingest plan:
   - Yahoo indices daily path
   - FX ingest
   - ETF ingest
   - options ingest
   - Panama Canal ingest
2. Keep only Google News for general news feed in this phase.
3. Distinguish clearly:
   - Google News = sentiment/legislation narrative feed
   - FRED = macro/economic time series (not news feed replacement)
4. FRED-first expansion:
   - prioritize richer supply/econ series from official FRED catalog
   - keep pull set compact and high-impact (not mass 120+ expansion by default)

## Weather Contract Revision

1. NOAA/Open-Meteo are weather domain sources and must be modeled as explicit weather contract data.
2. Use a constrained station strategy:
   - one major reliable station each for Brazil, Argentina, US Midwest, and other explicitly approved regions.
3. Avoid noisy multi-station sprawl in this phase.

## Market/Econ Separation Correction

1. Do not mix commodity proxy symbols into generic rate/inflation buckets without explicit table contract.
2. Review and reclassify `ingest_fred_core` payload mapping so:
   - rates/vol/inflation/activity remain cleanly typed
   - commodity-linked series are grouped under explicit market-factor contract semantics.

## Specialist Surface Policy

1. Specialist framework is not a hard requirement for this phase.
2. If specialists are retained, they must be simplified and demonstrably useful across Strategy, Sentiment, Legislation, and Vegas Intel.
3. No added complexity tax just to preserve labels.

## ML / AG Training Contract (Hard)

1. Training mode: full zoo, neural-heavy posture, no skimping on quality settings.
2. Local compute is primary for heavy training workloads; cloud usage minimized for cost control.
3. Hard gate before any training run:
   - all required symbols loaded
   - required FRED/weather/ProFarmer data present
   - extraction contract validated
4. Required post-training outputs:
   - Monte Carlo surfaces
   - SHAP/feature explainability artifacts
   - full audit trail of settings and run metadata
5. Target zones remain horizontal price levels only.
6. Operating tolerance targets:
   - 1m: within 0.50
   - 3m: within 1.00
   - 6m: within 1.50

## Auth Posture (Temporary)

1. Do not enforce strict user-facing auth gates until buildout is complete.
2. Remove/relax auth blockers in a controlled, reversible way without breaking routes.
3. Keep secrets and write paths protected server-side.

## Page-by-Page Execution Priority

1. Vegas Intel:
   - lock Glide daily feed integration and weekly-maintenance intelligence first
   - restore top-card data depth from latest V15 source patterns
2. Strategy:
   - rebuild logic cards for Chris procurement decisions
   - preserve existing full-width layout and core UX idea
3. Sentiment:
   - use Google News + AI synthesis + DB-backed provenance
4. Legislation:
   - emphasize biofuels, tariffs, China, farmer-bailout context, war/supply-shock policy effects
   - add approved secondary intel source only if explicitly locked

## Implementation Guardrails

1. Keep changes granular and checkpointed per page.
2. Prefer swaps of weak cards with stronger logic cards over broad redesign.
3. Avoid script sprawl and parallel one-off pipelines.
4. Preserve one canonical source of truth per surface.

## Immediate Next Checkpoints

1. Checkpoint A: Vegas Glide contract extraction map (V15 -> V16 table/field mapping, daily job spec).
2. Checkpoint B: Ingest surface reduction patch list (jobs/tables/routes to disable or re-scope).
3. Checkpoint C: FRED/weather contract redesign (clean table semantics + minimal required series list).
4. Checkpoint D: Training readiness gate spec (exact symbol/factor completeness rules before AG run).

## Checkpoint D - Training Readiness Gate (Execution Spec)

Scope: lock and enforce prerequisites before any non-dry-run AG training call.

### D.1 Contract Inputs

1. Required market symbol scope defaults to every symbol present in local PostgreSQL `raw.databento_ohlcv_1h`; env overrides are explicit exceptions, not defaults.
2. Required FRED scope defaults to every local raw long-form FRED series; env overrides are explicit exceptions, not defaults.
3. Weather contract must define minimum distinct station/series coverage and minimum local row coverage.
4. ProFarmer feed must be present and fresh in local PostgreSQL for AG readiness; cloud-only ProFarmer is not enough.
5. Local parquet artifacts must be populated under `data/fusion/`: matrix, 11 specialist feature files, and specialist signals.
6. Local training matrix and target tables must meet `TRAINING_MIN_MATRIX_ROWS`, default `500000`; the old `6439` daily-row surface is not AG-ready.
7. Training tables must be fresh on `trade_date` (not just `ingested_at` refreshes) after an explicitly approved promotion.
   - Because labels use forward horizons up to 180 days, freshness must use a horizon-safe age window (default 320 days) unless overridden.
8. Daily/hourly OHLC integrity checks must pass for the local symbol scope.
9. Specialist surfaces must pass leakage and identity checks before train phase can run.
10. Cloud `training.matrix_1d.feature_snapshot` must not contain `target_price_{h}d` labels; targets stay local-only.
11. Options are excluded from AG readiness unless `TRAINING_REQUIRE_OPTIONS=1`.

### D.2 Fail-Closed Rules

1. Non-dry-run training is blocked unless the readiness gate returns `ready=true`.
2. The explicit user approval gate remains mandatory and separate from readiness.
3. Cloud promotion is blocked unless `--approve-promotion`/`--execute` is explicitly supplied.
4. If any gate fails, training or promotion must stop with concrete blocker details.
5. Readiness dry-run is read-only, not permissive; `train-readiness --dry-run` must still evaluate the real gate and may return `blocked`.

### D.3 Repo-Wired Commands

1. Dry-run training contract and gate surface:
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase train-readiness --dry-run`
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run`
2. Local non-training artifact prep:
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase matrix`
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase specialists`
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase signals`
3. Promotion validation without cloud writes:
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase promote --dry-run`
4. Readiness check against local artifacts and cloud data (no writes):
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase train-readiness`
5. Approved cloud promotion:
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase promote --approve-promotion`
6. Attempted non-dry-run train (requires both approval and readiness):
   - `PYTHONPATH=python python3 -m fusion.pipeline --phase train --approve-training`

### D.4 Verification Outcomes

1. Gate prints deterministic pass/fail checks for symbols, FRED, weather, ProFarmer, local matrix/signals/specialist features, promoted cloud tables, and ingest recency.
2. Gate blocks if training tables are stale on `trade_date` even when `ingested_at` is fresh.
3. Gate blocks if `mkt.price_1d`/`mkt.price_1h` OHLC integrity violations exceed threshold.
4. Gate blocks if matrix payload width is below minimum configured feature-key floor.
5. Gate blocks if specialist feature payloads match target-delta leakage signatures above threshold.
6. Gate blocks if specialist signals collapse into identity across specialist families.
7. Gate blocks if cloud `training.matrix_1d.feature_snapshot` still contains target labels.
8. Training phase includes readiness result in returned payload.
9. Non-ready state hard-blocks non-dry-run training.
