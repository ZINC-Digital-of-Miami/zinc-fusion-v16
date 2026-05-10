# Checkpoint 16 — Local Options Refresh (Fusion DB)

## Scope
Refresh `fusion.raw.databento_options_1d` using local historical files only (no Docker, no cloud writes).

## Source Audit
- Source directory: `Data/GLBX-20260508-4HPF5RCNKG`
- File pattern: `*.ohlcv-1d.csv`
- Scan result:
  - files scanned: `192`
  - files with option-form symbols: `172`
  - total rows scanned: `1,583,590`
  - options rows parsed: `457,033`
  - options date range: `2010-07-16` → `2026-05-07`
  - detected option root(s): `LNE`

## Implementation
- Added loader: `python/fusion/load_local_options_from_glbx.py`
  - local DB hard-lock: `postgresql://.../fusion` on localhost only
  - parses option symbols from GLBX OHLCV rows (`<contract> <C|P><strike>`)
  - reconstructs `raw.databento_options_1d` with price + volume fields
  - records run manifest in `ops.local_options_load_manifest`
  - upserts source health in `ops.source_manifest` (`databento_options_local`)

## Execution Proof
- Run ID: `local-options-load-20260510T021203Z`
- Post-load table state:
  - `COUNT(*) = 457033`
  - `MIN(as_of_date) = 2010-07-16`
  - `MAX(as_of_date) = 2026-05-07`
  - `COUNT(DISTINCT symbol) = 1` (`LNE`)

## Readiness Gate Impact
- New options gate function check passes against local table:
  - `raw.databento_options_1d rows=457033, as_of_date_age_days≈3.1`

## Known Constraint
- This local GLBX archive contains `LNE` options, not `OZL`/soybean-oil options.
- `open_interest` and Greeks are not present in these OHLCV files and remain null in this reconstruction.
