## Documentation status: code-only mode

No `reference_docs/` content was found for this run. The playbook is operating in a documented mode, not a failure — see [`references/code-only-mode.md`](../../references/code-only-mode.md) for what to expect and how to upgrade. The playbook is operating in **code-only mode** — requirements are derived from code, comments, defensive patterns, tests, and any inline documentation. This typically produces fewer requirements and fewer findings than a run with `reference_docs/` content.

See [`references/code-only-mode.md`](../../references/code-only-mode.md) for details and how to provide documentation for the next run.

---

## Open Exploration Findings
1. The intraday route documents a two-step degradation path (15-minute then 1-minute) but currently executes only the 15-minute query and always labels the source as `mkt.price_15m`. This creates a silent parity gap between stated fallback behavior and actual execution. Trace: `app/api/zl/intraday/route.ts:16-23`, `app/api/zl/intraday/route.ts:41-46`, `supabase/migrations/202603180002_mkt.sql:18-19`.

2. Dashboard target-zone plumbing is active up to the chart boundary, but the forecast overlay primitive is hard-disabled by constant gate, so fetched zones never render on the chart surface. Trace: `app/(protected)/dashboard/page.tsx:16-33`, `components/chart/ZlCandlestickChart.tsx:40`, `components/chart/ZlCandlestickChart.tsx:257-269`, `lib/chart/ForecastTargetsPrimitive.ts:112-124`.

3. Two APIs exposing near-identical forecast target semantics return different envelopes. `/api/zl/target-zones` uses `ApiEnvelope<TargetZone[]>`, while `/api/zl/forecast-targets` emits a custom `{asOfDate, targets}` body. Downstream consumers branch on different parsing contracts. Trace: `lib/contracts/api.ts:3-9`, `app/api/zl/target-zones/route.ts:80-87`, `app/api/zl/forecast-targets/route.ts:103-106`, `app/(protected)/dashboard/page.tsx:17-20`, `components/dashboard/ProbabilitySurface.tsx:62-83`.

4. `ops.ingest_run.status` has no enforced enum in schema, and active writers use incompatible vocabularies (`running/ok/failed` in SQL jobs versus `RUNNING/SUCCESS/FAILED` in TS helper). This is a cross-implementation contract drift likely to fragment ops analytics. Trace: `supabase/migrations/202603180009_ops_vegas.sql:3-8`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:138-141`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:218-221`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`, `lib/server/ingest-run.ts:3-4`, `lib/server/ingest-run.ts:17-18`, `lib/server/ingest-run.ts:38-39`, `lib/server/ingest-run.ts:58-59`.

5. Training safety gates are present and explicit for both model training and cloud promotion, but downstream forecast/GARCH/Monte Carlo/target-zone generation phases remain scaffold-only. The pipeline therefore protects execution approval while still containing non-implemented production phases. Trace: `python/fusion/pipeline.py:32-43`, `python/fusion/pipeline.py:54-58`, `python/fusion/pipeline.py:66-75`, `python/fusion/train_models.py:674-675`, `python/fusion/train_models.py:770-773`, `python/fusion/promote_to_cloud.py:148-156`, `python/fusion/promote_to_cloud.py:172-173`, `python/fusion/generate_forward_forecasts.py:4-10`, `python/fusion/run_garch.py:4-10`, `python/fusion/run_monte_carlo.py:4-10`, `python/fusion/generate_target_zones.py:4-10`.

6. Auth composition is layered and consistent: protected pages are guarded at route-group layout level and APIs call a shared authenticated-request guard that returns explicit 401/503 envelopes. Trace: `app/(protected)/layout.tsx:5-7`, `lib/server/auth-guards.ts:7-13`, `lib/server/auth-guards.ts:16-25`, `lib/server/auth-guards.ts:28-38`, `app/api/zl/live/route.ts:9-12`.

7. AI-first card routes share a consistent “snapshot + trusted-market pull + DB fallback” composition pattern with provenance expectations and instruction payloads, but they still execute external pulls at request time, increasing latency/availability coupling on user reads. Trace: `app/api/strategy/posture/route.ts:142-147`, `app/api/strategy/posture/route.ts:148-169`, `app/api/sentiment/overview/route.ts:188-193`, `app/api/legislation/feed/route.ts:261-266`, `app/api/vegas/intel/route.ts:169-174`, `lib/server/trusted-market-sources.ts:37-43`, `lib/server/trusted-market-sources.ts:139-146`.

8. Tier-2 supplemental docs under `reference_docs/` are effectively sentinel-only for this run; test contracts assert only `.gitkeep` presence. Exploration therefore relied on Tier-3 source evidence as instructed. Citation: `scripts/tests/test_qplaybook_wrapper.py:66-69`.

9. Landing and onboarding docs show contract drift: root README remains generic starter content (including localhost:3000 guidance), while V16 rules prohibit hardcoded 3000 and require project-specific operational truth. Trace: `README.md:1-4`, `README.md:95`, `AGENTS.md:53`, `docs/INDEX.md:1-9`.

10. Role-map artifact conforms to required provenance and captures explicit skill-tool linkage for SQL scripts named by skill prose, which is critical for later Phase 4 prose-to-code divergence checks. Trace: `quality/exploration_role_map.json:1-5`, `quality/exploration_role_map.json:85-90`.

## Quality Risks
- **High:** Intraday fallback parity defect can produce stale/missing sub-hour bars during partial upstream outages because the stated 1-minute fallback is not executed (`app/api/zl/intraday/route.ts:16-23`, `supabase/migrations/202603180002_mkt.sql:18-19`).
- **High:** Target-zone overlays are effectively disabled at render-time even when zone data exists, reducing decision-support visibility for buyer timing (`components/chart/ZlCandlestickChart.tsx:40`, `components/chart/ZlCandlestickChart.tsx:260-269`, `app/(protected)/dashboard/page.tsx:16-33`).
- **Medium:** Ingest status vocabulary drift (`ok/failed/running` vs `SUCCESS/FAILED/RUNNING`) can break dashboards, filters, and alerts keyed to a single status taxonomy (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`, `lib/server/ingest-run.ts:3-4`, `lib/server/ingest-run.ts:38-39`).
- **Medium:** Forecast pipeline stages beyond training gate remain scaffolded, so probability statements and downstream targets risk lagging behind UI expectations if runbook assumptions treat these steps as operational (`python/fusion/generate_forward_forecasts.py:4-10`, `python/fusion/run_monte_carlo.py:4-10`, `python/fusion/generate_target_zones.py:4-10`).
- **Medium:** Runtime read-path dependence on live external feeds inside API handlers can degrade user-facing page reliability during third-party outages (`lib/server/trusted-market-sources.ts:50-63`, `app/api/strategy/posture/route.ts:145-147`, `app/api/sentiment/overview/route.ts:191-193`).
- **Low:** Documentation drift between project authority docs and root README can mislead operators and new contributors on environment and startup expectations (`README.md:95`, `AGENTS.md:53`, `docs/INDEX.md:3-10`).

## Pattern Applicability Matrix
| Pattern | Decision | Reason |
| --- | --- | --- |
| Fallback and Degradation Path Parity | FULL | Multiple explicit fallback claims exist in routes/functions and at least one parity gap is visible. |
| Dispatcher Return-Value Correctness | SKIP | Dispatch-heavy status combinatorics are limited in this codebase; higher-risk gaps were contract/fallback related. |
| Cross-Implementation Contract Consistency | FULL | Same logical contracts are implemented across TS routes, SQL jobs, and helper modules with observable drift. |
| Enumeration and Representation Completeness | FULL | Closed sets (horizons, specialists, trusted sources) are central and need completeness checks against consumers/contracts. |
| API Surface Consistency | FULL | Multiple API surfaces expose related semantic payloads with diverging envelopes and error shapes. |
| Spec-Structured Parsing Fidelity | SKIP | Structured grammar parsing exists but is secondary risk relative to active contract and fallback inconsistencies this phase. |
| Composition and Mount-Context Awareness | SKIP | Mount/composition bugs were not the dominant defect class versus data-contract and operational-path issues. |

## Pattern Deep Dive — Fallback and Degradation Path Parity
- **Cascade:** ZL intraday retrieval.
Primary path currently queries `mkt.price_15m` and emits `source: "mkt.price_15m"` (`app/api/zl/intraday/route.ts:17-23`, `app/api/zl/intraday/route.ts:45`).
Documented fallback claim says 15-minute then 1-minute (`app/api/zl/intraday/route.ts:16`), and schema contracts provision `mkt.price_1m` (`supabase/migrations/202603180002_mkt.sql:18-19`).
Parity gap: no branch executes the fallback table.
- **Cascade:** Trusted site fill live pulls with prior-day carry-forward.
Primary path uses HTTP market pulls (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:108-167`); fallback carries last known values from `analytics.dashboard_metrics` (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:169-199`).
Parity observation: fallback preserves continuity but may violate freshness invariants if long outages persist.
- **Candidate requirements:**
REQ-001: `app/api/zl/intraday` must execute the documented 15m→1m fallback behavior when primary query returns no usable bars.
REQ-005: Fallback carry-forward paths must emit an explicit staleness marker to preserve freshness invariants.

## Pattern Deep Dive — Cross-Implementation Contract Consistency
- **Operation:** `ops.ingest_run` lifecycle status semantics.
Implementation A (SQL jobs) writes lower-case runtime statuses (`running`, `ok`, `failed`) (`supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:138-141`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:218-221`).
Implementation B (TS helper) writes upper-case statuses (`RUNNING`, `SUCCESS`, `FAILED`) (`lib/server/ingest-run.ts:3-4`, `lib/server/ingest-run.ts:17-18`, `lib/server/ingest-run.ts:38-39`, `lib/server/ingest-run.ts:58-59`).
Gap: two producers implement incompatible value vocabularies for one table contract.
- **Operation:** Forecast-target transport contract across similar route handlers.
Implementation A (`/api/zl/target-zones`) uses `ApiEnvelope<TargetZone[]>` (`app/api/zl/target-zones/route.ts:5`, `app/api/zl/target-zones/route.ts:80-87`).
Implementation B (`/api/zl/forecast-targets`) uses custom body contract (`app/api/zl/forecast-targets/route.ts:103-106`).
Gap: contract divergence forces consumer-specific parsing instead of shared typed behavior (`components/dashboard/ProbabilitySurface.tsx:62-83`, `app/(protected)/dashboard/page.tsx:17-20`).
- **Candidate requirements:**
REQ-002: All forecast-target APIs serving dashboard surfaces must implement one normalized envelope contract.
REQ-003: All writers to `ops.ingest_run.status` must share one canonical status vocabulary.

## Pattern Deep Dive — Enumeration and Representation Completeness
- **Closed set:** Big-11 specialist model roster.
Authoritative source lists 11 specialists (`AGENTS.md:40`, `AGENTS.md:99`) and pipeline config defines 11 specialist keys (`python/fusion/config.py:7-19`).
Landing module cards enumerate the same full surface, including `trump_effect` (`app/page.tsx:27-34`, `app/page.tsx:304-307`).
Finding: representation appears complete across these three surfaces.
- **Closed set:** Forecast horizon normalization.
Authoritative horizon set is `[30, 90, 180]` (`python/fusion/config.py:21`, `app/api/zl/forecast/route.ts:7`, `app/api/zl/target-zones/route.ts:7`, `app/api/zl/forecast-targets/route.ts:16`).
Legacy remap path handles `[7, 14, 30]` for `trusted-fill-v1` model versions (`app/api/zl/forecast/route.ts:8-12`, `app/api/zl/target-zones/route.ts:8-12`, `app/api/zl/forecast-targets/route.ts:17-21`).
Finding: normalization set is complete across the three route surfaces.
- **Closed set:** Trusted snapshot source allowlist.
Snapshot acceptance is hard-gated to four source strings (`lib/server/ai-snapshot.ts:21-27`, `lib/server/ai-snapshot.ts:47-50`), with per-page snapshot loaders registered (`lib/server/ai-snapshot.ts:28-39`).
Risk note: future source additions must update the allowlist or snapshots silently fail closed.
- **Candidate requirements:**
REQ-004: Any new AI snapshot producer identifier must be added to `TRUSTED_SNAPSHOT_SOURCES` in the same change as snapshot generation wiring.

## Pattern Deep Dive — API Surface Consistency
- **Surface pair:** `/api/zl/target-zones` vs `/api/zl/forecast-targets`.
Surface A returns `{ok,data,asOf,source}` (`app/api/zl/target-zones/route.ts:80-87`).
Surface B returns `{asOfDate,targets}` with custom error shape (`app/api/zl/forecast-targets/route.ts:59-63`, `app/api/zl/forecast-targets/route.ts:103-110`).
Divergence: shared domain data requires separate parsing branches in consumers (`app/(protected)/dashboard/page.tsx:17-20`, `components/dashboard/ProbabilitySurface.tsx:62-83`).
- **Surface pair:** Dashboard API envelope conventions.
Most ZL/dashboard routes expose `ApiEnvelope` (`app/api/zl/live/route.ts:34-39`, `app/api/zl/price-1d/route.ts:137-144`, `app/api/dashboard/metrics/route.ts:57-62`).
`/api/dashboard/risk-factors` returns a custom payload and on errors emits `{error}` without `ok/data/asOf` (`app/api/dashboard/risk-factors/route.ts:821-878`, `app/api/dashboard/risk-factors/route.ts:879-883`).
Divergence: component fetchers for risk factors bypass generic envelope assumptions (`components/dashboard/MarketIntelligenceRow.tsx:15-17`, `components/dashboard/MarketIntelligenceRow.tsx:29-37`, `components/dashboard/MarketSymbolPressureBar.tsx:10-21`).
- **Candidate requirements:**
REQ-006: Dashboard route family must converge on a single envelope/error contract or publish explicit per-route contracts with typed client adapters.

## Candidate Bugs for Phase 2
1. `app/api/zl/intraday` does not implement the declared 1-minute fallback path, causing degradation behavior mismatch under sparse 15-minute data.
Stage: open exploration
Evidence: `app/api/zl/intraday/route.ts:16-23`, `supabase/migrations/202603180002_mkt.sql:18-19`.

2. Chart forecast target overlay is disabled by constant flag, so target zones are fetched but never visualized in the hero chart.
Stage: open exploration
Evidence: `app/(protected)/dashboard/page.tsx:16-33`, `components/chart/ZlCandlestickChart.tsx:40`, `components/chart/ZlCandlestickChart.tsx:260-269`.

3. `ops.ingest_run.status` casing/term mismatch across SQL and TS writers may break status dashboards and alert filters.
Stage: open exploration + Cross-Implementation Contract Consistency
Evidence: `supabase/migrations/20260414001_ingest_zl_intraday.sql:138-141`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`, `lib/server/ingest-run.ts:3-4`, `lib/server/ingest-run.ts:38-39`.

4. Forecast target routes expose divergent body contracts for equivalent semantic payloads, increasing client fragility and parser duplication.
Stage: API Surface Consistency
Evidence: `app/api/zl/target-zones/route.ts:80-87`, `app/api/zl/forecast-targets/route.ts:103-106`, `components/dashboard/ProbabilitySurface.tsx:62-83`.

5. Runtime third-party market pulls inside user-facing API handlers can block read availability during feed outages despite AI-first cadence intent.
Stage: quality risks
Evidence: `lib/server/trusted-market-sources.ts:50-63`, `app/api/strategy/posture/route.ts:145-147`, `app/api/sentiment/overview/route.ts:191-193`.

6. Root README remains starter-template guidance and includes hardcoded localhost:3000, creating operational drift versus V16 authority docs.
Stage: quality risks
Evidence: `README.md:1-4`, `README.md:95`, `AGENTS.md:53`, `docs/INDEX.md:3-10`.

## Gate Self-Check
1. **EXPLORATION length ≥120 lines:** PASS. Evidence: file currently exceeds 120 lines.
2. **Heading present `## Open Exploration Findings`:** PASS. Evidence: section exists and is first required heading.
3. **Heading present `## Quality Risks`:** PASS. Evidence: section exists with cited risk bullets.
4. **Heading present `## Pattern Applicability Matrix`:** PASS. Evidence: section exists with exhaustive pattern table.
5. **Pattern deep-dive sections (`## Pattern Deep Dive — ...`) count ≥3:** PASS. Evidence: 4 deep-dive sections are present.
6. **Heading present `## Candidate Bugs for Phase 2`:** PASS. Evidence: numbered candidate list exists.
7. **Heading present `## Gate Self-Check`:** PASS. Evidence: this section exists.
8. **`quality/PROGRESS.md` Phase 1 marked `[x]`:** PASS. Evidence: `quality/PROGRESS.md` has `- [x] Phase 1 - Explore`.
9. **Open exploration findings count ≥8 with file:line citations:** PASS. Evidence: 10 numbered findings, each with file:line citation(s).
10. **Open exploration has ≥3 multi-location traces:** PASS. Evidence: findings 1, 2, 3, 4, 5, 7, and 9 each cite multiple locations.
11. **Pattern matrix FULL rows between 3 and 4 inclusive:** PASS. Evidence: 4 rows marked `FULL`.
12. **At least 2 deep dives show multi-function/multi-location trace:** PASS. Evidence: deep dives for Fallback, Cross-Implementation, and API Surface each trace multiple functions/files.
13. **Candidate bug source mix (≥2 from open/risks and ≥1 from pattern deep dive):** PASS. Evidence: items 1,2 from open exploration; items 5,6 from quality risks; items 3,4 from pattern deep dives.

## Derived Requirements and Use Cases
### REQ-001: Intraday API must honor declared fallback behavior
- References: `app/api/zl/intraday/route.ts:16-23`, `supabase/migrations/202603180002_mkt.sql:18-19`
- Pattern: parity
- Gate 1 (path-suffix match): FAIL
- Gate 2 (function-level similarity): NOT APPLICABLE

### UC-1: Serve intraday bars with actual fallback execution
- Actors: dashboard chart reader, ZL intraday API route
- Preconditions: `mkt.price_15m` can be sparse or unavailable while `mkt.price_1m` still has data
- Flow: query 15m bars; if empty/non-usable, query 1m bars; return normalized payload with explicit source tag
- Postconditions: intraday route behavior matches documented fallback contract

### REQ-002: Forecast target endpoints must expose one stable envelope contract
- References: `app/api/zl/target-zones/route.ts:80-87`, `app/api/zl/forecast-targets/route.ts:103-106`, `components/dashboard/ProbabilitySurface.tsx:62-83`
- Pattern: parity
- Gate 1 (path-suffix match): PASS (`target-zones/route.ts` and `forecast-targets/route.ts` are sibling route handlers for same domain operation)
- Gate 2 (function-level similarity): PASS (both cited ranges are in `GET` function return paths with similar envelope-construction size)

### UC-2.a: Target-zone endpoint emits canonical envelope
- Actors: dashboard target-zone bootstrap loader
- Preconditions: latest `forecasts.target_zones` rows exist
- Flow: route returns canonical `ApiEnvelope<TargetZone[]>`
- Postconditions: consumer parses via shared envelope adapter

### UC-2.b: Forecast-target endpoint emits canonical envelope
- Actors: probability-surface loader
- Preconditions: latest `forecasts.target_zones` rows exist
- Flow: route returns same canonical envelope shape used by sibling target route
- Postconditions: probability surface and dashboard share one parser contract

### REQ-003: All `ops.ingest_run` writers must use one status vocabulary
- References: `lib/server/ingest-run.ts:3-4`, `lib/server/ingest-run.ts:17-18`, `supabase/migrations/20260414001_ingest_zl_intraday.sql:138-141`, `supabase/migrations/202605080003_supabase_trusted_site_fill_hourly.sql:55-57`
- Pattern: compensation
- Gate 1 (path-suffix match): FAIL
- Gate 2 (function-level similarity): NOT APPLICABLE

### UC-3: Ingest status normalization for all write paths
- Actors: pg_cron ingest jobs, TS ingest helper, ops dashboards/alerts
- Preconditions: write access to `ops.ingest_run`
- Flow: all producers write canonical enum values; readers no longer need producer-specific normalization
- Postconditions: run-state analytics are deterministic across ingestion paths

### REQ-004: Training/promotion execution requires explicit approval in non-dry runs
- References: `python/fusion/pipeline.py:54-58`, `python/fusion/train_models.py:770-773`, `python/fusion/promote_to_cloud.py:172-173`
- Pattern: whitelist
- Gate 1 (path-suffix match): PASS (`run` functions across pipeline stage executors)
- Gate 2 (function-level similarity): FAIL

### UC-4: Approval-gated model execution
- Actors: pipeline operator, training/promote executors
- Preconditions: non-dry run requested
- Flow: pipeline dispatches `run`; train/promote paths reject execution unless explicit approval flag is present
- Postconditions: no unauthorized training or cloud promotion occurs
<!-- cluster: heterogeneous -->

## Cartesian UC rule confirmation
1. For every REQ with ≥2 References, I ran Gate 1 (path-suffix match). **Confirmed.**
2. For every REQ that passed Gate 1, I ran Gate 2 (function-level similarity). **Confirmed for REQ-002 and REQ-004.**
3. Where both gates passed, I emitted per-site UCs (UC-N.a, UC-N.b, …). **Confirmed for REQ-002 (UC-2.a and UC-2.b).**
4. Where only Gate 1 passed, I marked the cluster `<!-- cluster: heterogeneous -->`. **Confirmed for REQ-004.**
5. Where neither gate passed, I kept a single umbrella UC without marking. **Confirmed for REQ-001 and REQ-003.**
6. For each REQ with a pattern match in Gate 1, I added `Pattern: whitelist|parity|compensation` to the REQ block. **Confirmed.**
