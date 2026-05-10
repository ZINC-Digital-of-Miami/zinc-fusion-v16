# Checkpoint 18 - ProFarmer Zero-Fake Validation + Weather Backfill

Date: 2026-05-10
Repository: /Volumes/Satechi Hub/ZINC-FUSION-V16
Status: COMPLETE (no non-dry-run model training executed)

## Objective
1. Prove and enforce zero fake ProFarmer rows.
2. Backfill weather feature coverage across the full local AG matrix date range.
3. Rebuild local artifacts and reload local DB under the single-matrix AG contract.

## Actions Executed

### 1) ProFarmer fake-row audit and cleanup (cloud)
- Read-only audit found exactly 2 sentinel rows in `alt.profarmer_news`:
  - `published_at = 2000-01-01 00:00:00+00`
  - null URL payload
  - junk titles (`ProFarmer`, `N`)
- Deleted only those 2 rows with a strict predicate.

Post-cleanup validation:
- `rows=8492`
- `min_published_at=2021-05-25 00:00:00+00`
- `pre2010_rows=0`
- `likely_fake_rows=0`

### 2) Guardrail hardening in feature/readiness code
- `python/fusion/generate_specialist_features.py`
  - Added ProFarmer sentinel filtering in `_read_event_frame` (pre-2010/junk-url-title rows excluded).
  - Added weather context calendar alignment + backfill (`ffill`/`bfill`) against matrix trade-date calendar.
- `python/fusion/training_readiness_gate.py`
  - Hardened `_check_profarmer` with explicit fake-row checks:
    - pre-2010 row count
    - likely fake row count (empty URL + junk title)
  - Readiness now fails if these are non-zero.

### 3) Rebuild and local reload
Executed (no training):
1. `fusion.pipeline --phase matrix`
2. `fusion.pipeline --phase specialists`
3. `fusion.pipeline --phase signals`
4. `fusion.load_local_db --execute`
5. `fusion.pipeline --phase train-readiness`

## Validation Evidence

### Cloud ProFarmer quality
- `alt.profarmer_news`: `pre2010_rows=0`, `likely_fake_rows=0`.

### Local matrix family coverage
From `training.matrix_1d.feature_snapshot` (local Postgres):
- `rows_total=6439`
- `rows_has_weather=6439`
- `rows_has_profarmer=6439`
- `rows_has_rates=6439`
- `rows_has_commodities=6439`

Distinct key families in local matrix payload:
- `weather_keys=48`
- `profarmer_keys=198`
- `rates_keys=85`
- `commodities_keys=25`

### Readiness gate
- `status=ready`
- `ready=true`
- `profarmer_news` check detail confirms:
  - `pre2010_rows=0`
  - `likely_fake_rows=0`

## Training Safety State
- No non-dry-run AG training started.
- This checkpoint only cleaned data quality and feature coverage preconditions.
