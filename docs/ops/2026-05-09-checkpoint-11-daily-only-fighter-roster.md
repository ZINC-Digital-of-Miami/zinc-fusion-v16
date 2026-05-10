# Checkpoint 11 - Daily-Only Fighter Roster (ZL AG)

Date: 2026-05-09
Scope: Local ZL AG data artifacts only (`data/fusion/*`)

## Decision Snapshot
If we run a strict daily-only lane, the surviving feature stack is:

1. Matrix daily market block (`matrix_1d.parquet`): 35 cols total, including 3 price-level targets.
2. Specialist signal block (`specialist_signals.parquet`): 33 signal cols across the Big-11 specialists.
3. Specialist feature cores (`specialist_features/*.parquet`): keep dense daily-compatible columns (>=80% coverage), centered on market/volatility, selected rates/commodities, and approved news/profarmer activity counts.

## Observed Counts
- `matrix_1d`: 6,439 rows x 35 cols
- `specialist_signals`: 6,439 rows x 34 cols (`trade_date` + 33 signals)
- `specialist_features`: 11 specialist tables, 27-71 feature cols each

## Dense Cross-Specialist Core (present + >=80% coverage in all 11 specialist tables)
- `close`
- `volume`
- `ret_20d`
- `ret_60d`
- `ret_180d`
- `std_20`
- `std_60`
- `source_feature_count`
- `source_null_ratio`
- `specialist`

## Constraint
This checkpoint is a roster lock for discussion and training config hardening only. No model training started.
