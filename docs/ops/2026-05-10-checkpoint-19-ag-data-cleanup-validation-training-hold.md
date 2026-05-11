# Checkpoint 19 - AG Data Cleanup, Validation, and Training Hold

Date: 2026-05-10
Repository: /Volumes/Satechi Hub/ZINC-FUSION-V16
Status: COMPLETE (training still blocked pending user review)

## Objective
Finalize and verify local + cloud AG data quality under the single-matrix contract, produce a hard evidence gate, and keep non-dry-run training disabled until explicit user approval.

## 1) Freeze + Reconcile First (Read-Only)

### Dirty-tree manifest at checkpoint start (`2026-05-10T22:57:58Z`)

In-scope (AG/data contract surfaces for this checkpoint):
- `python/fusion/build_matrix.py` (modified)
- `python/fusion/config.py` (modified)
- `python/fusion/promote_to_cloud.py` (modified)
- `docs/audits/2026-05-10-supabase-ml-validation-query-pack.sql` (untracked)
- `docs/audits/2026-05-10-supabase-ml-data-audit.json` (untracked)
- `docs/audits/2026-05-10-supabase-manual-drift-diff.json` (untracked)
- `docs/ops/2026-05-10-checkpoint-16-local-postgres-training-source-lock.md` (untracked)
- `docs/ops/2026-05-10-full-zoo-unlock-runtime-guard.md` (untracked)

Out-of-scope (not touched for Checkpoint 19 implementation):
- `app/api/zl/forecast-targets/route.ts` (modified)
- `app/api/zl/forecast/route.ts` (modified)
- `app/api/zl/target-zones/route.ts` (modified)
- `app/config/dashboard-risk-factors-ai.json` (modified)
- `app/config/legislation-feed-ai.json` (modified)
- `app/config/sentiment-overview-ai.json` (modified)
- `app/config/strategy-posture-ai.json` (modified)
- `app/config/vegas-intel-ai.json` (modified)
- `scripts/fill_site_with_trusted_data.py` (modified)
- `logs/` (untracked)

Reconciliation decision:
- No unrelated high-risk drift was found that invalidates AG/data gate truth for this checkpoint.
- Checkpoint 19 proceeded with scope locked to AG data contract + validation only.

## 2) Cloud Source Quality Lock

Command basis:
- `source .env.local`
- Read-only psycopg2 checks against cloud Supabase for `alt.profarmer_news`, `econ.weather_1d`, `econ.rates_1d`, `econ.commodities_1d`.

Cloud results:
- `alt.profarmer_news`
  - `row_count=8492`
  - `latest_published_at=2026-05-08T18:55:55.647000+00:00`
  - `age_days=2.1685`
  - `pre2010_rows=0`
  - `likely_fake_rows=0`
- `econ.weather_1d`
  - `row_count=659884`
  - `series_count=147`
  - `min_observation_date=2005-01-01`
  - `max_observation_date=2026-05-09`
  - `age_days=1.0`
- `econ.rates_1d`
  - `row_count=195524`
  - `series_count=17`
  - `min_observation_date=1954-07-01`
  - `max_observation_date=2026-05-09`
  - `age_days=1.0`
- `econ.commodities_1d`
  - `row_count=34392`
  - `series_count=13`
  - `min_observation_date=1967-01-01`
  - `max_observation_date=2026-05-04`
  - `age_days=6.0`

Cloud lock verdict:
- `pre2010_rows=0` -> PASS
- `likely_fake_rows=0` -> PASS
- Weather/rates/commodities freshness within training readiness thresholds -> PASS
- No cloud remediation required.

## 3) Local AG Surface Rebuild + Validation

Executed (non-training pipeline + local load):
1. `PYTHONPATH=python python3 -m fusion.pipeline --phase matrix`
2. `PYTHONPATH=python python3 -m fusion.pipeline --phase specialists`
3. `PYTHONPATH=python python3 -m fusion.pipeline --phase signals`
4. `PYTHONPATH=python python3 -m fusion.load_local_db --execute`
5. `PYTHONPATH=python python3 -m fusion.pipeline --phase train-readiness`
6. `PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run`

Local rebuild/load outputs:
- Matrix build: `rows_written=6439`, `trade_date_min=2001-01-23`, `trade_date_max=2026-05-08`
- Specialist features: each specialist `rows_written=6439`
- Specialist signals: `rows_written=6439`, `signal_columns=33`
- Local DB load:
  - `training.matrix_1d=6439`
  - `training.matrix_targets_1d=6439`
  - `training.specialist_signals_1d=6439`
  - all `training.specialist_features_*` tables loaded with `6439` rows each

Local contract validation:
- `training.matrix_1d` and `training.matrix_targets_1d` aligned:
  - rows: `6439` / `6439`
  - date range: `2001-01-23` to `2026-05-08` for both
- Family coverage in `training.matrix_1d.feature_snapshot`:
  - `rows_total=6439`
  - `rows_has_weather=6439`
  - `rows_has_profarmer=6439`
  - `rows_has_rates=6439`
  - `rows_has_commodities=6439`
- Payload width:
  - `min_payload_keys=375`
  - `max_payload_keys=571`

Readiness + dry-run train:
- `train-readiness`: `status=ready`, `ready=true`, blockers empty.
- `train --dry-run`: resolved training frame (`rows=6439`, `feature_columns=575`, targets present for 30d/90d/180d), no non-dry-run training executed.

## 4) Pass/Fail Gate Table

| Rule | Threshold | Observed | Result |
|---|---|---|---|
| ProFarmer pre-2010 rows | `0` | `0` | PASS |
| ProFarmer likely fake rows | `0` | `0` | PASS |
| ProFarmer recency | `<=10` days | `2.1685` days | PASS |
| Weather series coverage | `>=4` distinct series | `147` | PASS |
| Weather freshness | `<=45` days | `1.0` days | PASS |
| Rates freshness | `<=45` days | `1.0` days | PASS |
| Commodities freshness | `<=45` days | `6.0` days | PASS |
| Local matrix/targets alignment | equal rows/date range | aligned (`6439`, same range) | PASS |
| Matrix family coverage | all rows contain required families | `6439/6439` for all 4 families | PASS |
| Matrix payload width | `>=20` min keys (contract) | `min=375` | PASS |
| Train readiness | `ready=true` | `true` | PASS |
| Train execution guard | dry-run only | dry-run only, no approved training | PASS |

## 5) Final Verdict and Training Hold

Final verdict: **GO (FOR USER REVIEW ONLY)**

Training hold remains active:
- No non-dry-run AG training was started.
- Explicit approval is still required before any training run with `approved=True` / `--approve-training`.

Operational lock:
- This checkpoint confirms data quality and contract readiness only.
- Training remains blocked pending user review of local DB + cloud DB evidence.
