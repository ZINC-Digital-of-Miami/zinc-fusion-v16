# Checkpoint 23 - Local Symbol-Time Panel Foundation

Date: 2026-05-19
Repository: `/Volumes/SatechiHub/ZINC-FUSION-V16`
Status: IN PROGRESS - TRAINING STILL BLOCKED

## Why This Checkpoint Exists

Checkpoint 22 confirmed a structural blocker: `training.matrix_1d` and
`training.matrix_targets_1d` are keyed by `trade_date`, so the active AG source
cannot reach the `500000` row floor.

This checkpoint starts the local-only replacement contract: a symbol-time panel
keyed by `(symbol, bucket_ts)` with a stable `sample_id`.

## Scope and Guardrails

- Local PostgreSQL only (`localhost/fusion`)
- No cloud writes
- No training run
- No local Supabase
- No Docker

## Source Changes in This Checkpoint

1. Added `python/fusion/build_local_symbol_time_panel.py`.
2. Updated `python/fusion/train_models.py` training-source lock to
   `AUTOGLUON_TRAINING_SOURCE=local_postgres_panel` by default.
3. Updated `python/fusion/training_readiness_gate.py` to evaluate panel tables
   when training source is `local_postgres_panel`.
4. Updated `python/fusion/artifacts.py` feature-column filtering to exclude
   non-feature row keys (`bucket_ts`, `sample_id`).
5. Updated `python/tests/test_training_readiness_gate_contract.py` to reflect
   the new default training source mode.

## New Local Panel Contract

The local builder creates/uses:

- `training.matrix_panel_1h`
  - Primary key: `sample_id`
  - Uniqueness: `(symbol, bucket_ts)`
  - Payload: `feature_snapshot` JSONB with numeric features only
- `training.matrix_panel_targets_1h`
  - Primary key: `sample_id`
  - FK: `sample_id -> training.matrix_panel_1h(sample_id)`
  - Target columns: `target_price_30d`, `target_price_90d`,
    `target_price_180d`

Targets remain future price levels from ZL daily series (no returns labels).

## Execution Evidence

### Panel builder dry-run

Command:

```bash
PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.build_local_symbol_time_panel
```

Result summary:

- `panel_rows=4733121`
- `target_rows=4733121`
- `symbol_count=84`
- `trade_date_min=2010-06-07`
- `trade_date_max=2025-09-02`

### Panel builder execute (local-only write)

Command:

```bash
PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.build_local_symbol_time_panel --execute
```

Result summary:

- `status=ok`
- `run_id=local-symbol-time-panel-20260519T012846Z`
- `panel_rows=4733121`
- `target_rows=4733121`
- `symbol_count=84`
- `trade_date_min=2010-06-07`
- `trade_date_max=2025-09-02`
- Writes: `training.matrix_panel_1h`, `training.matrix_panel_targets_1h`,
  `ops.local_panel_build_manifest`

### Readiness dry-run (new source mode)

Command:

```bash
PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.pipeline --phase train-readiness --dry-run
```

Result after execute:

- `status=blocked` (expected)
- `AUTOGLUON_TRAINING_SOURCE=local_postgres_panel` active in contract
- Panel checks now pass:
  - `training_matrix_panel` PASS (`4733121` rows)
  - `training_matrix_panel_payload` PASS (`feature_snapshot` keys min/max `29`)
  - `training_matrix_panel_targets` PASS (`4733121` rows)
  - `training_matrix_panel_target_coverage` PASS (`4733121` fully-labeled rows)
- Remaining blockers (5):
  - stale hourly raw source
  - daily symbol coverage mismatch/staleness
  - hourly symbol freshness failures
  - hourly OHLC integrity violations (`7706`)
  - `alt.profarmer_news` age slightly outside configured window

### Train dry-run alignment

Command:

```bash
PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.pipeline --phase train --dry-run
```

Result after execute:

- `training_source=local_postgres_panel`
- `single_matrix_training_contract=False`
- Dry-run source summary now reports:
  - `rows=4733121`
  - `symbol_count=84`
  - `feature_columns_min_keys=29`
  - `feature_columns_max_keys=29`
  - `fully_labeled_rows=4733121`

## Verification in This Checkpoint

- `python3 -m compileall -q python` PASS
- `PYTHONPATH=python ./.venv-ag311/bin/python -m unittest python.tests.test_training_readiness_gate_contract python.tests.test_train_models_contract` PASS
- `npm run guard:completion` PASS (`STATUS: PASS`)

## Next Required Steps

1. Resolve remaining raw-source freshness, symbol coverage, and OHLC integrity
   blockers before any training approval discussion.
2. Re-run readiness dry-run after those data fixes and confirm blocker count
   trends to zero without relaxing gates.
3. Keep training blocked until readiness returns `ready=true` and explicit
   session approval is given.
