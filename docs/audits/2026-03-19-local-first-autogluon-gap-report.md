# ZINC Fusion V16 Audit Report

Date: 2026-03-19
Scope: Compare the Local-First PostgreSQL Training Architecture outline against current V16, contrast with V15 predecessor, and validate against current AutoGluon official docs.

## Prior Finding Snapshot (Saved Artifact)

This preserves the finding provided just before this report:

> Yes. You’re materially far off from that local-first architecture right now (roughly 60-70% off in runtime wiring).

## Executive Verdict

V16 is currently **conceptually pointed toward** your target architecture, but **operationally not there yet**.

- It is **cleanly separated from Inngest runtime** (good).
- It is **still scaffold-heavy** in ingestion, read APIs, and Python pipeline (not production-ready).
- It is still **cloud-Supabase-centric** in plan/config language, while your target is **local-first system-of-work + cloud presentation-only**.

Practical score:

- Runtime implementation vs your outline: **~30-40% aligned**.
- Schema direction vs your outline: **~50-60% aligned**.

## Evidence Summary

### A) V16 Current State (repo evidence)

1. Cloud-first wording for pipeline and ingestion still exists in the active migration plan.
- `docs/plans/2026-03-17-v16-migration-plan.md:342` says Vercel cron routes write to Supabase.
- `docs/plans/2026-03-17-v16-migration-plan.md:411` says ProFarmer writes directly to cloud Supabase.
- `docs/plans/2026-03-17-v16-migration-plan.md:837` says `build_matrix.py` writes to cloud Supabase.
- `docs/plans/2026-03-17-v16-migration-plan.md:981` sets exit criteria as end-to-end against cloud Supabase.

2. Python config is Supabase URL based, not explicit local Postgres as primary system-of-work.
- `python/fusion/config.py:23-24,32-33`

3. Python pipeline phases are scaffolds.
- `python/fusion/build_matrix.py:4-10`
- `python/fusion/train_models.py:16-23`
- `python/fusion/generate_forward_forecasts.py:4-10`

4. Ingestion/read APIs are scaffolded.
- Ingest scaffold note: `lib/ingest/index.ts:1-2`
- Example cron route returns `recordsUpserted: 0`: `app/api/cron/fred/route.ts:7-10`
- Example read API returns scaffold warning: `app/api/zl/price-1d/route.ts:11`
- Current counts in repo:
  - Cron routes: 25
  - Cron scaffold handlers: 25
  - Scaffold read APIs: 13

5. Schema has useful foundations (training/forecast tables + snapshots) but not full local-first training warehouse mechanics yet.
- `training.matrix_1d` has `feature_snapshot`: `supabase/migrations/202603180006_training.sql:3-8`
- `forecasts.production_1d` has `feature_snapshot`: `supabase/migrations/202603180007_forecasts.sql:3-12`
- Current migration search found no explicit partition/hypertable/pg_cron DDL:
  - no `create_hypertable`
  - no `PARTITION BY`
  - no `cron.schedule`

6. Inngest runtime is removed from V16 code.
- No `inngest` references in `app`, `lib`, `python`, `supabase`.
- Remaining references are in docs/history notes only.

### B) V15 Predecessor Reference (local copy evidence)

V15 was cloud Postgres + Inngest-centric and operationally dense (many moving parts).

1. V15 training config explicitly uses cloud DB as system-of-work.
- `src/fusion/config.py:3-5,8,22`

2. V15 used large Inngest function estate and single API registration hub.
- `frontend/src/inngest/functions.ts:1-41`
- `frontend/src/app/api/inngest/route.ts:1-3,87-147`

3. V15 training pipeline had stronger orchestration than V16 currently (dependency gates + artifacts).
- `src/fusion/core_training/run_pipeline.py:6-12,50-55,72-83,120-177,222-240`

4. V15 had concrete AutoGluon training logic in code.
- `src/fusion/core_training/phase6_train_core_seq.py:5,13-16,216-234,258-266`

5. V15 schema reflects broad model ops/audit footprint.
- `prisma/schema.prisma:176-179` (`training.matrix_1d` mapping)
- `prisma/schema.prisma:191-212` (`oof_core_1d`)
- `prisma/schema.prisma:454-496` (`model_registry`)
- `prisma/schema.prisma:1207-1236` (`training_runs`)
- `prisma/schema.prisma:1336-1363` (`forecast_summary_1d`)

## Local-First Outline vs V16 (Gap Matrix)

### 1) Land raw source data locally first
Status: **Not aligned yet**

- Current architecture docs and config still bias to cloud Supabase writes first.
- No implemented local-first ingestion boundary is visible in runtime code.

### 2) Keep retained history locally
Status: **Not aligned yet**

- No explicit local retained warehouse mechanism in current V16 runtime.
- Migrations are cloud DB schema definitions, not local retention policy enforcement.

### 3) Build aggregates/features locally
Status: **Partially aligned (schema intent), operationally not aligned**

- Training tables exist.
- Feature/matrix generation code is scaffold, not implemented.

### 4) Train/infer locally from immutable snapshots
Status: **Partially aligned (table columns), not implemented**

- `feature_snapshot` fields exist.
- Training/inference scripts are scaffold and not writing real snapshots/workflows.

### 5) Publish curated outputs to cloud layer only
Status: **Not aligned yet**

- Present plan language points to cloud as active working layer for pipeline writes.
- Publish-only boundary is not enforced in current implementation.

### 6) Separate presentation from training concerns
Status: **Partially aligned by intent, not enforced in runtime**

- There is route/schema separation structure.
- But training and ingest are not implemented enough to prove boundary behavior.

### 7) Operational rules (local system-of-work, cloud presentation)
Status: **Not aligned yet**

- Existing docs set cloud Supabase as practical center of gravity for many phases.

### 8) High-frequency retention decision rule
Status: **Not yet evidenced**

- I do not see implemented lifecycle/retention policies that prove this rule is enforced.

## AutoGluon Doc Review and Implications for Your Architecture

Reviewed official docs/guides (AutoGluon 1.5.x stable/dev pages where relevant):

- TimeSeriesPredictor API and fit/predict behavior
- Time series quick start and in-depth guides
- Chronos-2 guide and model zoo
- TabularPredictor fit/load API docs
- v1.5 release notes

### What AutoGluon docs imply for your design

1. Validation/backtesting must be explicit and time-aware.
- `num_val_windows` and `val_step_size` control rolling backtests.
- Multi-window backtesting improves estimate quality but can reduce train data and increase runtime.
- This directly supports your outline’s leakage-avoidance and embargo/purge intent.

2. Covariates must be modeled correctly at train vs forecast time.
- TimeSeriesPredictor distinguishes `known_covariates_names` from `past_covariates`.
- At predict-time, known covariates must be provided for the full forecast horizon.
- This reinforces your local immutable feature snapshot boundary before publish.

3. Presets/time limits materially change quality/latency tradeoffs.
- Both tabular and timeseries docs emphasize preset-driven behavior.
- Your architecture needs explicit, versioned training profiles per horizon/objective.

4. Model artifacts are local-path centric by default.
- Tabular docs and API describe path-based saved artifacts.
- This supports local-first training artifact storage before curated publication.

5. Loading predictors has trust/version constraints.
- Tabular load docs explicitly warn about pickle trust and version matching.
- This affects your model registry promotion policy and artifact provenance controls.

6. Chronos-2 in v1.5 adds zero-shot + LoRA/full fine-tuning options.
- If you plan to use Chronos-2 in V16, training policy should codify when zero-shot is acceptable vs fine-tuned required.

## Key Mismatch Between V16 and AutoGluon-Guided Best Practice

1. V16 pipeline scaffolds are not yet implementing the backtesting/covariate/validation rigor AutoGluon expects.
2. The boundary between local model development and cloud serving is not codified in executable policy yet.
3. Training reproducibility metadata exists in schema but is not fully wired in runtime.

## Risks If You Ship From Current State

1. Architecture drift: cloud working-layer behavior reappears by convenience.
2. Reproducibility risk: scaffold placeholders hide missing immutable training lineage.
3. False confidence: cron/read routes look present but currently do not deliver data semantics.
4. Eval risk: model quality can look good in isolated runs but fail under robust backtest windows.

## What To Do Next (Ordered)

1. Lock architecture contract in-repo (single source of truth):
- Add a short `docs/contracts/local-first-boundary.md` with hard rules:
  - local DB = ingestion + retained raw + derived + train + infer
  - cloud Supabase = publish-only serving tables
  - no direct training writes to cloud except publish step

2. Implement local DB boundary in Python config/runtime:
- Replace ambiguous Supabase-only config defaults with explicit local DSN primary + cloud publish DSN secondary.

3. Implement real matrix/train/infer code before adding more routes:
- `build_matrix.py`, `train_models.py`, `generate_forward_forecasts.py`
- enforce run metadata and feature schema/version hash in each output row.

4. Convert cron routes from scaffold to adapters in priority order:
- start with the minimum set required for dashboard + model pipeline.

5. Add publish step explicitly:
- local inference outputs -> curated cloud tables only.
- no raw/warehouse table publication unless explicitly justified.

6. Add automated gates:
- fail CI if scaffold routes remain in protected production paths.
- fail CI if local/cloud boundary rules are violated (simple static checks + integration tests).

## Source Links (External)

- AutoGluon TimeSeriesPredictor API: https://auto.gluon.ai/stable/api/autogluon.timeseries.TimeSeriesPredictor.html
- TimeSeriesPredictor.fit: https://auto.gluon.ai/stable/api/autogluon.timeseries.TimeSeriesPredictor.fit.html
- TimeSeriesPredictor.predict: https://auto.gluon.ai/stable/api/autogluon.timeseries.TimeSeriesPredictor.predict.html
- Time Series Quick Start: https://auto.gluon.ai/stable/tutorials/timeseries/forecasting-quick-start.html
- Time Series In-Depth: https://auto.gluon.ai/stable/tutorials/timeseries/forecasting-indepth.html
- Forecasting with Chronos-2: https://auto.gluon.ai/stable/tutorials/timeseries/forecasting-chronos.html
- Forecasting Model Zoo: https://auto.gluon.ai/stable/tutorials/timeseries/forecasting-model-zoo.html
- AutoGluon v1.5.0 release notes: https://auto.gluon.ai/stable/whats_new/v1.5.0.html
- TabularPredictor API: https://auto.gluon.ai/stable/api/autogluon.tabular.TabularPredictor.html
- TabularPredictor.fit: https://auto.gluon.ai/stable/api/autogluon.tabular.TabularPredictor.fit.html
- TabularPredictor.load: https://auto.gluon.ai/stable/api/autogluon.tabular.TabularPredictor.load.html

