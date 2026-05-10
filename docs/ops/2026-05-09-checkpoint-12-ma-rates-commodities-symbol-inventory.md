# Checkpoint 12 - MA Contract + Rates/Commodities + Futures Symbol Inventory

Date: 2026-05-09

## Locked Change
`python/fusion/build_matrix.py` moving-average feature contract changed from:
- `ma_5, ma_20, ma_50`

to:
- `ma_50, ma_100, ma_200`

SQL null guards updated to require non-null `ma_50`, `ma_100`, `ma_200`.

## Specialist Source Reality
Rates are included for specialists: `fed, fx, tariff, volatility, trump_effect`.
Commodities are included for specialists: `energy, biofuel, crush, china, palm, substitutes`.

## Futures Symbol Inventory (local fusion raw)
`raw.databento_ohlcv_1d` contains 52 distinct symbols.

Coverage is mixed:
- Updated through 2026-05-08: `ZL, ZS, ZM, CL`
- Most other symbols currently cap at 2025-12-15.

No model training started in this checkpoint.
