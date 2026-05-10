# Checkpoint 13 - Specialist Symbol Ownership + Crush/Biofuel Contract Fix

Date: 2026-05-09

## What Was Fixed in Code

1. Matrix moving-average set already locked to `ma_50`, `ma_100`, `ma_200`.
2. Added board-crush features to matrix build:
   - `crush_margin_board`
   - `crush_margin_chg_20d`
   - `crush_oil_share_pct`
3. Specialist market ownership hardened:
   - `ZS` and `ZM` market fields owned by `crush` specialist only.
   - `CL` market fields owned by `energy` specialist only.
4. Removed CL usage from non-energy specialists:
   - `fx` no longer uses `spread_zl_cl`/`ratio_zl_cl`.
   - `biofuel` no longer uses `cl_close`/`spread_zl_cl`.
5. Removed crude proxy leak from biofuel source patterns:
   - Dropped `commodities_dcoil*` prefixes from biofuel pattern.
6. Added hard fail validations in specialist build:
   - Per-specialist ownership check.
   - Cross-specialist ownership check.

## Trump Specialist Scope
Current trump specialist data families are explicitly:
- `rates_*`
- `legislation_trump_effect_*`
- `executive_trump_effect_*`
- `news_trump_effect_*`

Tag aliases expanded to include: tariff/trade-war/sanction/iran/china-deal terms for better political-event capture.

## Important State Note
This checkpoint updates code contracts only.
Existing parquet artifacts are NOT regenerated in this checkpoint.
No model training started.
