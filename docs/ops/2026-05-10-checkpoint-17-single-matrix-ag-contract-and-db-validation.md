# Checkpoint 17 - Single-Matrix AG Contract + Local/Cloud DB Validation

Date: 2026-05-10
Repository: /Volumes/Satechi Hub/ZINC-FUSION-V16
Status: COMPLETE (no non-dry-run training executed)

## Objective
Simplify AG execution to one daily training source while preserving specialist data as input features, then validate local and cloud data availability before any training approval.

## Locked Contract
1. AG training consumes a single daily feature surface plus targets:
   - `training.matrix_1d` (feature snapshot)
   - `training.matrix_targets_1d` (`target_price_30d/90d/180d`)
2. Specialist buckets are folded into matrix payload (prefixed feature namespaces) and are no longer hard-required as separate training inputs.
3. Training remains explicit-approval only; no non-dry-run training was run in this checkpoint.

## Code Changes Applied
1. `python/fusion/load_local_db.py`
   - Builds a unified matrix by merging all specialist feature parquet sources into `matrix_1d` payload with specialist prefixes.
   - Creates and populates `training.matrix_targets_1d` during local load.
   - Keeps `training.specialist_signals_1d` optional for load path; does not block single-matrix contract.
2. `python/fusion/train_models.py`
   - Local Postgres training loader now reads:
     - `training.matrix_1d`
     - `training.matrix_targets_1d`
   - Removed hard dependency on `training.specialist_signals_1d` for AG frame assembly.
   - Dry-run and run metadata mark `single_matrix_training_contract=true`.
3. `python/fusion/training_readiness_gate.py`
   - Added `TRAINING_SINGLE_MATRIX_CONTRACT` (default enabled).
   - In single-matrix mode, specialist-side table checks are skipped as non-blocking for AG training readiness.

## Validation Evidence (Executed)
1. `python3 -m compileall -q python`
2. `bash scripts/verify/gate5.sh`
3. `PYTHONPATH=python python3 -m fusion.pipeline --phase train-readiness`
   - `status=ready`, `ready=true`, no blockers.
4. `PYTHONPATH=python python3 -m fusion.load_local_db --execute`
   - `training.matrix_1d`: 6439 rows
   - `training.matrix_targets_1d`: 6439 rows
   - unified matrix payload key width: min 327 / max 571
5. `PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run`
   - training frame resolved: 6439 rows, 575 feature columns, 3 targets.
6. Read-only local DB verification (`localhost/fusion`)
   - `training.matrix_1d`, `training.matrix_targets_1d`, `training.specialist_signals_1d`, and all 11 `training.specialist_features_*` tables present with aligned date ranges through `2026-05-08`.
7. Read-only cloud DB verification
   - Core required tables present and populated (`mkt.price_1d`, `mkt.price_1h`, `econ.rates_1d`, `econ.commodities_1d`, `econ.weather_1d`, `alt.profarmer_news`, `training.matrix_1d`, `ops.ingest_run`).

## Training Safety State
- No non-dry-run AG training started.
- Final handoff state is ready for user review of local DB + cloud DB before any `--approve-training` execution.
