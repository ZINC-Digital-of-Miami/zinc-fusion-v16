# Checkpoint 16 - Local Postgres Training Source Lock + Full Zoo Contract

Date: 2026-05-10
Repository: /Volumes/Satechi Hub/ZINC-FUSION-V16
Status: COMPLETE (no training executed)

## Objective
Lock AG training source to local Postgres, keep Supabase cloud canonical for warehouse/ingestion, and preserve full-zoo model selection without starting training.

## Locked Contract
1. Docker remains banned for this project lane.
2. Supabase cloud remains canonical warehouse.
3. AG training source is local Postgres only (`localhost` / DB `fusion`).
4. Training is still approval-gated and was not executed.

## Code Changes Applied
1. Explicit cloud vs local DB resolvers:
   - `python/fusion/config.py`
2. Cloud resolver wired into cloud readers/writers:
   - `python/fusion/build_matrix.py`
   - `python/fusion/generate_specialist_features.py`
   - `python/fusion/promote_to_cloud.py`
   - `python/fusion/training_readiness_gate.py`
3. Local AG loader expanded to include training targets table:
   - `python/fusion/load_local_db.py`
   - Added `training.matrix_targets_1d` load path (`target_price_30d/90d/180d`).
4. Training source hard lock in AG trainer:
   - `python/fusion/train_models.py`
   - Default lock: `AUTOGLUON_TRAINING_SOURCE=local_postgres`.
   - Non-local source requires explicit contract override.

## Validation Evidence
1. `python3 -m compileall -q python` passed.
2. `bash scripts/verify/gate5.sh` passed.
3. `PYTHONPATH=python python3 -m fusion.load_local_db` dry-run shows local writes include `training.matrix_targets_1d`.
4. `PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run` reports:
   - `training_source=local_postgres`
   - full-zoo model list resolved
   - blocked with explicit guidance until local AG tables are loaded via approved local load.

## Important Guardrail State
- No non-dry-run training was triggered.
- No cloud promotion was triggered.
- Training approval requirement remains intact.
