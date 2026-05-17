# Confirmed Bugs — Phase 3

### BUG-001: Legacy ingest SQL writer does not maintain `run_id` lifecycle
- Source: Code Review
- Primary requirement: REQ-001
- Covers: [REQ-001/cell-RUN_ID_LIFECYCLE-GLOBAL]
- Severity: High
- File:line: `supabase/migrations/20260414001_ingest_zl_intraday.sql:50-52,90-92,138-140,218-220`
- Spec basis: REQ-001 conditions 1-2 require explicit `run_id` and start→terminal lifecycle on the same run row.
- Expected behavior: start/terminal events for each ingest run are correlated by one `run_id`.
- Actual behavior: inserts omit `run_id` entirely in legacy SQL writer paths.
- Regression test: `quality/test_regression.py::test_bug_001_intraday_writer_uses_run_id_lifecycle_contract`
- Regression patch: `quality/patches/BUG-001-regression-test.patch`
- Fix patch: `quality/patches/BUG-001-fix.patch`
- Status: confirmed open (xfail)

### BUG-002: `ops.ingest_run` status vocabulary is split across writers
- Source: Code Review
- Primary requirement: REQ-001
- Covers: [REQ-001/cell-STATUS_VOCAB_CANONICAL-GLOBAL]
- Severity: Medium-High
- File:line: `lib/server/ingest-run.ts:3,17,38,58`; `supabase/migrations/20260414001_ingest_zl_intraday.sql:51,91,139,219`; `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56,365,382`
- Spec basis: REQ-001 condition 3 requires one canonical status vocabulary.
- Expected behavior: all writers emit one normalized status set.
- Actual behavior: mixed uppercase/lowercase and divergent terminals (`SUCCESS`, `ok`, `error`, `FAILED`, `failed`).
- Regression test: `quality/test_regression.py::test_bug_002_ingest_status_vocabulary_is_canonical_across_writers`
- Regression patch: `quality/patches/BUG-002-regression-test.patch`
- Fix patch: `quality/patches/BUG-002-fix.patch`
- Status: confirmed open (xfail)

### BUG-003: Middleware contains forbidden `/api/cron` bypass path
- Source: Code Review
- Primary requirement: REQ-002
- Covers: [REQ-002/cell-NO_CRON_ROUTE_BYPASS-GLOBAL]
- Severity: High
- File:line: `lib/supabase/proxy.ts:15-17,39-42`
- Spec basis: REQ-002 condition 1 requires middleware to avoid `/api/cron` carve-outs under pg_cron-only architecture.
- Expected behavior: middleware auth logic has no runtime `/api/cron` bypass.
- Actual behavior: `isCronPath()` returns early for `/api/cron/*`.
- Regression test: `quality/test_regression.py::test_bug_003_proxy_has_no_api_cron_bypass_path`
- Regression patch: `quality/patches/BUG-003-regression-test.patch`
- Fix patch: `quality/patches/BUG-003-fix.patch`
- Status: confirmed open (xfail)

### BUG-004: Gate 3 enforces deprecated `/api/cron` route checks
- Source: Code Review
- Primary requirement: REQ-002
- Covers: [REQ-002/cell-NO_CRON_ROUTE_ENFORCEMENT-GLOBAL]
- Severity: High
- File:line: `scripts/verify/gate3.sh:5`
- Spec basis: REQ-002 conditions 2-3 require gate policy alignment with pg_cron-only architecture.
- Expected behavior: gate verifies architecture compliance without `/api/cron` route dependency.
- Actual behavior: gate fails unless `app/api/cron` and `runCronHandler` exist.
- Regression test: `quality/test_regression.py::test_bug_004_gate3_does_not_require_api_cron_handler_files`
- Regression patch: `quality/patches/BUG-004-regression-test.patch`
- Fix patch: `quality/patches/BUG-004-fix.patch`
- Status: confirmed open (xfail)

### BUG-005: Intraday route fallback claim diverges from implementation
- Source: Code Review
- Primary requirement: REQ-003
- Severity: Medium
- File:line: `app/api/zl/intraday/route.ts:10-16`
- Spec basis: REQ-003 conditions 1-2 require fallback behavior and route contract text to match.
- Expected behavior: either query fallback to `mkt.price_1m` exists or fallback claim is removed.
- Actual behavior: comment claims fallback; only `mkt.price_15m` query is implemented.
- Regression test: `quality/test_regression.py::test_bug_005_intraday_fallback_claim_matches_implemented_query_path`
- Regression patch: `quality/patches/BUG-005-regression-test.patch`
- Fix patch: `quality/patches/BUG-005-fix.patch`
- Status: confirmed open (xfail)

### BUG-006: `warning` optionality is inconsistent between API contract and parity gate
- Source: Code Review
- Primary requirement: REQ-004
- Covers: [REQ-004/cell-WARNING_OPTIONAL_SEMANTICS-GLOBAL]
- Severity: High
- File:line: `lib/contracts/api.ts:8`; `scripts/verify/gate6.sh:79,99,120,138,154,170`
- Spec basis: REQ-004 condition 1 requires optional fields to remain optional across surfaces.
- Expected behavior: gate checks must treat `warning` as optional when contract is `warning?: string`.
- Actual behavior: gate requires `warning` key and string type on all checked endpoints.
- Regression test: `quality/test_regression.py::test_bug_006_warning_optional_semantics_are_consistent_between_contract_and_gate`
- Regression patch: `quality/patches/BUG-006-regression-test.patch`
- Fix patch: `quality/patches/BUG-006-fix.patch`
- Status: confirmed open (xfail)

### BUG-007: Forecast-targets endpoint is outside shared envelope/parity contract
- Source: Code Review
- Primary requirement: REQ-004
- Covers: [REQ-004/cell-ENVELOPE_FAMILY_CONSISTENCY-GLOBAL, REQ-004/cell-EXCEPTION_DOCUMENTED_AND_PARITY_TESTED-GLOBAL]
- Consolidation rationale: a single endpoint-level contract/parity alignment change resolves both the envelope-family mismatch and the missing documented exception coverage.
- Severity: High
- File:line: `app/api/zl/forecast-targets/route.ts:54-57,61-64,97-100`; `scripts/verify/gate6.sh:69-181`
- Spec basis: REQ-004 conditions 2-3 require consistent envelope families and documented parity-tested exceptions.
- Expected behavior: endpoint either returns shared `ApiEnvelope` shape or is formally listed as an exception in parity checks.
- Actual behavior: endpoint returns `{asOfDate,targets}`/`{error,asOfDate,targets}` and is not checked by Gate 6.
- Regression test: `quality/test_regression.py::test_bug_007_forecast_targets_envelope_is_covered_by_contract_or_parity_exception`
- Regression patch: `quality/patches/BUG-007-regression-test.patch`
- Fix patch: `quality/patches/BUG-007-fix.patch`
- Status: confirmed open (xfail)

### BUG-008: Risk-factor API labels oldest component date as canonical freshness
- Source: Code Review
- Primary requirement: REQ-005
- Covers: [REQ-005/cell-NO_OLDEST_AS_CANONICAL_FRESHNESS-GLOBAL]
- Severity: Medium-High
- File:line: `app/api/dashboard/risk-factors/route.ts:715-718`
- Spec basis: REQ-005 condition 3 requires freshness labels to avoid implying full-vector recency from oldest subset timestamp.
- Expected behavior: canonical freshness reflects the intended global freshness semantics, not forced oldest-date assignment.
- Actual behavior: `as_of_date` is explicitly set to `asOfDateMin`.
- Regression test: `quality/test_regression.py::test_bug_008_risk_factors_do_not_use_oldest_component_as_canonical_as_of_date`
- Regression patch: `quality/patches/BUG-008-regression-test.patch`
- Fix patch: `quality/patches/BUG-008-fix.patch`
- Status: confirmed open (xfail)

### BUG-009: Unknown horizons are silently dropped across forecast surfaces
- Source: Code Review
- Primary requirement: REQ-006
- Covers: [REQ-006/cell-UNKNOWN_HORIZON_LOGGING-FORECAST, REQ-006/cell-UNKNOWN_HORIZON_LOGGING-TARGET_ZONES, REQ-006/cell-UNKNOWN_HORIZON_LOGGING-FORECAST_TARGETS]
- Consolidation rationale: all three drops occur in duplicated `normalizeHorizon` call sites with identical `if (!horizonDays) continue;` behavior; one cross-route logging convention closes the entire cell set.
- Severity: Medium
- File:line: `app/api/zl/forecast/route.ts:61-63`; `app/api/zl/target-zones/route.ts:61-63`; `app/api/zl/forecast-targets/route.ts:71-73`
- Spec basis: REQ-006 condition 3 requires unknown horizon filtering to be logged consistently.
- Expected behavior: dropped horizons emit deterministic diagnostics.
- Actual behavior: rows are silently skipped.
- Regression test: `quality/test_regression.py::test_bug_009_unknown_horizons_are_not_silently_dropped`
- Regression patch: `quality/patches/BUG-009-regression-test.patch`
- Fix patch: `quality/patches/BUG-009-fix.patch`
- Status: confirmed open (xfail)

### BUG-010: Trusted-site-fill failure path does not close the active `run_id`
- Source: Spec Audit
- Primary requirement: REQ-001
- Severity: Medium-High
- File:line: `scripts/fill_site_with_trusted_data.py:1816-1818,1848-1853`
- Spec basis: REQ-001 condition 2 requires terminal status updates to close the same run identifier opened at run start.
- Expected behavior: both success and failure paths update `ops.ingest_run` using the local `run_id` created at start.
- Actual behavior: success path updates `WHERE run_id = %s`, but failure path updates the latest row by `job_name` subquery.
- Regression test: `quality/test_regression.py::test_bug_010_trusted_site_fill_failure_updates_same_run_id`
- Regression patch: `quality/patches/BUG-010-regression-test.patch`
- Fix patch: `quality/patches/BUG-010-fix.patch`
- Status: confirmed open (xfail)
