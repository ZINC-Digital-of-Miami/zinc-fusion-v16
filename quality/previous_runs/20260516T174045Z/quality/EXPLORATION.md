## Documentation status: code-only mode

No `reference_docs/` content was found for this run. The playbook is operating in a documented mode, not a failure — see [`references/code-only-mode.md`](../../references/code-only-mode.md) for what to expect and how to upgrade. The playbook is operating in **code-only mode** — requirements are derived from code, comments, defensive patterns, tests, and any inline documentation. This typically produces fewer requirements and fewer findings than a run with `reference_docs/` content.

See [`references/code-only-mode.md`](../../references/code-only-mode.md) for details and how to provide documentation for the next run.

---

# Phase 1 Exploration — ZINC-FUSION-V16

Date: 2026-05-16
Scope: Phase 1 only (exploration), clean benchmark run (Phase 0/0b intentionally skipped per run instruction).

## Open Exploration Findings
1. `reference_docs/` is missing, so this run relied on Tier 3 repository evidence plus in-repo planning docs.
   Evidence: `reference_docs/` absent in workspace listing; migration-plan and operating contracts used from `docs/plans/2026-03-17-v16-migration-plan.md:1-27` and `AGENTS.md:67-75`.
   Impact: downstream requirements are code-and-contract derived, not citation-enriched from external reference packs.

2. `ops.ingest_run` write contract is inconsistent across writers, which risks silent observability breakage in ingest telemetry.
   Evidence: table requires `run_id UUID PRIMARY KEY` in `supabase/migrations/202603180009_ops_vegas.sql:3-14`; legacy ingest function inserts rows without `run_id` in `supabase/migrations/20260414001_ingest_zl_intraday.sql:50-52` and `supabase/migrations/20260414001_ingest_zl_intraday.sql:138-140`; newer function writes `run_id` and uses different status casing in `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57` and `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:364-386`; TypeScript helper uses uppercase statuses in `lib/server/ingest-run.ts:3-4` and `lib/server/ingest-run.ts:13-20`.
   Why suspicious: mixed write contracts (`ok/failed/error/running` vs `RUNNING/SUCCESS/FAILED`) make status-driven diagnostics fragile and may fail older SQL writers if migrated schema no longer tolerates missing `run_id`.

3. Auth/gate scaffolding still encodes `/api/cron` assumptions even though project architecture forbids Vercel cron routes.
   Evidence: architecture contract says no Vercel cron in `AGENTS.md:44-45` and `AGENTS.md:149-160`; middleware special-cases `/api/cron/` in `lib/supabase/proxy.ts:15-42`; Gate 3 enforces cron handler presence via `rg app/api/cron` in `scripts/verify/gate3.sh:5`; actual tree has no `app/api/cron` directory.
   Why suspicious: verification may fail for a compliant architecture or encourage reintroduction of forbidden route shape.

4. Parity gate assumes stricter API envelope than route implementations currently provide, creating a false-negative verification risk.
   Evidence: Gate 6 requires `warning` string on several endpoints in `scripts/verify/gate6.sh:74-80`, `scripts/verify/gate6.sh:94-100`, and `scripts/verify/gate6.sh:115-121`; `warning` is optional in contract `lib/contracts/api.ts:3-9`; route envelopes typically omit `warning` (for example `app/api/zl/live/route.ts:28-33`, `app/api/zl/price-1d/route.ts:131-138`, `app/api/dashboard/metrics/route.ts:51-56`).
   Why suspicious: gate failures can reflect harness drift instead of product defects.

5. `/api/zl/intraday` documents a fallback to 1-minute data but executes only the 15-minute query path.
   Evidence: comment states fallback in `app/api/zl/intraday/route.ts:10`; query only reads `mkt.price_15m` in `app/api/zl/intraday/route.ts:11-16`; schema includes `mkt.price_1m` in `supabase/migrations/202603180002_mkt.sql:17-20`.
   Why suspicious: behavior and contract text diverge; consumers may assume resilience that does not exist.

6. Dashboard risk-factor freshness semantics can understate recency by setting canonical `as_of_date` to the minimum date while also reporting mixed-vintage.
   Evidence: API computes date spread and sets `as_of_date = asOfDateMin` in `app/api/dashboard/risk-factors/route.ts:711-719`; response publishes `as_of_date`, `as_of_date_min`, `as_of_date_max`, `mixed_vintage` in `app/api/dashboard/risk-factors/route.ts:815-819`; UI renders this freshness string in `components/dashboard/MarketRiskFactors.tsx:60-68` and summary line in `components/dashboard/MarketRiskFactors.tsx:357-358`.
   Why suspicious: end users may read oldest component date as global freshness, which can mis-time procurement decisions.

7. AI snapshot ingestion is strict and silent on failure, so AI-first cards can degrade without explicit operational signal.
   Evidence: snapshot sources are hard-whitelisted in `lib/server/ai-snapshot.ts:21-27`; source mismatch invalidates snapshot in `lib/server/ai-snapshot.ts:47-50`; file import/parse errors are swallowed and return `null` in `lib/server/ai-snapshot.ts:53-72`; consuming routes automatically fallback when snapshot missing in `app/api/strategy/posture/route.ts:252-284`, `app/api/sentiment/overview/route.ts:277-320`, `app/api/legislation/feed/route.ts:369-395`, and `app/api/vegas/intel/route.ts:160-168`.
   Why suspicious: no explicit warning envelope field or health telemetry ties card quality to snapshot validity.

8. Horizon-normalization logic is triplicated across forecast endpoints, increasing drift risk on future horizon policy changes.
   Evidence: same `AG_HORIZON_DAYS`, `LEGACY_HORIZON_MAP`, and `normalizeHorizon` appear in `app/api/zl/forecast/route.ts:6-24`, `app/api/zl/target-zones/route.ts:6-24`, and `app/api/zl/forecast-targets/route.ts:15-33`.
   Why suspicious: one route can diverge from others during edits, producing incompatible horizon surfaces between chart, targets, and summaries.

9. Pipeline orchestration includes placeholder phases that return scaffold status yet are part of `--all`, which can overstate end-to-end readiness.
   Evidence: `PIPELINE_ORDER` includes `forecast`, `garch`, `monte-carlo`, `target-zones` in `python/fusion/pipeline.py:32-43`; placeholder modules return `status: scaffold` in `python/fusion/generate_forward_forecasts.py:4-10`, `python/fusion/run_garch.py:4-10`, `python/fusion/run_monte_carlo.py:4-10`, and `python/fusion/generate_target_zones.py:4-10`.
   Why suspicious: operators can misinterpret pipeline completion as production inference completeness.

10. Automated test surface is concentrated in Python contract tests; frontend/API runtime behavior lacks a first-class test command.
    Evidence: npm scripts expose `dev/build/start/lint` only in `package.json:3-8`; Python project exists with two explicit contract tests in `python/tests/test_train_models_contract.py:23-39` and `python/tests/test_training_readiness_gate_contract.py:10-60`.
    Why suspicious: parity-sensitive UI/API behaviors (envelopes, stale flags, fallback paths) are gate-checked mostly by shell scripts rather than unit/integration tests.

11. File-role mapping completed using git-indexed scope and stayed within bounded footprint for Phase 1.
    Evidence: role map header shows `provenance: git-ls-files` in `quality/exploration_role_map.json:1-4`; file entry block starts at `quality/exploration_role_map.json:5-12`; count remains 296 entries with role distribution derived from this map (`code=155`, `docs=52`, `skill-prose=50`, `config=19`, `test=12`, `skill-reference=6`, `skill-tool=2`).
    Impact: role-tagging surface is tractable and excludes disallowed generated/vendor directories.

## Quality Risks
1. **Priority P0 — Procurement posture can be driven by stale or mixed-vintage analytics without clear downgrade semantics.**
   Concrete risk: buyer could interpret risk as current when parts of driver vector are old, causing mistimed accumulations or waits.
   Evidence: `as_of_date` is min date in `app/api/dashboard/risk-factors/route.ts:715-719`; UI presents freshness summary as single value/range in `components/dashboard/MarketRiskFactors.tsx:64-77` and `components/dashboard/MarketRiskFactors.tsx:357-358`.

2. **Priority P0 — Ingest health observability can desynchronize across SQL and TS writers.**
   Concrete risk: run rows can fail insert/update or fragment by status vocabulary, reducing incident response confidence for pg_cron ingestion.
   Evidence: primary-key requirement in `supabase/migrations/202603180009_ops_vegas.sql:3-4`; legacy inserts without `run_id` in `supabase/migrations/20260414001_ingest_zl_intraday.sql:50-52`; status-casing split between SQL and TS helper in `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57` and `lib/server/ingest-run.ts:3-4`.

3. **Priority P1 — Verification gates can reject valid builds due harness/architecture drift.**
   Concrete risk: blocked releases or unnecessary code churn to satisfy obsolete checks.
   Evidence: cron route enforced in `scripts/verify/gate3.sh:5` while architecture forbids Vercel cron in `AGENTS.md:44-45`; `warning` required by parity gate in `scripts/verify/gate6.sh:74-80` despite optional contract in `lib/contracts/api.ts:7-9`.

4. **Priority P1 — AI-first card quality can silently degrade to fallback narratives with no explicit client-visible reliability marker.**
   Concrete risk: operators may treat fallback content as fresh model output.
   Evidence: snapshot trust rejection returns `null` in `lib/server/ai-snapshot.ts:47-50` and `lib/server/ai-snapshot.ts:70-72`; downstream routes continue serving envelopes using fallbacks in `app/api/strategy/posture/route.ts:227-233` and `app/api/legislation/feed/route.ts:342-348`.

5. **Priority P1 — Intraday endpoint resilience is overstated by comments, which can hide runtime fragility during sparse 15m availability.**
   Concrete risk: chart/user workflows expecting 1m fallback receive empty/partial data instead.
   Evidence: stated fallback in `app/api/zl/intraday/route.ts:10`; single-table query path in `app/api/zl/intraday/route.ts:11-16`; 1m table exists in `supabase/migrations/202603180002_mkt.sql:19`.

6. **Priority P2 — `--all` pipeline execution can include scaffold phases and appear complete in operator logs.**
   Concrete risk: teams may skip validation gates assuming forecast/target outputs are fully implemented.
   Evidence: scaffold statuses in `python/fusion/generate_forward_forecasts.py:5-10` and `python/fusion/run_monte_carlo.py:5-10`; phases included in full run order in `python/fusion/pipeline.py:32-43`.

## Pattern Applicability Matrix
| Pattern | Decision | Target modules | Rationale |
|---|---|---|---|
| Pattern 1: Fallback and Degradation Path Parity | FULL | `lib/server/ai-snapshot.ts`, `app/api/{strategy,sentiment,legislation,vegas}/**`, `supabase/migrations/202605080003_*` | Primary vs fallback paths are explicit and domain-critical; parity gaps can hide stale/blocked intelligence behind normal responses. |
| Pattern 2: Dispatcher Return-Value Correctness | SKIP | `app/api/**` | No complex multi-event dispatcher with combinatorial return paths was identified in this phase; handlers are mostly straight-line query envelopes. |
| Pattern 3: Cross-Implementation Contract Consistency | FULL | `/api/zl/{forecast,target-zones,forecast-targets}`, ingest run writers | Same logical operation appears in multiple implementations; consistency determines chart/data parity and ops telemetry coherence. |
| Pattern 4: Enumeration and Representation Completeness | FULL | `lib/server/ai-snapshot.ts`, `app/api/dashboard/risk-factors/route.ts`, `/api/zl/*` horizon filters | Closed sets (trusted source whitelist, factor-to-driver mapping, horizon allowlists) can silently drop valid values. |
| Pattern 5: API Surface Consistency | FULL | `lib/contracts/api.ts`, `scripts/verify/gate6.sh`, `/api/zl/*`, `/api/dashboard/*` | Multiple API surfaces for similar contracts exist; drift between contract, implementation, and parity harness is already visible. |
| Pattern 6: Spec-Structured Parsing Fidelity | SKIP | `app/api/legislation/feed/route.ts` parser helpers | Term matching is heuristic business filtering, not formal grammar compliance; no RFC/ABNF parser surface dominated observed risks. |
| Pattern 7: Composition and Mount-Context Awareness | SKIP | `lib/supabase/proxy.ts` | Composition seam exists conceptually, but strongest current defects are policy drift and closed-set issues rather than canonical-vs-raw state confusion. |

## Pattern Deep Dive — Fallback and Degradation Path Parity
1. **AI snapshot load pipeline has strict trust gate but soft failure behavior.**
   Primary path: `readAiSnapshot` validates fields and source via `coerceSnapshot` (`lib/server/ai-snapshot.ts:41-50`), then routes merge AI snapshot content (`app/api/strategy/posture/route.ts:252-284`, `app/api/sentiment/overview/route.ts:270-320`).
   Fallback path: any import/parse/validation error returns `null` (`lib/server/ai-snapshot.ts:70-72`), and route logic silently uses fallback cards (`app/api/strategy/posture/route.ts:227-233`, `app/api/legislation/feed/route.ts:342-348`).
   Parity gap: primary path includes explicit provenance structure, but fallback path does not elevate a reliability warning in the shared API envelope.
   Candidate requirement: REQ-004 (API envelopes must communicate degraded snapshot state explicitly).

2. **Trusted market pull fallback in SQL keeps card surfaces alive but can carry stale metrics without explicit “stale-by-source” dimension.**
   Primary path: `ops.ingest_trusted_site_fill` fetches live CL/CNY/VIX/OVX via HTTP (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:108-167`).
   Fallback path: when fetches fail, it reuses `prev_date` metrics (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:169-199`) and still writes same-day rows (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:290-317`).
   Parity gap: downstream API freshness reports range dates, but per-field lineage is not surfaced in client summaries (`app/api/dashboard/risk-factors/route.ts:815-819`, `components/dashboard/MarketRiskFactors.tsx:64-77`).
   Candidate requirement: REQ-005 (freshness semantics must differentiate mixed-vintage by field or clearly mark degraded mode).

## Pattern Deep Dive — Cross-Implementation Contract Consistency
1. **`normalizeHorizon` is replicated across three ZL forecast-facing routes and must stay behaviorally identical.**
   Implementation A: `app/api/zl/forecast/route.ts:13-24`.
   Implementation B: `app/api/zl/target-zones/route.ts:13-24`.
   Implementation C: `app/api/zl/forecast-targets/route.ts:22-33`.
   Shared requirement: legacy mapping (`7->30`, `14->90`, `30->180`) and AG horizon allowlist must be equivalent for all forecast surfaces.
   Gap risk: independent edits can desynchronize chart target zones vs probability surface horizons.
   Candidate requirement: REQ-006.

2. **`ops.ingest_run` writers implement same logical operation with divergent contracts.**
   Implementation A (legacy SQL ingest): lower-case status, no explicit run UUID insert path (`supabase/migrations/20260414001_ingest_zl_intraday.sql:138-140`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:218-220`).
   Implementation B (new SQL trusted fill): explicit UUID + lower-case statuses (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:364-386`).
   Implementation C (TypeScript helper): uppercase status enum (`lib/server/ingest-run.ts:3-4`, `lib/server/ingest-run.ts:37-41`, `lib/server/ingest-run.ts:57-60`).
   Gap: common telemetry table has no enforced enum, so cross-writer semantics are implicit and can drift.
   Candidate requirement: REQ-001.

## Pattern Deep Dive — Enumeration and Representation Completeness
1. **Trusted snapshot source whitelist is closed and brittle.**
   Closed set: `TRUSTED_SNAPSHOT_SOURCES` contains four literals (`lib/server/ai-snapshot.ts:21-27`).
   Enforcement: unknown `source` invalidates snapshot (`lib/server/ai-snapshot.ts:47-50`).
   Risk: introducing new approved source labels (for cadence or provider shifts) can silently disable AI snapshot acceptance.
   Candidate requirement: REQ-004.

2. **Driver-factor mapping is a heuristic closed set that can drop new factors.**
   Mapping logic: `mapFactorToDriver` hard-codes string inclusion rules (`app/api/dashboard/risk-factors/route.ts:114-122`).
   Consumption: attribution rows are filtered through that mapping (`app/api/dashboard/risk-factors/route.ts:571-579`), and missing mappings never influence driver scores.
   Risk: newly introduced attribution factor names can be ignored without warning.
   Candidate requirement: REQ-005 (freshness/quality metadata should include dropped factor count) or a dedicated mapping coverage requirement.

3. **Horizon allowlist drops unknown horizons by design but with no explicit telemetry.**
   Closed set: `[30,90,180]` plus legacy remap (`app/api/zl/forecast/route.ts:6-24`).
   Behavior: unknown horizons are filtered out (`if (!horizonDays) continue`) in `app/api/zl/forecast/route.ts:61-63`, `app/api/zl/target-zones/route.ts:61-63`, `app/api/zl/forecast-targets/route.ts:71-73`.
   Risk: if training/promotion introduces additional horizons, they vanish from APIs without diagnostics.
   Candidate requirement: REQ-006.

## Pattern Deep Dive — API Surface Consistency
1. **Parity harness and contract disagree on required envelope fields.**
   Contract: `warning` optional in `lib/contracts/api.ts:7-9`.
   Parity harness: `warning` required in Gate 6 checks (`scripts/verify/gate6.sh:74-80`, `scripts/verify/gate6.sh:133-139`).
   Route behavior: standard envelopes omit warning in `app/api/zl/target-zones/route.ts:74-79` and `app/api/dashboard/drivers/route.ts:46-51`.
   Divergence: one surface (gate) treats field as required, runtime surfaces do not.
   Candidate requirement: REQ-004.

2. **ZL endpoint family includes two envelope conventions.**
   Envelope style: `/api/zl/forecast` and `/api/zl/target-zones` use `{ok,data,asOf,source}` in `app/api/zl/forecast/route.ts:73-78` and `app/api/zl/target-zones/route.ts:74-79`.
   Alternate style: `/api/zl/forecast-targets` returns `{asOfDate,targets}` in `app/api/zl/forecast-targets/route.ts:97-100` and error `{error,asOfDate,targets}` in `app/api/zl/forecast-targets/route.ts:53-57`.
   Consumer coupling: `ProbabilitySurface` relies on `json.targets/json.asOfDate` in `components/dashboard/ProbabilitySurface.tsx:67-83`.
   Divergence: similar forecast surfaces have distinct response schemas; consistency is fragile for shared clients and parity checks.
   Candidate requirement: REQ-004 or a scoped “forecast surface schema family” requirement.

## Candidate Bugs for Phase 2
1. **BUG-HYP-001: `ops.ingest_run` contract split can break run logging under schema/writer drift.**
   - Stage: open exploration + Cross-Implementation Contract Consistency
   Evidence: `supabase/migrations/202603180009_ops_vegas.sql:3-14`; `supabase/migrations/20260414001_ingest_zl_intraday.sql:50-52`; `lib/server/ingest-run.ts:3-4`.
   Code review focus: validate all ingest writers against a single required status vocabulary and mandatory run UUID insertion/update path.

2. **BUG-HYP-002: Gate 3 cron-route check is incompatible with architecture and may fail compliant builds.**
   - Stage: open exploration + quality risks
   Evidence: `scripts/verify/gate3.sh:5`; `AGENTS.md:44-45`; `lib/supabase/proxy.ts:15-42`.
   Code review focus: align middleware and verify scripts to pg_cron-only architecture; remove stale `/api/cron` dependency.

3. **BUG-HYP-003: Gate 6 parity checks can fail because `warning` is required by harness but optional in implementation contract.**
   - Stage: open exploration + API Surface Consistency
   Evidence: `scripts/verify/gate6.sh:74-80`; `lib/contracts/api.ts:7-9`; `app/api/zl/live/route.ts:28-33`.
   Code review focus: decide one source of truth (contract vs gate) and enforce uniformly.

4. **BUG-HYP-004: `/api/zl/intraday` missing implemented fallback to 1m despite documented intent.**
   - Stage: open exploration
   Evidence: `app/api/zl/intraday/route.ts:10-16`; `supabase/migrations/202603180002_mkt.sql:17-20`.
   Code review focus: either implement 1m fallback path or correct contract text and consumer assumptions.

5. **BUG-HYP-005: Risk-factor freshness can present oldest component date as canonical freshness for the whole payload.**
   - Stage: quality risks + Fallback and Degradation Path Parity
   Evidence: `app/api/dashboard/risk-factors/route.ts:715-719`; `components/dashboard/MarketRiskFactors.tsx:64-77`.
   Code review focus: verify freshness semantics and add explicit degraded/mixed-vintage markers where user-facing decisions are made.

6. **BUG-HYP-006: Snapshot source-label drift silently disables AI snapshots and silently falls back to generated defaults.**
   - Stage: Pattern 4 (Enumeration and Representation Completeness)
   Evidence: `lib/server/ai-snapshot.ts:21-27`; `lib/server/ai-snapshot.ts:47-50`; `lib/server/ai-snapshot.ts:70-72`.
   Code review focus: enforce observable error/warning channel when snapshot rejected, not just null fallback.

7. **BUG-HYP-007: Horizon filtering logic may silently drop newly introduced horizons across forecast surfaces.**
   - Stage: Pattern 3 (Cross-Implementation Contract Consistency) + Pattern 4
   Evidence: `app/api/zl/forecast/route.ts:6-24`; `app/api/zl/target-zones/route.ts:6-24`; `app/api/zl/forecast-targets/route.ts:15-33`.
   Code review focus: centralize horizon normalization and emit explicit diagnostics for dropped horizons.

8. **BUG-HYP-008: Full pipeline run includes scaffold phases, risking premature “ready” interpretation.**
   - Stage: open exploration + quality risks
   Evidence: `python/fusion/pipeline.py:32-43`; `python/fusion/generate_forward_forecasts.py:4-10`; `python/fusion/run_monte_carlo.py:4-10`.
   Code review focus: hard-fail `--all` when scaffold phases are still placeholders or mark run state explicitly as incomplete.

## Gate Self-Check
1. Line-count gate (>=120 substantive lines): **PASS**. Evidence: `quality/EXPLORATION.md` is >120 lines.
2. Exact heading present `## Open Exploration Findings`: **PASS**. Evidence: section exists verbatim.
3. Exact heading present `## Quality Risks`: **PASS**. Evidence: section exists verbatim.
4. Exact heading present `## Pattern Applicability Matrix`: **PASS**. Evidence: section exists verbatim.
5. Pattern deep-dive section count >=3 with required prefix: **PASS**. Evidence: four `## Pattern Deep Dive — ...` sections.
6. Exact heading present `## Candidate Bugs for Phase 2`: **PASS**. Evidence: section exists verbatim.
7. Exact heading present `## Gate Self-Check`: **PASS**. Evidence: this section.
8. `quality/PROGRESS.md` Phase 1 marked `[x]`: **PASS**. Evidence: `quality/PROGRESS.md` contains `- [x] Phase 1 - Explore`.
9. `Open Exploration Findings` has >=8 numbered findings with file:line citations: **PASS**. Evidence: entries 1-11 each include citations.
10. Multi-location open findings >=3: **PASS**. Evidence: findings 2, 3, 4, 6, 7, 8 trace across multiple files/functions.
11. FULL patterns in matrix between 3 and 4: **PASS**. Evidence: 4 rows marked FULL (Patterns 1,3,4,5).
12. Deep-dive multi-function/multi-location traces >=2: **PASS**. Evidence: Pattern 1 and Pattern 3 sections each trace multiple functions/files.
13. Candidate-bug source mix requirement met: **PASS**. Evidence: bugs from open exploration/quality risks (001,002,004,008) and pattern deep dives (003,006,007).

## Derived Requirements
### REQ-001: `ops.ingest_run` writers MUST use a single normalized run-contract (mandatory `run_id`, canonical status vocabulary, deterministic lifecycle transitions).
- References: `supabase/migrations/202603180009_ops_vegas.sql:3-14`; `supabase/migrations/20260414001_ingest_zl_intraday.sql:50-52`; `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`; `lib/server/ingest-run.ts:3-4`.
- Pattern: parity
- Cartesian check: Gate 1 pass (shared `ingest_run` write role), Gate 2 fail (heterogeneous function structures/languages).

### REQ-002: Verification/auth scaffolding MUST not require `/api/cron` surfaces in this repository; pg_cron-only architecture is authoritative.
- References: `AGENTS.md:44-45`; `AGENTS.md:149-160`; `lib/supabase/proxy.ts:15-42`; `scripts/verify/gate3.sh:5`.
- Pattern: whitelist
- Cartesian check: Gate 1 pass (shared cron-path role), Gate 2 fail (not parallel function-body implementations).

### REQ-003: `/api/zl/intraday` MUST either implement a true 15m→1m fallback or remove fallback claims and associated consumer assumptions.
- References: `app/api/zl/intraday/route.ts:10-16`; `supabase/migrations/202603180002_mkt.sql:17-20`.
- Cartesian check: Gate 1 fail (no parallel implementation set).

### REQ-004: Forecast/dashboard API surfaces, contract types, and parity harness checks MUST agree on envelope semantics (including optional vs required fields).
- References: `lib/contracts/api.ts:3-9`; `scripts/verify/gate6.sh:74-80`; `app/api/zl/live/route.ts:28-33`; `app/api/zl/target-zones/route.ts:74-79`; `app/api/zl/forecast-targets/route.ts:97-100`.
- Pattern: parity
- Cartesian check: Gate 1 pass (shared API-envelope role), Gate 2 fail (heterogeneous implementation/query-script ranges).

### REQ-005: Market risk-factor freshness MUST communicate mixed-vintage state without presenting the oldest component timestamp as canonical freshness.
- References: `app/api/dashboard/risk-factors/route.ts:715-719`; `app/api/dashboard/risk-factors/route.ts:815-819`; `components/dashboard/MarketRiskFactors.tsx:64-77`; `components/dashboard/MarketRiskFactors.tsx:357-358`.
- Pattern: compensation
- Cartesian check: Gate 1 pass (shared freshness-field role), Gate 2 fail (producer/consumer code paths are structurally heterogeneous).

### REQ-006: Horizon normalization MUST be identical across all forecast-facing ZL endpoints.
- References: `app/api/zl/forecast/route.ts:13-24`; `app/api/zl/target-zones/route.ts:13-24`; `app/api/zl/forecast-targets/route.ts:22-33`.
- Pattern: parity
- Cartesian check: Gate 1 pass (same `normalizeHorizon` role), Gate 2 pass (similar-size function-body ranges in each route).

## Derived Use Cases
### UC-01: Record an ingest run lifecycle event across SQL and TS writers.
<!-- cluster: heterogeneous -->
- Actors: pg_cron SQL functions, API/helper writer.
- Preconditions: ingestion job starts or ends.
- Flow: writer inserts/updates `ops.ingest_run` with canonical run id and status semantics.
- Postconditions: run telemetry remains query-consistent across writers.

### UC-02: Verify architecture-compliant auth/gate behavior without cron-route dependency.
<!-- cluster: heterogeneous -->
- Actors: middleware, gate scripts.
- Preconditions: protected route request or verification run.
- Flow: auth/session checks execute; gate checks validate architecture without `/api/cron` assumptions.
- Postconditions: compliant builds are not blocked by forbidden-route checks.

### UC-03: Serve intraday ZL bars with deterministic fallback semantics.
- Actors: `/api/zl/intraday` route.
- Preconditions: user requests intraday bars; 15m dataset may be sparse/unavailable.
- Flow: route executes documented fallback behavior or explicitly returns no-fallback semantics.
- Postconditions: client behavior matches declared API contract.

### UC-04: Enforce consistent envelope contract across all relevant ZL/dashboard API surfaces.
<!-- cluster: heterogeneous -->
- Actors: endpoint routes, parity verifier, typed client consumers.
- Preconditions: routes return success or error payloads.
- Flow: routes and gate use the same required/optional fields and shape rules.
- Postconditions: parity checks fail only on product regressions, not contract drift.

### UC-05: Render risk-factor freshness with transparent mixed-vintage semantics.
<!-- cluster: heterogeneous -->
- Actors: risk-factors API, dashboard card UI.
- Preconditions: driver component dates may differ.
- Flow: API emits freshness metadata; UI renders non-misleading freshness context.
- Postconditions: buyer sees accurate data recency confidence.

### UC-06.a: Normalize horizon values in `/api/zl/forecast`.
- Actors: forecast route.
- Preconditions: rows include `horizon_days` and `model_version`.
- Flow: `normalizeHorizon` maps AG and legacy horizons consistently.
- Postconditions: returned forecast set uses canonical horizons.

### UC-06.b: Normalize horizon values in `/api/zl/target-zones`.
- Actors: target-zones route.
- Preconditions: rows include `horizon_days` and `model_version`.
- Flow: same normalization logic as UC-06.a.
- Postconditions: zone horizons align with forecast horizons.

### UC-06.c: Normalize horizon values in `/api/zl/forecast-targets`.
- Actors: forecast-targets route.
- Preconditions: rows include `horizon_days` and `model_version`.
- Flow: same normalization logic as UC-06.a/b.
- Postconditions: probability-surface targets align with other forecast surfaces.

## Notes for Artifact Generation
- Treat `quality/exploration_role_map.json` as the structural inventory baseline; no Tier 4 `reference_docs/` corpus was available.
- Favor requirements around contract consistency and operational observability first; those produce high-value regression tests quickly.
- When generating Phase 2 artifacts, keep architecture locks explicit: pg_cron ingestion only, Vercel frontend only, 11-specialist vocabulary, future price-level targets.

## Cartesian UC rule confirmation
1. For every REQ with >=2 References, I ran Gate 1 (path-suffix/shared-role match): **Yes** (REQ-001, REQ-002, REQ-004, REQ-005, REQ-006).
2. For every REQ that passed Gate 1, I ran Gate 2 (function-level similarity): **Yes**.
3. Where both gates passed, I emitted per-site UCs (`UC-N.a`, `UC-N.b`, ...): **Yes** (REQ-006 -> UC-06.a/b/c).
4. Where only Gate 1 passed, I marked cluster `<!-- cluster: heterogeneous -->`: **Yes** (UC-01, UC-02, UC-04, UC-05).
5. Where neither gate passed, I kept a single umbrella UC without marking: **Yes** (REQ-003 -> UC-03).
6. For each REQ with a Gate 1 pattern match, I added `Pattern: whitelist|parity|compensation`: **Yes** (REQ-001, REQ-002, REQ-004, REQ-005, REQ-006).
