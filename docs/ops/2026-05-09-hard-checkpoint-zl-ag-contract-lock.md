# Hard Checkpoint: ZL AG Contract Lock

Date: 2026-05-09
Scope: `/Volumes/Satechi Hub/ZINC-FUSION-V16`
Status: LOCKED

## Locked Training Contract (Default, Enforced)
- `AUTOGLUON_PRESETS=best_quality`
- `AUTOGLUON_TIME_LIMIT_SECONDS=3600`
- `AUTOGLUON_NUM_BAG_FOLDS=5`
- `AUTOGLUON_NUM_STACK_LEVELS=1`
- `AUTOGLUON_EXCLUDED_MODEL_TYPES=''` (full zoo)

Implementation location:
- `python/fusion/train_models.py`

## Enforcement Behavior
- Contract is hard-enforced by default.
- If any of the locked variables are changed without explicit override, run fails with `TrainingContractError`.
- Explicit override requires: `AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1`.

## Verification Evidence
1. Default dry-run passes with lock active (`contract_lock_enforced=True`) and locked values.
2. Drift test fails as expected when `AUTOGLUON_PRESETS=medium_quality` without override flag.
3. Explicit override test passes when `AUTOGLUON_ALLOW_CONTRACT_OVERRIDE=1`.

## Simplicity Guardrail
- Probability-zone logic was intentionally left unchanged in this checkpoint.
- This checkpoint only locks the AG training contract.

## Operational Note
- No training was executed in this checkpoint; verification used dry-run only.
