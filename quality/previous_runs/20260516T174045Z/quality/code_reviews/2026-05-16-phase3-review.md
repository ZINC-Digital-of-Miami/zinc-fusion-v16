# Phase 3 Code Review — ZINC-FUSION-V16

Date: 2026-05-16
Scope: `quality/RUN_CODE_REVIEW.md` three-pass protocol against current HEAD.

## Pass 1: Structural Review

### `supabase/migrations/20260414001_ingest_zl_intraday.sql`
- **Line 50-52, 90-92, 138-140, 218-220 — BUG (BUG-001):** `ops.ingest_run` inserts omit `run_id` despite `run_id UUID PRIMARY KEY` contract. Expected: start + terminal lifecycle tied to one explicit `run_id`. Actual: independent inserts without key lifecycle correlation.
- **Line 51, 91, 139, 219 — BUG (BUG-002):** status literals (`failed`, `ok`) diverge from TypeScript helper (`RUNNING`, `SUCCESS`, `FAILED`) and trusted-fill SQL (`running`, `ok`, `error`). Expected: one canonical vocabulary.

### `lib/supabase/proxy.ts`
- **Line 15-17, 39-42 — BUG (BUG-003):** auth middleware has `/api/cron/` bypass path. Expected: no cron-route special case under pg_cron-only architecture.

### `scripts/verify/gate3.sh`
- **Line 5 — BUG (BUG-004):** gate hard-requires `app/api/cron`/`runCronHandler`. Expected: architecture-compliant verification without Vercel cron surface dependency.

### `app/api/zl/intraday/route.ts`
- **Line 10-16 — BUG (BUG-005):** route comments promise 15m→1m fallback but implementation only queries `mkt.price_15m`. Expected: implemented fallback or no fallback claim.

### `scripts/verify/gate6.sh` + `lib/contracts/api.ts`
- **Line 79, 99, 120, 138, 154, 170 (`gate6.sh`) vs line 8 (`api.ts`) — BUG (BUG-006):** gate requires `warning` while contract marks `warning?` optional. Expected: optionality parity.

### `app/api/zl/forecast-targets/route.ts` + `scripts/verify/gate6.sh`
- **Line 54-57, 61-64, 97-100 (`forecast-targets`) + line 69-181 (`gate6.sh`) — BUG (BUG-007):** endpoint returns alternate envelope `{asOfDate,targets}` outside shared `ApiEnvelope` and is not covered by parity checks. Expected: shared envelope or explicitly documented parity-tested exception.

### `app/api/dashboard/risk-factors/route.ts`
- **Line 715-718 — BUG (BUG-008):** canonical `as_of_date` is pinned to oldest component date (`asOfDateMin`). Expected: canonical freshness must not imply oldest global recency under mixed-vintage conditions.

### `app/api/zl/{forecast,target-zones,forecast-targets}/route.ts`
- **Line 61-63 (`forecast`), 61-63 (`target-zones`), 71-73 (`forecast-targets`) — BUG (BUG-009):** unknown horizons are silently dropped (`continue`) with no diagnostics. Expected: consistent dropped-horizon logging.

## Mechanical Enumeration Checks (Two-List Evidence)

### Check A — Envelope optionality contract vs parity gate enforcement
- **Authoritative list (contract, `lib/contracts/api.ts`):**
  - `warning?: string` (optional field; `quality/mechanical/api_contract_warning_fields.txt`)
- **Code-side required-field checks (gate, `scripts/verify/gate6.sh`):**
  - `has("warning") and (.warning | type == "string")` at lines 79, 99, 120, 138, 154, 170 (`quality/mechanical/gate6_warning_checks.txt`)
- **Gap:** gate enforces `warning` as required while contract declares it optional. This mechanically confirms BUG-006.

### Check B — Horizon normalization constant-set parity across forecast surfaces
- **Authoritative list (baseline route `app/api/zl/forecast/route.ts`):**
  - `AG_HORIZON_DAYS = [30, 90, 180]`
  - `LEGACY_HORIZON_MAP` keys `{7, 14, 30}`
  - `normalizeHorizon(...)` helper present
  - Source extract: `quality/mechanical/forecast_normalize_horizon.txt`
- **Code-side list (peer routes):**
  - `app/api/zl/target-zones/route.ts` extract in `quality/mechanical/target_zones_normalize_horizon.txt`
  - `app/api/zl/forecast-targets/route.ts` extract in `quality/mechanical/forecast_targets_normalize_horizon.txt`
- **Gap:** no constant-set gaps; all three routes carry the same allowlist/map/helper shape. Separate defect remains: unknown-horizon branch silently drops rows (`continue`) with no diagnostics in all three paths (BUG-009).

## Pass 2: Requirement Verification

#### REQ-001: `ops.ingest_run` writers MUST use one normalized run contract
**Status**: VIOLATED
**Evidence**: `supabase/migrations/20260414001_ingest_zl_intraday.sql:50-52,90-92,138-140,218-220`; `lib/server/ingest-run.ts:3,17,38,58`; `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:56,365,382`
**Analysis**: SQL intraday/rollup writers omit `run_id` and use mixed status vocabulary with other writers.
**Severity**: High (observability drift + lifecycle fragmentation risk).

#### REQ-002: Verification/auth scaffolding MUST not require `/api/cron`
**Status**: VIOLATED
**Evidence**: `lib/supabase/proxy.ts:15-17,39-42`; `scripts/verify/gate3.sh:5`; `AGENTS.md:44-45`
**Analysis**: middleware and Gate 3 both encode forbidden `/api/cron` assumptions.
**Severity**: High (policy drift can block compliant builds and weaken auth boundaries).

#### REQ-003: `/api/zl/intraday` MUST align documented fallback with implementation
**Status**: VIOLATED
**Evidence**: `app/api/zl/intraday/route.ts:10-16`
**Analysis**: fallback text claims 1m fallback; implementation has only 15m query path.
**Severity**: Medium.

#### REQ-004: API surfaces/types/parity harness MUST agree on envelope semantics
**Status**: VIOLATED
**Evidence**: `lib/contracts/api.ts:3-9`; `scripts/verify/gate6.sh:74-80,94-100,115-121,133-139,149-155,165-171`; `app/api/zl/forecast-targets/route.ts:54-57,61-64,97-100`
**Analysis**: optional field semantics and envelope family coverage are inconsistent across contract/gate/endpoint.
**Severity**: High.

#### REQ-005: Freshness semantics MUST avoid oldest-date mislabeling
**Status**: VIOLATED
**Evidence**: `app/api/dashboard/risk-factors/route.ts:715-719,815-819`; `components/dashboard/MarketRiskFactors.tsx:64-67,74-77`
**Analysis**: API exports mixed-vintage metadata but still assigns canonical `as_of_date` to oldest date.
**Severity**: Medium-High.

#### REQ-006: Horizon normalization MUST remain identical across forecast surfaces
**Status**: PARTIALLY SATISFIED
**Evidence**: `app/api/zl/forecast/route.ts:6-24,61-63`; `app/api/zl/target-zones/route.ts:6-24,61-63`; `app/api/zl/forecast-targets/route.ts:15-33,71-73`
**Analysis**: constants and legacy map parity are intact, but unknown-horizon drop behavior is silent and unlogged in all three sites.
**Severity**: Medium.

## Pass 3: Cross-Requirement Consistency

#### Shared Concept: Contract normalization across telemetry + API surfaces
**Requirements**: REQ-001, REQ-004
**What REQ-001 claims**: one canonical ingest lifecycle/status contract.
**What REQ-004 claims**: one canonical envelope required/optional contract.
**Consistency**: INCONSISTENT
**Code evidence**: `lib/server/ingest-run.ts:3,17,38,58`; `supabase/migrations/20260414001_ingest_zl_intraday.sql:51,91,139,219`; `lib/contracts/api.ts:8`; `scripts/verify/gate6.sh:79,99,120,138,154,170`
**Analysis**: both contract families drift in opposite directions (writer split + gate over-constraint), indicating normalization principles are not uniformly applied.
**Impact**: false telemetry semantics and false parity failures.

#### Shared Concept: Architecture authority propagation
**Requirements**: REQ-002, REQ-004
**What REQ-002 claims**: pg_cron-only architecture, no `/api/cron` dependencies.
**What REQ-004 claims**: parity gates reflect runtime contract truths.
**Consistency**: INCONSISTENT
**Code evidence**: `scripts/verify/gate3.sh:5`; `lib/supabase/proxy.ts:15-17`; `scripts/verify/gate6.sh:74-80`
**Analysis**: gate surfaces encode stale assumptions that no longer match architecture and contract authority.
**Impact**: release gates can fail for policy-compliant builds.

#### Shared Concept: Forecast surface consistency (shape + horizon behavior)
**Requirements**: REQ-004, REQ-006
**What REQ-004 claims**: envelope family consistency and documented exceptions.
**What REQ-006 claims**: equivalent horizon normalization across all forecast-facing endpoints.
**Consistency**: INCONSISTENT
**Code evidence**: `app/api/zl/forecast-targets/route.ts:54-57,61-64,97-100`; `app/api/zl/forecast/route.ts:61-63`; `app/api/zl/target-zones/route.ts:61-63`; `scripts/verify/gate6.sh:69-181`
**Analysis**: forecast-targets shape is ungoverned by parity checks and unknown horizon drops are silent in all three paths.
**Impact**: consumers can receive divergent behavior without parity alarms.

#### Shared Concept: Degradation communication truthfulness
**Requirements**: REQ-003, REQ-005
**What REQ-003 claims**: fallback behavior must match declared route semantics.
**What REQ-005 claims**: freshness labeling must avoid misleading recency framing.
**Consistency**: INCONSISTENT
**Code evidence**: `app/api/zl/intraday/route.ts:10-16`; `app/api/dashboard/risk-factors/route.ts:715-719`; `components/dashboard/MarketRiskFactors.tsx:64-67`
**Analysis**: both areas expose communication mismatches between declared resilience/freshness and actual behavior.
**Impact**: operator decision confidence can be overstated.

## Combined Summary

| Source | Finding | Severity | Status | Regression test / Exemption |
|---|---|---|---|---|
| Pass 1 + REQ-001 | BUG-001 run lifecycle missing `run_id` in legacy SQL writer | High | BUG | `test_bug_001_intraday_writer_uses_run_id_lifecycle_contract` |
| Pass 1 + REQ-001 | BUG-002 status vocabulary split across writers | Medium-High | BUG | `test_bug_002_ingest_status_vocabulary_is_canonical_across_writers` |
| Pass 1 + REQ-002 | BUG-003 proxy `/api/cron` bypass | High | BUG | `test_bug_003_proxy_has_no_api_cron_bypass_path` |
| Pass 1 + REQ-002 | BUG-004 Gate 3 `/api/cron` enforcement | High | BUG | `test_bug_004_gate3_does_not_require_api_cron_handler_files` |
| Pass 1 + REQ-003 | BUG-005 intraday fallback claim mismatch | Medium | BUG | `test_bug_005_intraday_fallback_claim_matches_implemented_query_path` |
| Pass 1 + REQ-004 | BUG-006 warning optionality parity break | High | BUG | `test_bug_006_warning_optional_semantics_are_consistent_between_contract_and_gate` |
| Pass 1 + REQ-004 | BUG-007 forecast-targets envelope/parity gap | High | BUG | `test_bug_007_forecast_targets_envelope_is_covered_by_contract_or_parity_exception` |
| Pass 1 + REQ-005 | BUG-008 oldest date used as canonical freshness | Medium-High | BUG | `test_bug_008_risk_factors_do_not_use_oldest_component_as_canonical_as_of_date` |
| Pass 1 + REQ-006 | BUG-009 unknown horizons silently dropped | Medium | BUG | `test_bug_009_unknown_horizons_are_not_silently_dropped` |

- Total findings: 9 BUGs, 0 QUESTIONS, 0 INCOMPLETE.
- Overall assessment: **BLOCK** (fix before merge).
