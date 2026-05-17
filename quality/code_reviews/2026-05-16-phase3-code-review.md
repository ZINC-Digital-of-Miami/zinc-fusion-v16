# Phase 3 Code Review — ZINC-FUSION-V16

## Pass 1: Structural Review

### app/api/zl/intraday/route.ts
- Source: Pass 1
- Requirement: REQ-001
- Location: app/api/zl/intraday/route.ts:16-23
- Verdict: BUG
- Impact: HIGH
- Evidence: The function comment states a 15m->1m fallback, but only `.from("price_15m")` is executed.
- Expected vs actual: Expected a fallback query path to `mkt.price_1m`; actual implementation has no fallback branch.
- Regression test linkage: `quality/tests/test_bug_001_intraday_fallback.py::test_bug_001_intraday_has_executable_1m_fallback`

### supabase ingest writers vs TypeScript ingest helper
- Source: Pass 1
- Requirement: REQ-003
- Location: supabase/migrations/20260414001_ingest_zl_intraday.sql:51,139,219; supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56,365,382; lib/server/ingest-run.ts:17,38,58
- Verdict: BUG
- Impact: MEDIUM
- Evidence: SQL writers persist lowercase/alternate status values (`running`, `ok`, `failed`, `error`) while TS helper persists uppercase enum values (`RUNNING`, `SUCCESS`, `FAILED`).
- Expected vs actual: Expected one canonical status vocabulary across all producers; actual producers diverge.
- Regression test linkage: `quality/tests/test_bug_003_ingest_status_vocabulary.py::test_bug_003_ingest_status_vocabulary_is_single_set`

### components/chart/ZlCandlestickChart.tsx
- Source: Pass 1
- Requirement: N/A
- Location: components/chart/ZlCandlestickChart.tsx:40,260-269
- Verdict: QUESTION
- Impact: LOW
- Evidence: Forecast overlay gate is hardcoded `false`, which disables target-zone primitive attach/render paths.
- Analysis: This may be intentional phase gating; not promoted to BUG in Phase 3 because no active REQ in `quality/REQUIREMENTS.md` binds chart-overlay enablement behavior.
- Regression test linkage: exemption (QUESTION)

## Pass 2: Requirement Verification

### REQ-001: Intraday fallback execution parity
- Status: VIOLATED
- Evidence: app/api/zl/intraday/route.ts:16-23, app/api/zl/intraday/route.ts:45
- Analysis: Route claims fallback behavior but only executes 15m query and hardcodes source label.
- Severity: HIGH

### REQ-002: Forecast-target envelope parity
- Status: VIOLATED
- Evidence: app/api/zl/target-zones/route.ts:80-85, app/api/zl/forecast-targets/route.ts:103-106
- Analysis: Sibling endpoint returns `{asOfDate, targets}` instead of canonical `ApiEnvelope` keys.
- Severity: MEDIUM

### REQ-003: Canonical `ops.ingest_run.status` vocabulary
- Status: VIOLATED
- Evidence: lib/server/ingest-run.ts:3-4,17,38,58; supabase/migrations/20260414001_ingest_zl_intraday.sql:51,139,219; supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56,365,382
- Analysis: Persisted status values split across incompatible literal sets.
- Severity: MEDIUM

### REQ-004: Explicit approval gate for non-dry training and promotion
- Status: SATISFIED
- Evidence: python/fusion/pipeline.py:55-57; python/fusion/train_models.py:770-773; python/fusion/promote_to_cloud.py:172-173
- Analysis: Dispatch propagates approval flags and downstream stages block unapproved non-dry execution.

### REQ-005: Runtime external pull resilience on AI-first read paths
- Status: SATISFIED
- Evidence: app/api/strategy/posture/route.ts:233-256; app/api/sentiment/overview/route.ts:188-193; app/api/legislation/feed/route.ts:311-320; app/api/vegas/intel/route.ts:169-174
- Analysis: Snapshot + trusted-pull composition remains explicit, with degraded/hard-stop language and provenance fields.

### REQ-006: Operator documentation parity with V16 authority rules
- Status: VIOLATED
- Evidence: README.md:95; AGENTS.md:53
- Analysis: Root README contains prohibited hardcoded `localhost:3000` startup guidance.
- Severity: LOW

### REQ-007: Per-bug writeup artifact location
- Status: NOT ASSESSABLE
- Evidence: quality/REQUIREMENTS.md:89-96
- Analysis: Writeups are a later-phase closure artifact; Phase 3 does not yet create `quality/writeups/BUG-<id>.md`.

### REQ-008: Fix patch artifact location
- Status: SATISFIED
- Evidence: quality/patches/BUG-001-fix.patch, quality/patches/BUG-002-fix.patch, quality/patches/BUG-003-fix.patch, quality/patches/BUG-004-fix.patch
- Analysis: Fix patches are emitted under canonical `quality/patches/` path.

### REQ-009: Regression-test patch artifact location
- Status: SATISFIED
- Evidence: quality/patches/BUG-001-regression-test.patch, quality/patches/BUG-002-regression-test.patch, quality/patches/BUG-003-regression-test.patch, quality/patches/BUG-004-regression-test.patch
- Analysis: Regression-test patches are emitted under canonical `quality/patches/` path.

### REQ-010: Code review output artifact location
- Status: SATISFIED
- Evidence: quality/code_reviews/2026-05-16-phase3-code-review.md
- Analysis: Phase 3 review report is stored under canonical `quality/code_reviews/`.

### REQ-011: Spec audit output artifact location
- Status: NOT ASSESSABLE
- Evidence: quality/REQUIREMENTS.md:121-128
- Analysis: Spec audit artifacts are Phase 4 outputs and are out of scope for Phase 3 execution.

### REQ-012: Sidecar JSON results artifact location
- Status: PARTIALLY SATISFIED
- Evidence: quality/results/mechanical-verify.log, quality/results/mechanical-verify.exit
- Analysis: Results path exists and is in canonical location, but spec-audit/TDD sidecars are not yet produced in Phase 3.

### REQ-013: Mechanical verification artifact location
- Status: SATISFIED
- Evidence: quality/mechanical/verify.sh; quality/mechanical/*_cases.txt
- Analysis: Required mechanical artifacts are present under canonical `quality/mechanical/`.

### REQ-014: Canonical quality layout forbids workspace subtree
- Status: SATISFIED
- Evidence: quality/workspace/ (absent)
- Analysis: No `quality/workspace/` tree exists.

## Pass 3: Cross-Requirement Consistency

### Shared Concept: Fallback behavior and downstream contract assumptions
- Requirements: REQ-001, REQ-002
- What REQ-001 claims: Intraday path executes declared fallback and reports the data source used.
- What REQ-002 claims: Equivalent forecast-target APIs expose one stable envelope contract.
- Consistency: INCONSISTENT
- Code evidence: app/api/zl/intraday/route.ts:16-23,45; app/api/zl/target-zones/route.ts:80-85; app/api/zl/forecast-targets/route.ts:103-106
- Analysis: Both requirements depend on transport-contract reliability for dashboard consumers, but implementations currently diverge in two independent ways (missing fallback path and envelope mismatch), increasing consumer-branch complexity and failure surface.
- Impact: Higher client fragility and harder degraded-mode behavior verification.

### Shared Concept: Route contract consistency vs runtime degraded metadata
- Requirements: REQ-002, REQ-005
- What REQ-002 claims: Forecast-target endpoints should expose one stable response contract.
- What REQ-005 claims: AI-first routes with runtime pulls must preserve degraded/fallback transparency.
- Consistency: CONSISTENT
- Code evidence: app/api/strategy/posture/route.ts:233-256; app/api/sentiment/overview/route.ts:188-193
- Analysis: Degraded-mode metadata is present on AI-first card routes; the known mismatch is localized to forecast-target envelope shape, not fallback metadata handling.

### Shared Concept: Ingest telemetry semantics used by downstream quality interpretation
- Requirements: REQ-003, REQ-010, REQ-011
- What REQ-003 claims: One canonical `ops.ingest_run.status` vocabulary.
- What REQ-010/011 claim: Audit artifacts should be canonicalized and interpretable.
- Consistency: INCONSISTENT
- Code evidence: supabase/migrations/20260414001_ingest_zl_intraday.sql:139,219; supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56,365,382; lib/server/ingest-run.ts:17,38,58
- Analysis: Review/audit workflows relying on one status taxonomy can misinterpret ingest health due to writer divergence.
- Impact: Incorrect rollup health filtering and false-positive/false-negative operational alerts.

### Shared Concept: Approval gates and mechanical verification boundaries
- Requirements: REQ-004, REQ-013
- What REQ-004 claims: Non-dry training and promotion require explicit approval.
- What REQ-013 claims: Mechanical verification artifacts are canonical and executable.
- Consistency: CONSISTENT
- Code evidence: python/fusion/pipeline.py:55-57; python/fusion/train_models.py:770-773; python/fusion/promote_to_cloud.py:172-173; quality/mechanical/verify.sh
- Analysis: Approval-gated phase dispatch is implemented, and mechanical artifacts exist to preserve reproducible checks.

## Combined Summary

| Source | Finding | Severity | Status | Regression linkage |
|---|---|---|---|---|
| Pass 1 / REQ-001 | Intraday route missing executable 1m fallback path | HIGH | BUG-001 | quality/tests/test_bug_001_intraday_fallback.py::test_bug_001_intraday_has_executable_1m_fallback |
| Pass 2 / REQ-002 | Forecast-targets route diverges from canonical envelope keys | MEDIUM | BUG-002 | quality/tests/test_bug_002_forecast_targets_envelope.py::test_bug_002_forecast_targets_uses_api_envelope_keys |
| Pass 1+2+3 / REQ-003 | SQL and TS ingest writers use incompatible status vocabularies | MEDIUM | BUG-003 | quality/tests/test_bug_003_ingest_status_vocabulary.py::test_bug_003_ingest_status_vocabulary_is_single_set |
| Pass 2 / REQ-006 | README hardcodes prohibited localhost:3000 startup port | LOW | BUG-004 | quality/tests/test_bug_004_readme_port_rule.py::test_bug_004_readme_must_not_hardcode_localhost_3000 |
| Pass 1 | Chart forecast overlay hard-disabled | LOW | QUESTION | Exempt (not promoted to BUG) |

- Findings by pass: Pass 1 -> 2 BUG, 1 QUESTION; Pass 2 -> 4 VIOLATED REQs; Pass 3 -> 2 INCONSISTENT shared concepts.
- Overall assessment: FIX BEFORE MERGE
