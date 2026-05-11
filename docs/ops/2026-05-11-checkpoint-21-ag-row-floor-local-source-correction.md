# Checkpoint 21 - AG Row Floor + Local Source Scope Correction

Date: 2026-05-11
Repository: `/Volumes/Satechi Hub/ZINC-FUSION-V16`
Status: RECOVERY PATCHED, TRAINING BLOCKED

## Correction

The previous `6,439` row AG-ready conclusion was wrong. That row count is only the active daily `training.matrix_1d`/`training.matrix_targets_1d` surface. It is not a trustworthy AG training universe and must not pass readiness as production-scale training input.

## Locked Readiness Contract

1. AG readiness is local-first and reads local PostgreSQL at `localhost/fusion`.
2. Default symbol scope is dynamic: all symbols loaded in `raw.databento_ohlcv_1h`, not a hardcoded `ZL,ZS,ZM,CL` subset.
3. Default FRED scope is dynamic: all local raw FRED long-form series, not a hardcoded three-series subset.
4. Weather and alt/econ source checks inspect local raw source tables.
5. Options are explicitly excluded from the AG blocker set unless `TRAINING_REQUIRE_OPTIONS=1`.
6. The active training matrix and target table must each meet `TRAINING_MIN_MATRIX_ROWS`, default `500000`.
7. `train-readiness --dry-run` runs the real read-only gate. Dry-run can return `blocked`; it must not auto-report ready.

## Local Evidence Snapshot

Read-only local PostgreSQL inventory found:

| Source | Rows | Distinct symbols/series | Range |
|---|---:|---:|---|
| `raw.databento_ohlcv_1h` | `4,967,276` | `84` symbols | `2010-06-07` to `2025-12-15` |
| `raw.databento_ohlcv_1d` | `234,549` | `52` symbols | `2001-01-23` to `2026-05-08` |
| `raw.master_core_1d` | `235,647` | `52` symbols | `2010-06-07` to `2025-12-15` |
| `raw.fred_economic_1d` | `2,618,721` | `213` series | `1857-01-01` to `2026-05-08` |
| `raw.fred_observations_1d` | `386,566` | `87` series | `1871-01-01` to `2025-12-26` |
| `raw.weather_observations_1d` | `1,058,584` | `224` station-variable series | `2005-01-01` to `2025-12-20` |
| `training.matrix_1d` | `6,439` | n/a | `2001-01-23` to `2026-05-08` |
| `training.matrix_targets_1d` | `6,439` | n/a | `2001-01-23` to `2026-05-08` |

The local raw database has enough row mass to build a larger AG source, but the active AG matrix is still undersized and stale/incomplete relative to the all-symbol local-source contract.

## Current Gate Result

`PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.pipeline --phase train-readiness --dry-run`

Result:
- `status=blocked`
- `ready=false`
- `required_symbols=()`, meaning dynamic all-local-symbol discovery
- `required_fred_series=()`, meaning dynamic all-local-FRED discovery
- `min_matrix_rows=500000`
- `require_options_data=false`
- `fred_local_universe` passes with `3,464,610` rows across `239` local raw FRED series

Primary blockers:
- local matrix artifact has `6439` rows, below `500000`;
- local `training.matrix_1d` has `6439` rows, below `500000`;
- local `training.matrix_targets_1d` has `6439` rows, below `500000`;
- local hourly source is stale relative to the 72-hour freshness contract;
- daily source does not cover every hourly symbol;
- local hourly OHLC integrity has violations requiring cleanup before model trust;
- local weather and alt/econ sources are stale;
- local `alt.profarmer_news` is missing, so cloud-only ProFarmer is not AG-ready local source truth.

No model training was run during this correction.
