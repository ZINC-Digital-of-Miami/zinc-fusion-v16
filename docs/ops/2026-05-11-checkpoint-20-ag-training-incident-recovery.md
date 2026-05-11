# Checkpoint 20 - AG Training Incident Recovery

Date: 2026-05-11
Repository: `/Volumes/Satechi Hub/ZINC-FUSION-V16`
Status: RECOVERY COMPLETE PENDING FINAL VALIDATION

## Objective

Recover the May 10 approved AG training attempts without launching training again. This checkpoint cleans artifact ambiguity, locks the next retry posture, and records the target dtype guard added before any future fit.

## Incident Artifact Manifest

The following local model directories are failed forensic artifacts only. They are ignored by git under `models/fusion/` and are not production candidates.

| Run ID | Original path | Archived path | Evidence state |
|---|---|---|---|
| `v16-scaffold-20260510T232703Z-60fbedb1` | `models/fusion/v16-scaffold-20260510T232703Z-60fbedb1/` | `models/fusion/_failed_runs/2026-05-10/v16-scaffold-20260510T232703Z-60fbedb1/` | Reached `horizon_30d`; log showed `target_price_30d: object` LightGBM failures and FastAI Decimal arithmetic failure. |
| `v16-scaffold-20260510T233101Z-85cf0d13` | `models/fusion/v16-scaffold-20260510T233101Z-85cf0d13/` | `models/fusion/_failed_runs/2026-05-10/v16-scaffold-20260510T233101Z-85cf0d13/` | Reached `horizon_30d`; log stopped during `NeuralNetFastAI_BAG_L1` before final run metadata. |

Neither run completed all three horizons. Neither run wrote final `training_run.json` metadata. Neither run is represented as a completed May 10 row in `data/fusion/training_runs.parquet`.

## Code Recovery

`python/fusion/train_models.py` now coerces target labels to numeric before temporal splitting and fails before AutoGluon fit if:

- a target label has no numeric values after coercion;
- a split target column is not numeric;
- any fit-frame feature column remains non-numeric after coercion.

This keeps Decimal/object target contamination from reaching `TabularPredictor.fit()`.

## Next Retry Policy

The next approved retry is documented only. It was not executed during this recovery.

```bash
set -a; source .env.local; set +a
AUTOGLUON_MODEL_SELECTION_MODE=exclude_only \
AUTOGLUON_EXCLUDED_MODEL_TYPES=FASTAI,NN_TORCH \
PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.pipeline --phase train --approve-training
```

Training remains approval-gated. Do not run the command above without explicit user approval in the active session.

## Validation Requirements

Before any future training approval:

1. Confirm `main` is clean and pushed.
2. Confirm no active AG process is running.
3. Run the unit test contract for target dtype coercion and rejection.
4. Run `train --dry-run` with the neural-family exclusion env vars and verify `cloud_writes=[]`.
5. Define wall-clock and idle timeout criteria before launch.
