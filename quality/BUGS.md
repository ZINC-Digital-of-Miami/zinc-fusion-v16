# Confirmed Bugs — Phases 3-4 (Code Review + Spec Audit)

## Summary
- Confirmed bugs: 6
- Source: Phase 3 (Code Review) + Phase 4 (Spec Audit)

### BUG-001: Intraday route never executes documented 1-minute fallback
- Source: Code Review (Pass 1 + Pass 2)
- Primary requirement: REQ-001
- Severity: HIGH
- divergence_type: code-spec
- Disposition: code-fix
- fix_type: code
- Location: app/api/zl/intraday/route.ts:16-23, app/api/zl/intraday/route.ts:41-46
- Spec basis: REQ-001 requires executable 15m->1m fallback and source labeling aligned to the active table.
- Expected behavior: When `mkt.price_15m` returns no usable rows, `GET()` queries `mkt.price_1m` and returns bars with source metadata reflecting the fallback path.
- Actual behavior: `GET()` only queries `mkt.price_15m` and always emits `source: "mkt.price_15m"`.
- Evidence: `app/api/zl/intraday/route.ts:17-23`, `app/api/zl/intraday/route.ts:45`, `supabase/migrations/202603180002_mkt.sql:18-19`.
- Covers: [REQ-001/cell-PRICE_1M-INTRADAY_GET]
- Minimal reproduction: Read `app/api/zl/intraday/route.ts`; there is no `.from("price_1m")` query path.
- Regression test: quality/tests/test_bug_001_intraday_fallback.py::test_bug_001_intraday_has_executable_1m_fallback
- Regression patch: quality/patches/BUG-001-regression-test.patch
- Fix patch: quality/patches/BUG-001-fix.patch
- Disposition rationale: The schema already provides `mkt.price_1m`; the divergence is implementation-only and should be fixed in route logic.
- Proposed fix: Add a second query branch to `mkt.price_1m` when the first query returns an empty/invalid row set, and set `source` from the table actually used.

### BUG-002: Forecast-targets route diverges from canonical envelope contract
- Source: Code Review (Pass 2)
- Primary requirement: REQ-002
- Severity: MEDIUM
- divergence_type: code-spec
- Disposition: code-fix
- fix_type: code
- Location: app/api/zl/target-zones/route.ts:80-85, app/api/zl/forecast-targets/route.ts:103-106
- Spec basis: REQ-002 requires equivalent forecast-target endpoints to expose one stable envelope contract (or explicit typed adapters).
- Expected behavior: `/api/zl/forecast-targets` and `/api/zl/target-zones` share canonical envelope keys (`ok`, `data`, `asOf`) for equivalent payload semantics.
- Actual behavior: `/api/zl/target-zones` emits `ApiEnvelope`, while `/api/zl/forecast-targets` emits `{asOfDate, targets}`.
- Evidence: `app/api/zl/target-zones/route.ts:80-85`, `app/api/zl/forecast-targets/route.ts:59-71`, `app/api/zl/forecast-targets/route.ts:103-106`.
- Covers: [REQ-002/cell-OK-FORECAST_TARGETS_ROUTE, REQ-002/cell-DATA-FORECAST_TARGETS_ROUTE, REQ-002/cell-ASOF-FORECAST_TARGETS_ROUTE]
- Consolidation rationale: All three missing cells are one root divergence in the same response-construction block; a single response-shape change resolves them together.
- Minimal reproduction: Compare response literals in both route handlers; forecast-targets does not construct `ApiEnvelope` keys.
- Regression test: quality/tests/test_bug_002_forecast_targets_envelope.py::test_bug_002_forecast_targets_uses_api_envelope_keys
- Regression patch: quality/patches/BUG-002-regression-test.patch
- Fix patch: quality/patches/BUG-002-fix.patch
- Disposition rationale: Both endpoints already pull the same table and normalize horizons similarly; the mismatch is in response serialization only.
- Proposed fix: Return `ApiEnvelope<ForecastTarget[]>` from `/api/zl/forecast-targets` (including error path) and adapt consumers once.

### BUG-003: `ops.ingest_run.status` vocabulary diverges across SQL and TypeScript writers
- Source: Code Review (Pass 1 + Pass 2 + Pass 3)
- Primary requirement: REQ-003
- Severity: MEDIUM
- divergence_type: code-spec
- Disposition: code-fix
- fix_type: code
- Location: lib/server/ingest-run.ts:3-4, supabase/migrations/20260414001_ingest_zl_intraday.sql:51-52, supabase/migrations/20260414001_ingest_zl_intraday.sql:139-141, supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56, supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:365, supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:382
- Spec basis: REQ-003 requires all `ops.ingest_run` writers to use one canonical status vocabulary.
- Expected behavior: SQL and TS producers write a single consistent set (RUNNING, SUCCESS, FAILED) to `ops.ingest_run.status`.
- Actual behavior: TS helper writes uppercase statuses while SQL jobs write lowercase/alternate values (`running`, `ok`, `failed`, `error`).
- Evidence: `lib/server/ingest-run.ts:17`, `lib/server/ingest-run.ts:38`, `lib/server/ingest-run.ts:58`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:51`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:139`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:365`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:382`.
- Covers: [REQ-003/cell-RUNNING-SQL_INTRADAY_JOB, REQ-003/cell-SUCCESS-SQL_INTRADAY_JOB, REQ-003/cell-FAILED-SQL_INTRADAY_JOB, REQ-003/cell-RUNNING-SQL_TRUSTED_FILL_JOB, REQ-003/cell-SUCCESS-SQL_TRUSTED_FILL_JOB, REQ-003/cell-FAILED-SQL_TRUSTED_FILL_JOB]
- Consolidation rationale: All absent cells flow from one shared contract split between SQL and TS writer implementations; normalizing writer literals closes all six cells.
- Minimal reproduction: Grep writer literals in the two SQL migrations and TS helper; value sets differ.
- Regression test: quality/tests/test_bug_003_ingest_status_vocabulary.py::test_bug_003_ingest_status_vocabulary_is_single_set
- Regression patch: quality/patches/BUG-003-regression-test.patch
- Fix patch: quality/patches/BUG-003-fix.patch
- Disposition rationale: Table-level constraints do not canonicalize values; writer logic must normalize the persisted vocabulary.
- Proposed fix: Canonicalize SQL writer status literals to match TS (`RUNNING`, `SUCCESS`, `FAILED`) or enforce one enum and adapt all writers.

### BUG-004: Root README contains prohibited hardcoded `localhost:3000` startup guidance
- Source: Code Review (Pass 2)
- Primary requirement: REQ-006
- Severity: LOW
- divergence_type: internal-prose
- Disposition: spec-fix
- fix_type: spec
- Location: README.md:95, AGENTS.md:53
- Spec basis: REQ-006 requires operator docs to avoid startup guidance that conflicts with V16 authority rules.
- Expected behavior: Root onboarding docs avoid hardcoded port assumptions and align with authority startup constraints.
- Actual behavior: README explicitly states local server is on `localhost:3000`.
- Evidence: `README.md:95`, `AGENTS.md:53`.
- Minimal reproduction: Search root README for `localhost:3000`.
- Regression test: quality/tests/test_bug_004_readme_port_rule.py::test_bug_004_readme_must_not_hardcode_localhost_3000
- Regression patch: quality/patches/BUG-004-regression-test.patch
- Fix patch: quality/patches/BUG-004-fix.patch
- Disposition rationale: Divergence is between internal docs; code behavior is not implicated.
- Proposed fix: Replace hardcoded port language with dynamic port-discovery guidance aligned to AGENTS rules.

### BUG-005: Chart target-zone overlay is hard-disabled despite target-zone wiring
- Source: Spec Audit (Council Triaged)
- Primary requirement: REQ-002
- Severity: MEDIUM
- divergence_type: code-spec
- Disposition: code-fix
- fix_type: code
- Location: components/chart/ZlCandlestickChart.tsx:40, components/chart/ZlCandlestickChart.tsx:260-269
- Spec basis: REQ-002 contract mapping (`C-006`, `C-007`) requires target-zone signal visibility when target-zone data is provided.
- Expected behavior: Forecast target overlay attachment and target-zone projection execute when dashboard supplies `targetZones`.
- Actual behavior: `SHOW_FORECAST_TARGET_OVERLAY` is hardcoded `false`, so overlay attach/render branches never run.
- Evidence: `components/chart/ZlCandlestickChart.tsx:40`, `components/chart/ZlCandlestickChart.tsx:260-269`, `quality/spec_audits/triage_probes.out.txt` (`PROBE-REQ002-OVERLAY`).
- Minimal reproduction: Read chart module and verify overlay gate constant remains `false`.
- Regression test: quality/tests/test_bug_005_chart_overlay_gate.py::test_bug_005_chart_overlay_gate_is_enabled_when_target_zones_exist
- Regression patch: quality/patches/BUG-005-regression-test.patch
- Fix patch: quality/patches/BUG-005-fix.patch
- Disposition rationale: Data path and rendering primitive are already implemented; runtime gate setting alone blocks behavior.
- Proposed fix: Enable overlay gate (or equivalent visible projection contract) so supplied target zones render.

### BUG-006: Probability surface consumes divergent forecast-targets contract path
- Source: Spec Audit (Council Triaged)
- Primary requirement: REQ-002
- Severity: MEDIUM
- divergence_type: code-spec
- Disposition: code-fix
- fix_type: code
- Location: components/dashboard/ProbabilitySurface.tsx:62, components/dashboard/ProbabilitySurface.tsx:67-68, components/dashboard/ProbabilitySurface.tsx:82
- Spec basis: REQ-002 requires one stable envelope contract (or one explicit adapter) across equivalent forecast-target consumers.
- Expected behavior: Probability surface consumes canonical envelope semantics used by sibling forecast-target surfaces.
- Actual behavior: Component fetches `/api/zl/forecast-targets` and parses route-specific keys (`json.targets`, `json.asOfDate`), preserving client-level contract divergence.
- Evidence: `components/dashboard/ProbabilitySurface.tsx:62`, `components/dashboard/ProbabilitySurface.tsx:67-68`, `components/dashboard/ProbabilitySurface.tsx:82`, `quality/spec_audits/triage_probes.out.txt` (`PROBE-REQ002-SURFACE-CONTRACT`).
- Minimal reproduction: Search ProbabilitySurface for `/api/zl/forecast-targets` and `json.targets`.
- Regression test: quality/tests/test_bug_006_probability_surface_contract_path.py::test_bug_006_probability_surface_uses_canonical_target_zones_contract
- Regression patch: quality/patches/BUG-006-regression-test.patch
- Fix patch: quality/patches/BUG-006-fix.patch
- Disposition rationale: Divergence is consumer-side contract binding, not data availability.
- Proposed fix: Rebind ProbabilitySurface to canonical target-zones envelope (or shared adapter) and remove route-specific parsing.
