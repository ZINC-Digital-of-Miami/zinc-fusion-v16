# Local AG Audit Checkpoints (2026-05-09)

## Checkpoint 1 — Current-State Reality Audit (COMPLETE)
Status: COMPLETE
- Confirmed local `fusion` DB authority and schema reality.
- Found AG artifacts current through 2026-05-08 while core local tables were stale.

## Checkpoint 2 — Local-Only Contract-Safe Loader (COMPLETE)
Status: COMPLETE
- Added local-only loader: `python/fusion/load_local_db.py`.
- Loaded `training.matrix_1d`, `training.specialist_signals_1d`, and all 11 `training.specialist_features_*` tables to 2026-05-08.

## Checkpoint 3 — Data Science Audit + AG Run Contract (COMPLETE)
Status: COMPLETE
- Produced audit artifacts:
  - `docs/audits/2026-05-09-local-ag-data-scientist-audit.md`
  - `data/fusion/specialist_feature_audit_20260509.csv`
- Updated `python/fusion/train_models.py` for full-zoo/bag-fold/3600/returns dry-run contract.

## Checkpoint 4 — Supporting Raw Freshness Remediation (COMPLETE)
Status: COMPLETE
- Refreshed local `raw.databento_ohlcv_1d` for AG-required symbols (`ZL`,`ZS`,`ZM`,`CL`) through 2026-05-08 from local matrix artifacts.
- Refreshed local `raw.fred_economic_1d` through 2026-05-08 (appended 6284 rows across existing series IDs).
- Remaining stale blocker: `raw.databento_options_1d` max date 2025-12-16 (no local options refresh source/script currently present).

Final locked outcome:
- Local AG training path is checkpointed, memory-logged, local-only, and ready for explicit approved training.

## Checkpoint 5 — Conservative AG Contract Lock for ZL (COMPLETE)
Status: COMPLETE
- Updated default training contract in `python/fusion/train_models.py`:
  - `AUTOGLUON_PRESETS` default -> `best_quality`
  - `AUTOGLUON_TIME_LIMIT_SECONDS` default -> `3600`
  - `AUTOGLUON_NUM_BAG_FOLDS` default -> `5`
  - `AUTOGLUON_NUM_STACK_LEVELS` default -> `1`
- Fixed price-mode label validation to allow expected trailing horizon nulls while requiring usable labels.
- Verified via dry-run (no training executed):
  - `target_mode=price`
  - `rows=6439`
  - `trade_date_max=2026-05-08`
  - contract reflected: `best_quality`, `3600`, `bag_folds=5`, `stack_levels=1`

## Checkpoint 6 — Full-Zoo Default Lock, Zones Unchanged (COMPLETE)
Status: COMPLETE
- Updated `python/fusion/train_models.py` default `AUTOGLUON_EXCLUDED_MODEL_TYPES` to empty string, making full-zoo the default behavior.
- Verified dry-run defaults:
  - `presets=best_quality`
  - `time_limit_seconds=3600`
  - `num_bag_folds=5`
  - `num_stack_levels=1`
  - `excluded_model_types=[]` (full-zoo)
- No probability-zone changes were made in this checkpoint (kept simple by request).

## Checkpoint 7 — Hard Contract Lock Record (COMPLETE)
Status: COMPLETE
- Added hard checkpoint doc: `docs/ops/2026-05-09-hard-checkpoint-zl-ag-contract-lock.md`.
- Enforced contract defaults in code with hard lock + explicit override gate.
- Verified lock behavior:
  - default run enforces lock
  - unapproved drift fails
  - approved override path works when `AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1`
- No probability-zone modifications in this checkpoint.

## Checkpoint 8 — Safe Repo Cache Cleanup (COMPLETE)
Status: COMPLETE
- Scope limited to `/Volumes/Satechi Hub/ZINC-FUSION-V16` only.
- Removed regenerable caches only:
  - deleted `.next/`
  - deleted all `__pycache__/`
  - deleted all `*.pyc` / `*.pyo`
- Did not modify model artifacts, training data, memory store, or any external project workspaces.
- Result: recovered build/cache footprint while preserving active project state.

## Checkpoint 9 — Active Model Process Verification (COMPLETE)
Status: COMPLETE
- Verified there are no active AutoGluon/Fusion model training processes at checkpoint time.
- Process checks executed against patterns:
  - `autogluon`
  - `fusion.pipeline`
  - `train_models`
  - `python3 -m fusion`
  - `TabularPredictor`
- Result: no matching training processes found.
- Note: background VSCode/Node/MCP helper processes may be present and are not model-training jobs.

## Checkpoint 10 — Operating Risk Snapshot (COMPLETE)
Status: COMPLETE
- Assessed immediate operational posture after contract lock + local data refresh.
- Current verdict: `PARTIALLY READY / BLOCKED FOR TRUSTWORTHY GATE`.

Key blockers identified:
1. Readiness gate rejects expected trailing target nulls in local matrix artifact.
2. Readiness gate expects `mkt.price_1d` / `mkt.price_1h` surfaces that are not currently aligned with the local `fusion` layout used in this lane.
3. `raw.databento_options_1d` remains stale (`2025-12-16`) with no local refresh script path present.

Safeguards confirmed:
- Hard AG contract lock is active in code (best_quality / 3600 / bag5 / stack1 / full-zoo default).
- Unapproved contract drift fails unless `AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1`.
- Probability-zone logic intentionally unchanged.

Weak areas:
- Gate reliability mismatch versus active local schema.
- Options freshness gap.
- Specialist feature sparsity concentrations in some columns.

Overtooled areas:
- Broad specialist feature surface with high-null tails.
- Parallel table surfaces increase operational complexity.
- Gate breadth exceeds current local lane needs.

Next locked action recommendation:
- Patch readiness gate for local schema + expected horizon-tail label behavior before approving any real training run.
