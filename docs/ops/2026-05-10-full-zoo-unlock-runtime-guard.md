# 2026-05-10 Full-Zoo Unlock + Runtime Hardening

## Scope

- Repository: `/Volumes/Satechi Hub/ZINC-FUSION-V16`
- Lane: `python/fusion` training contract and forecast API horizon normalization
- Constraint respected: no non-dry-run training executed

## Why This Change

1. Full-zoo model selection needed to be explicit and inspectable from dry-run output.
2. Prior crash evidence showed native OpenMP instability risk on Python 3.12 with multiple `libomp` copies.
3. Forecast endpoints needed temporary compatibility for legacy trusted-fill `7/14/30` rows while product contract stays `30/90/180`.
4. Training needed a fail-closed post-fit performance gate at `70%` directional accuracy.

## Code Changes

### `python/fusion/train_models.py`

1. Added explicit model selection modes:
   - `AUTOGLUON_MODEL_SELECTION_MODE=full_zoo` (default)
   - `AUTOGLUON_MODEL_SELECTION_MODE=include_only` with `AUTOGLUON_INCLUDED_MODEL_TYPES`
   - `AUTOGLUON_MODEL_SELECTION_MODE=exclude_only` with `AUTOGLUON_EXCLUDED_MODEL_TYPES`
2. Added full-zoo discovery from AutoGluon model registry (excluding internal/non-training model keys).
3. Added runtime guard:
   - Blocks non-dry-run on Python `3.12+` unless `AUTOGLUON_ALLOW_UNSAFE_RUNTIME=1`.
4. Added OpenMP conflict preflight:
   - Detects loaded OpenMP libraries via `threadpoolctl`.
   - Blocks non-dry-run when multiple OpenMP libraries are loaded in a crash-risk runtime (Python 3.12+) unless `AUTOGLUON_ALLOW_MULTIPLE_OPENMP=1`.
   - Optional strict mode: `AUTOGLUON_STRICT_OPENMP_GUARD=1` forces the same block in other runtimes.
5. Added runtime thread guard envs for deterministic CPU pressure:
   - `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS`, `VECLIB_MAXIMUM_THREADS`, `NUMEXPR_NUM_THREADS`
6. Removed unsupported `groups` fit kwarg retry path and switched to direct supported fit contract.
7. Added directional-accuracy gate:
   - `AUTOGLUON_MIN_DIRECTIONAL_ACCURACY` (default `0.70`)
   - Writes run artifacts/history, then fail-closes if any horizon is below threshold.
8. Added AG training-source hard lock:
   - `AUTOGLUON_TRAINING_SOURCE=local_postgres` (locked default)
   - Non-local sources require explicit `AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1`.
   - Local DB URL must resolve to localhost and database `fusion`.
9. Added local-Postgres frame loader for training:
   - Reads `training.matrix_1d` (feature snapshot JSONB),
   - `training.specialist_signals_1d` (signal payload JSONB),
   - `training.matrix_targets_1d` (target labels).
   - Training frame is built by trade-date alignment inside the local machine only.

### `python/fusion/load_local_db.py`

1. Added local-only target table load:
   - `training.matrix_targets_1d` with `target_price_30d/90d/180d`.
2. Local load now writes all AG-required local source tables:
   - `training.matrix_1d`
   - `training.matrix_targets_1d`
   - `training.specialist_signals_1d`
   - `training.specialist_features_*`

### Cloud-vs-local DB contract split

1. `python/fusion/config.py` now exposes explicit resolvers:
   - `resolve_cloud_db_url()` for canonical Supabase reads/writes.
   - `resolve_local_training_db_url()` for local AG Postgres source.
2. Cloud-read modules now use explicit cloud resolver:
   - `build_matrix.py`
   - `generate_specialist_features.py`
   - `promote_to_cloud.py`
   - `training_readiness_gate.py`

### `scripts/fill_site_with_trusted_data.py`

1. Trusted forecast horizon output switched from `7/14/30` to `30/90/180`.
2. Trusted fill model version bumped to `trusted-fill-v2-ag-horizons`.

### API compatibility routes

1. `app/api/zl/forecast/route.ts`
2. `app/api/zl/target-zones/route.ts`
3. `app/api/zl/forecast-targets/route.ts`

Added temporary legacy horizon normalization:

- For `trusted-fill-v1` rows only:
  - `7 -> 30`
  - `14 -> 90`
  - `30 -> 180`

This preserves dashboard contract while legacy rows still exist.

## Validation Performed

1. `python3 -m compileall -q python scripts/fill_site_with_trusted_data.py`
2. `npx eslint app/api/zl/forecast/route.ts app/api/zl/target-zones/route.ts app/api/zl/forecast-targets/route.ts`
3. `npx tsc --noEmit --pretty false`
4. `PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run`
5. `AUTOGLUON_MODEL_SELECTION_MODE=include_only AUTOGLUON_INCLUDED_MODEL_TYPES=GBM,CAT PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run`
6. `PYTHONPATH=python python3 -m fusion.pipeline --phase train` (verified fail-closed before training with runtime guard)

## Result

- Full-zoo contract is now explicit and visible in dry-run payload.
- Non-approved/non-safe runtime no longer reaches fit execution path.
- 70% directional-accuracy rollback threshold is enforced in training code.
- Legacy trusted-fill horizon mismatch is normalized at API edge until new trusted-fill rows are written.

## Postscript - 2026-05-11 Incident Recovery

The "no non-dry-run training executed" scope statement above was true for the runtime-guard change window only. Later approved May 10 training attempts failed/terminated before completing all horizons.

Next approved retry policy is neural-family excluded and documented only:

```bash
AUTOGLUON_MODEL_SELECTION_MODE=exclude_only
AUTOGLUON_EXCLUDED_MODEL_TYPES=FASTAI,NN_TORCH
```

Do not run another approved training command without explicit user approval and a written timeout policy.
