# Checkpoint 14 - Cloud Warehouse vs Local Training Parity Gate

Date: 2026-05-10

## Contract Locked
- Cloud remains warehouse/canonical source.
- Local remains training compute/artifact surface.
- Train readiness now explicitly enforces parity for the training-required symbol subset.

## Implementation
File: `python/fusion/training_readiness_gate.py`

Added `TrainingGateContract` fields:
- `enforce_cloud_local_parity` (default true)
- `max_cloud_local_date_lag_days` (default 0)
- `max_cloud_local_missing_ratio` (default 0.0)
- `max_cloud_local_value_mismatch_ratio` (default 0.0)
- `cloud_local_value_tolerance` (default 1e-9)

Added parity check:
- `cloud_local_symbol_parity`
- Compares cloud `mkt.price_1d` (`ZL/ZS/ZM/CL`) to local matrix symbol columns (`close/zs_close/zm_close/cl_close`)
- Fails on:
  - missing symbol mapping/columns
  - cloud-only/local-only date gaps above threshold
  - close value mismatch above tolerance threshold
  - local max-date lag behind cloud above threshold

## Validation
- `py_compile` passed for touched Python modules.
- Rebuilt local artifacts against canonical warehouse source:
  - `fusion.pipeline --phase matrix`
  - `fusion.pipeline --phase specialists`
  - `fusion.pipeline --phase signals`
- Full readiness execution passed:
  - `fusion.pipeline --phase train-readiness`
  - Result: `status=ready`, `ready=true`
  - `cloud_local_symbol_parity` passed:
    - `ZL cloud_rows=6439 local_rows=6439 overlap=6439 lag_days=0`
    - `ZS cloud_rows=4118 local_rows=4118 overlap=4118 lag_days=0`
    - `ZM cloud_rows=4117 local_rows=4117 overlap=4117 lag_days=0`
    - `CL cloud_rows=1100 local_rows=1100 overlap=1100 lag_days=0`

## Notes
- This checkpoint adds parity gate logic and validates artifact parity; it does not run model training.
- It does not require full warehouse mirroring in local DB, only training-subset parity enforcement.
