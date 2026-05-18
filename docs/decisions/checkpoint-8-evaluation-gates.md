# Checkpoint 8: Evaluation Gates — Deep Reasoning

**Date:** 2026-03-20
**Status:** Pending Approval
**Checkpoint:** Migration Plan — Section 10
**Depends on:** All prior checkpoints (gates verify the work those checkpoints planned)

---

## Decision

**6 evaluation gates defined. Gates 1 and 2 can pass NOW with minor verification work. Gate 3 has a structural conflict with the auth deferral decision — it must be SPLIT into Gate 3a (infrastructure security, verifiable now) and Gate 3b (auth enforcement, Phase 9 only). Gates 4-6 require implementation work (Phases 4-10). The gate sequence is correct but the migration plan assumed auth would be wired early — it won't be, so gate criteria must be adjusted.**

---

## Gate-by-Gate Deep Analysis

### Gate 1: Supabase Foundation Verification

**When it can pass:** NOW (with 2 minor tests)

| Criterion | Current State | Passes? | Evidence |
|-----------|--------------|---------|---------|
| Supabase project created and reachable | Created, migrations pushed | **YES** | supabase db push succeeds |
| Cloud reachable from local machine | Migrations pushed via CLI | **YES** | CLI connects to cloud |
| Vercel <> Supabase integration active | Integration configured | **YES** | Env vars auto-populated |
| `vercel env pull` works | Used during setup | **YES** | .env.local generated |
| `/api/health` responds | Live route, queries ops.source_registry | **YES** | Returns { ok: true, dbReachable: true } |
| psycopg2 connection from Python | **UNTESTED** | **NEEDS TEST** | No connection test script exists |
| V16 NOT linked to legacy baseline project | **UNTESTED** | **NEEDS TEST** | Need to run `vercel ls` |

**Action needed:** Create a Python connection test script. Verify Vercel project isolation.

**Data flow trace:** This gate ensures the foundation plumbing works before any data moves through it. Every subsequent gate depends on Gate 1 passing. The /api/health route is the canary — if it can reach ops.source_registry, the entire Supabase connection chain is healthy.

### Gate 2: Schema Integrity

**When it can pass:** NOW (with index verification)

| Criterion | Current State | Passes? | Evidence |
|-----------|--------------|---------|---------|
| All 9 schemas exist | Verified in CP3 | **YES** | 9 schemas, 80 tables |
| Every table has PK | Verified in CP3 | **YES** | BIGSERIAL or specific PK |
| Every table has created_at | Verified in CP3 | **YES** | All 80 tables |
| Every table has ingested_at | Verified in CP3 | **YES** | All 80 tables |
| API route → table trace complete | Verified in CP5 | **YES** | 15 routes, all mapped |
| No orphan tables | Verified in CP3 | **YES** | 0 orphans |
| RLS enabled on all tables | Verified in CP6 | **YES** | Migration 0010 |
| Indexes on date/symbol columns | **NEEDS VERIFICATION** | **LIKELY YES** | Migration 0010 has dynamic index creation |

**Data flow trace:** Gate 2 ensures every table has structural integrity before writes begin. The CP3 audit was thorough — 80 tables, all with PK + created_at + ingested_at + unique constraints. The only unverified item is whether the dynamic index creation in migration 0010 actually created all expected indexes (need to query `\di` on cloud).

### Gate 3: Auth & Security Verification — MUST BE SPLIT

**Problem:** The migration plan assumes auth is wired early. We explicitly decided to defer auth activation until the app is fully built (agents struggle with login). Gate 3 as written includes both infrastructure security (verifiable now) and auth enforcement (Phase 9).

**Proposed split:**

#### Gate 3a: Infrastructure Security (can verify NOW)

| Criterion | Current State | Passes? | Evidence |
|-----------|--------------|---------|---------|
| No service_role in browser code | Verified in CP6 | **YES** | `import "server-only"` guard, 1 file only |
| NEXT_PUBLIC vars clean | Verified in CP6 | **YES** | Only anon key + URL + site URL |
| Python uses direct connection for bulk writes | Architecture verified | **YES** | psycopg2 port 5432 in config |
| service_role key isolated | Verified in CP6 | **YES** | lib/server/supabase-admin.ts only |

#### Gate 3b: Auth Enforcement (Phase 9 ONLY)

| Criterion | Current State | Passes? | Blocked By |
|-----------|--------------|---------|------------|
| API keys in Vault | **NOT STORED** | **NO** | Phase 4 (before first ingestion) |
| pg_cron functions use current_setting() | **NOT WRITTEN** | **NO** | Phase 4 |
| RLS blocks unauthenticated reads | **UNTESTED** | **DEFERRED** | Auth activation (Phase 9) |
| Auth callback works | **NO MIDDLEWARE** | **DEFERRED** | Phase 9 |

**Why this matters:** If Gate 3 is treated as a single checkpoint, it blocks Phases 4-8 unnecessarily. Splitting it lets us verify security infrastructure NOW and defer auth enforcement to Phase 9 where it belongs.

### Gate 4: Data Flow Verification

**When it can pass:** After Phases 4-7

| Criterion | Blocked By | Phase |
|-----------|-----------|-------|
| pg_cron functions write rows | Functions not written | Phase 4 |
| API routes return expected shape | Routes are scaffolds | Phase 2 (chart), Phase 7-8 (rest) |
| Chart renders real data | Chart not rewritten, no data | Phase 2 |
| Target Zones render in ProbabilitySurface | Card consumes `/api/zl/target-zones` | Phase 7 |
| Live price updates | No ingest function, no rollup | Phase 4 |
| Freshness monitor fires | Not wired | Phase 4 |

**Data flow trace (what must happen):**
1. API keys stored in Vault (Phase 4 prerequisite)
2. First pg_cron function (ingest_databento_daily) writes to mkt.price_1d
3. /api/zl/price-1d wired to query mkt.price_1d (bucket_ts → tradeDate alias)
4. Chart component rewritten to consume price data
5. Repeat for all 16 Tier A functions and corresponding routes

**This is the largest gate.** It validates the entire data ingestion → API → UI pipeline end-to-end.

### Gate 5: Python Pipeline Verification

**When it can pass:** After Phase 5

| Criterion | Blocked By | Dependency Chain |
|-----------|-----------|-----------------|
| build_matrix writes | Scaffold | Needs cloud data (Gate 4 must pass first) |
| 11 specialists complete | Scaffold | Needs matrix + raw data |
| 33 signal columns | Scaffold | Needs specialist features |
| Training runs complete | Scaffold + **GATED** | Needs matrix + signals + user approval |
| Forward inference | Scaffold | Needs trained models |
| Monte Carlo 10K runs | Scaffold + **ORDER BUG** | Needs GARCH first (CP7 bug) |
| Target zones P30/P50/P70 | Scaffold | Needs MC + forecast |
| Dashboard reads targets | Chart not wired | Needs promote_to_cloud + API wiring |

**Critical dependency:** Gate 5 requires Gate 4 to pass first. The Python pipeline reads from cloud Supabase tables that are populated by pg_cron ingestion (Gate 4). Without real data in the cloud, the pipeline has nothing to process.

**Dependency chain:** Gate 1 → Gate 2 → Gate 4 (data in) → Gate 5 (process data) → Gate 4 again (verify UI reads it)

### Gate 6: Parity Verification (legacy baseline vs V16)

**When it can pass:** Phase 10 (final)

| Criterion | What's Needed |
|-----------|--------------|
| Same OHLCV data | legacy baseline running, V16 live, diff API responses |
| Same latest price | Compare timestamps within tolerance |
| Same Target Zones | Side-by-side chart comparison |
| Same dashboard cards | Screenshot comparison |
| Same sentiment feed | Visual comparison |
| Same Vegas Intel | Data comparison |

**This gate requires legacy baseline to be running.** It's the cutover gate — once it passes, legacy baseline can be turned off.

---

## Gate Dependency Map (Corrected for Auth Deferral)

```
Gate 1 (Foundation)    → NOW ──────────────────────────────────────┐
Gate 2 (Schema)        → NOW ──────────────────────────────────────┤
Gate 3a (Infra Security) → NOW ────────────────────────────────────┤
                                                                    │
                         ┌──────────── IMPLEMENTATION ──────────────┘
                         │
Gate 4 (Data Flow)     → Phase 4-7 (ingestion + API wiring + chart)
Gate 5 (Pipeline)      → Phase 5 (after Gate 4 has data flowing)
Gate 3b (Auth Enforce) → Phase 9 (auth activation, last before parity)
Gate 6 (Parity)        → Phase 10 (legacy baseline vs V16 side-by-side)
```

**Key insight:** Gates 1, 2, 3a can pass NOW. Everything else requires building.

---

## Systemic Gaps

| # | Gap | Impact | Resolution |
|---|-----|--------|-----------|
| 1 | Gate 3 assumes early auth — conflicts with deferral decision | Medium | Split into 3a (now) and 3b (Phase 9) |
| 2 | Gate 5 depends on Gate 4 — not stated in migration plan | High | Make dependency explicit |
| 3 | No gate for Tier C promote_to_cloud.py | Medium | Add to Gate 5 criteria |
| 4 | No gate for ProFarmer scraper | Low | Add to Gate 4 or separate Gate 4b |
| 5 | Index verification not done for Gate 2 | Low | Query cloud \di |
| 6 | psycopg2 connection test missing for Gate 1 | Low | Create test script |

---

## Verification Checklist

| Rule | Passes? | Note |
|------|---------|------|
| All 6 gates defined with criteria | Yes | Section 10 complete |
| Gate dependencies mapped | **Updated** | Auth deferral creates split |
| Gates match execution phases | **Partially** | Gate 3 conflict resolved by split |
| Deep data flow traced per gate | Yes | Each gate traced end-to-end |
| Passable gates identified | Yes | Gates 1, 2, 3a can pass now |

---

## Implementation Implications

1. **NOW:** Run Gate 1 remaining tests (psycopg2 connection, Vercel project isolation)
2. **NOW:** Verify Gate 2 indexes via cloud query
3. **NOW:** Gate 3a already passes (CP6 verified)
4. **Phase 4:** Gate 3b partial — store API keys in Vault
5. **Phase 4-7:** Build toward Gate 4
6. **Phase 5:** Build toward Gate 5 (depends on Gate 4)
7. **Phase 9:** Gate 3b — activate auth, verify enforcement
8. **Phase 10:** Gate 6 — legacy baseline/V16 parity check

---

## Sources

- docs/plans/2026-03-17-v16-migration-plan.md — Section 10
- All prior checkpoint decision docs (CP1-CP7)
- User feedback: "leave the login function off until the app is fully complete"
