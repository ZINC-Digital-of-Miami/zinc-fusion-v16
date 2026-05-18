# Checkpoint 9: Phased Execution Sequence — Deep Reasoning

**Date:** 2026-03-20
**Status:** Pending Approval
**Checkpoint:** Migration Plan — Section 11
**Depends on:** All prior checkpoints (this reconciles findings against execution order)

---

## Decision

**The 11-phase execution sequence is structurally correct but needs 5 corrections based on prior checkpoint findings. Phases 0, 1, and 1.5 are COMPLETE. Phase 2 (Chart + Live Price) is the critical path blocker — everything downstream depends on it. The plan's step lists for Phases 4 and 6 are outdated (don't reflect CP4 consolidation). Phase 5 has the GARCH/MC order bug (CP7). Phase 9 gate reference is outdated (CP8 split).**

---

## Phase Status Summary

| Phase | Name | Status | Completion |
|-------|------|--------|-----------|
| **0** | Infrastructure Foundation | **COMPLETE** | All steps done except psycopg2 formal test |
| **1** | Schema & Seed | **COMPLETE** | 80 tables, RLS, indexes (Gate 2 ~95%) |
| **1.5** | Page Rewrites | **COMPLETE** | All 6 pages, zero mock data, zero legacy baseline code |
| **2** | Read Path — Chart & Live Price | **NOT STARTED** | Critical path blocker |
| **3** | Landing Page Completion | **PARTIALLY DONE** | Shell exists, missing 3 specialist cards + method section |
| **4** | Data Ingestion — Critical pg_cron | **NOT STARTED** | Plan needs updating for CP4 consolidation |
| **5** | Python Pipeline Rebuild | **NOT STARTED** | GARCH/MC order bug (CP7) |
| **6** | Remaining Data Ingestion | **NOT STARTED** | Plan needs updating for CP4 consolidation |
| **7** | Dashboard Completion | **NOT STARTED** | Depends on Phase 5 |
| **8** | Secondary Pages | **NOT STARTED** | Complex multi-table routes (CP5) |
| **9** | Auth, Security, Observability | **NOT STARTED** | Auth hardware wired, activation deferred |
| **10** | Parallel Validation & Cutover | **NOT STARTED** | Final |

---

## Critical Path

```
Phase 0 ✅ → Phase 1 ✅ → Phase 1.5 ✅ → Phase 2 ⬛ → Phase 4 ⬛ → Phase 5 ⬛ → Phase 7 ⬛ → Phase 8 ⬛ → Phase 9 ⬛ → Phase 10 ⬛
                                              │
                                              ├── Phase 3 (can overlap with Phase 2-4)
                                              └── Phase 6 (can overlap with Phase 4-5)
```

**Phase 2 is the bottleneck.** The chart is the product. Without a working chart, nothing else matters.

---

## Corrections Required (from Prior Checkpoints)

### Correction 1: Phase 4 Step List Outdated (from CP4)

**Plan says (steps 4.2-4.8):** 7 separate ingestion functions:
- ingest_zl_daily, ingest_zl_intraday, ingest_fred, ingest_databento_futures, ingest_databento_options, ingest_fx_daily, ingest_etf_daily

**CP4 correction:** Consolidated to 4 functions:
- **ingest_databento_daily** (absorbed zl_daily + databento_futures + fx_daily + etf_daily)
- ingest_zl_intraday (stays separate — different cadence)
- **ingest_fred** (absorbed nyfed_daily)
- ingest_databento_options (stays separate — different data format)

Phase 4 now has ~21 functions (down from 25). Only genuine garbage removed — 2 deleted, 1 moved to Tier B, 2 merged. Databento functions STAY SEPARATE (different symbol sets, different failure domains). All daily functions spread overnight starting 2 AM CT, 15 min apart.

### Correction 2: Phase 5 Steps 5.7/5.8 Wrong Order (from CP7)

**Plan says:** 5.7 = run_monte_carlo, 5.8 = run_garch

**CP7 correction:** Must be 5.7 = run_garch, 5.8 = run_monte_carlo. MC depends on GARCH volatility output.

### Correction 3: Phase 6 Steps Outdated (from CP4)

**Plan says (step 6.3):** Build ingest_eia_biodiesel separately
**CP4 correction:** Merged into ingest_supply_monthly

**Plan says (step 6.9):** Build ingest_board_crush as pg_cron http function
**CP4 correction:** Moved to Tier B — it's a SQL derivation from existing futures data, not an API call

### Correction 4: Phase 8 Needs Complex Query Notes (from CP5)

**CP5 found:**
- `/api/sentiment/overview` needs 2-table aggregation (alt.news_events + mkt.cftc_1w)
- `/api/legislation/feed` needs 3-table UNION (legislation_1d + executive_actions + congress_bills)
- `/api/vegas/intel` needs 7-table aggregation (all vegas.* tables)
- Vegas Glide integration path still undefined

These are not simple single-table reads. Phase 8 is the most complex wiring phase.

### Correction 5: Phase 9 Gate Reference Outdated (from CP8)

**Plan says (step 9.3):** Run Gate 3

**CP8 correction:** Gate 3 is split. Gate 3a (infrastructure security) already passes. Phase 9 runs Gate 3b (auth enforcement) only.

---

## Phase-by-Phase Deep Analysis

### Phase 2: Chart + Live Price (CRITICAL PATH)

**What must happen:**
1. Export historical ZL data from legacy baseline or pull from Databento API directly
2. Import into mkt.price_1d (manual seed — not pg_cron, just a one-time data load)
3. Wire /api/zl/price-1d to query mkt.price_1d with `bucket_ts AS "tradeDate"` alias (CP5 finding)
4. Rewrite LightweightZlCandlestickChart FROM SCRATCH (most complex single component)
5. Keep Target Zones out of the chart; render them only in ProbabilitySurface
6. Wire /api/zl/live to query mkt.latest_price
7. Rewrite useZlLivePrice hook

**Risk:** The chart rewrite is the hardest single task. legacy baseline's chart has precise settings that must be studied (not copied) and reproduced. lightweight-charts library version, crosshair behavior, time scale, price scale — all must match.

**Dependency:** Nothing else makes sense without the chart working. Chris opens the dashboard to SEE the chart. Every other feature is secondary.

### Phase 3: Landing Page (can overlap)

**Already done:** Hero section, NeuralSphere, 8 specialist cards, CTA, footer
**Remaining:** 3 specialist cards (tariff, substitutes, trump_effect), method section, chart teaser

**Can overlap with Phase 2-4.** Landing page completion doesn't depend on data flow. The chart teaser (step 3.6) depends on Phase 2's chart component being built.

### Phase 4: Data Ingestion (corrected)

**Corrected step count:** ~9 functions instead of ~11

| Corrected Step | Function | Tables |
|---------------|----------|--------|
| 4.1 | Store API keys in Vault | — |
| 4.2 | **ingest_databento_daily** (parameterized) | mkt.price_1d, futures_1d, fx_1d, etf_1d |
| 4.3 | ingest_zl_intraday | mkt.price_1h, price_15m |
| 4.4 | **ingest_fred** (includes NYFED) | econ.* (8 tables) |
| 4.5 | ingest_databento_options | mkt.options_1d |
| 4.6 | ingest_cftc_weekly | mkt.cftc_1w |
| 4.7 | Register pg_cron schedules | — |
| 4.8 | check_freshness | ops.pipeline_alerts |
| 4.9 | Tier B: latest_price_rollup + stale_runs | mkt.latest_price, ops |

### Phase 5: Python Pipeline (corrected order)

**Corrected phase order:**
1. build_matrix (reads cloud) — can run parallel with step 2
2. generate_specialist_features (reads cloud) — can run parallel with step 1
3. generate_specialist_signals (reads local from step 2)
4. train_models (reads local from steps 1+3) — **GATED**
5. generate_forward_forecasts (reads local from step 4)
6. **run_garch** (reads cloud) — MOVED UP from step 8
7. **run_monte_carlo** (reads local from steps 5+6) — MOVED DOWN from step 7
8. generate_target_zones (reads local from steps 5+6+7)
9. promote_to_cloud — **NEW**, not in original scaffold

### Phase 6: Remaining Ingestion (corrected)

**Removed:** ingest_eia_biodiesel (merged into supply_monthly)
**Changed:** ingest_board_crush → Tier B SQL job (not API call)

| Step | Function | Tables |
|------|----------|--------|
| 6.1 | **ingest_supply_monthly** (includes EIA biodiesel) | supply.* (6 tables) |
| 6.2 | ingest_usda_exports + ingest_usda_wasde | supply.usda_* |
| 6.3 | ingest_biofuel_policy | supply.epa_rin + lcfs + alt.news_events |
| 6.4 | ingest_legislation | alt.* (4 tables) |
| 6.5 | ingest_news | alt.news_events |
| 6.6 | ingest_trade_policy | alt.ice + tariff_deadlines |
| 6.7 | ingest_weather | econ.weather_1d |
| 6.8 | ingest_palm_oil | mkt/econ palm tables |
| 6.9 | ingest_panama_canal | supply.panama_canal_1d |
| 6.10 | Tier B: compute_board_crush (SQL) | training.board_crush_1d |
| 6.11 | ProFarmer Playwright scraper | alt.profarmer_news |
| 6.12 | Tier B: retention + materialized views | mkt.price_1m, dashboard summary |
| 6.13 | Register all pg_cron schedules | — |

---

## Parallelism Opportunities

| Pair | Why They Can Overlap |
|------|---------------------|
| Phase 3 + Phase 2 | Landing page doesn't depend on data flow (except chart teaser) |
| Phase 6 + Phase 4-5 | Remaining ingestion is independent of chart/pipeline |
| build_matrix + specialist_features | Both read cloud, no mutual dependency |
| run_garch + train_models | GARCH reads cloud directly, not pipeline output |

---

## What Happens Next (Immediate Priority)

**Phase 2 is next.** Specifically:

1. **Fix 3 mock-data violations** (CP5) — quick cleanup before Phase 2
2. **Seed mkt.price_1d** with historical ZL data
3. **Wire /api/zl/price-1d** to query Supabase
4. **Rewrite chart component** from scratch

This is the single most important deliverable in the entire migration.

---

## Verification Checklist

| Rule | Passes? | Note |
|------|---------|------|
| Phase sequence makes sense | Yes | Dependencies are correct |
| Corrections from prior CPs applied | Yes | 5 corrections documented |
| Critical path identified | Yes | Phase 2 is the bottleneck |
| Parallelism opportunities noted | Yes | 4 pairs identified |
| All phases accounted for | Yes | 0 through 10 |
| Gate dependencies aligned | Yes | CP8 gate split reflected |

---

## Sources

- docs/plans/2026-03-17-v16-migration-plan.md — Section 11
- All prior checkpoint decisions (CP1-CP8)
- CP4: Job architecture consolidation (25 → 16 functions)
- CP5: Column mismatches and multi-table route complexity
- CP7: GARCH/MC order bug
- CP8: Gate 3 split
