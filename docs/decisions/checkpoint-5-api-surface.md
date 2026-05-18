# Checkpoint 5: API Surface — Deep Reasoning

**Date:** 2026-03-20
**Status:** Pending Approval
**Checkpoint:** Migration Plan — Section 6
**Depends on:** Checkpoint 3 (schemas), Checkpoint 4 (job architecture)

---

## Decision

**15 API routes exist mapping to Section 6. Deep data-flow tracing reveals: 3 zero-mock-data violations to fix, 2 column-name mismatches to resolve when wiring, 3 multi-table routes requiring complex queries, 1 undefined metric key set (dashboard_metrics), and 1 undefined integration path (Vegas Intel Glide). The route structure is correct but these systemic gaps must be tracked.**

---

## End-to-End Data Flow Analysis

### Flow 1: Chart Rendering (Chris's #1 need)

```
Databento API → ingest_databento_daily() → mkt.price_1d → /api/zl/price-1d → Dashboard → Chart
```

| Link | Status | Gap? |
|------|--------|------|
| Databento API | Available | — |
| ingest_databento_daily() | **NOT BUILT** | Phase 4 |
| mkt.price_1d | **EMPTY** | Need seed data (Phase 2) |
| /api/zl/price-1d | **SCAFFOLD** (returns []) | Phase 2: wire to DB |
| Dashboard page | **SHELL** | Shows "Awaiting price data" |
| Chart component | **NOT REWRITTEN** | Phase 2: rewrite from scratch |

**Column mismatch found:** Table uses `bucket_ts` (TIMESTAMPTZ). API type `ZlPriceBar` expects `tradeDate` (string). Route must alias: `SELECT bucket_ts AS "tradeDate"`.

### Flow 2: Target Zones (Chris's decision tool)

```
Python pipeline → local parquet → promote_to_cloud.py → forecasts.target_zones → /api/zl/target-zones → Dashboard → ProbabilitySurface
```

| Link | Status | Gap? |
|------|--------|------|
| Python pipeline (8 phases) | **SCAFFOLD** | Phase 5 |
| promote_to_cloud.py | **NOT CREATED** | Phase 5 |
| forecasts.target_zones | **EMPTY** | Populated after promotion |
| /api/zl/target-zones | **SCAFFOLD** | Phase 7 |
| ProbabilitySurface | **CARD-ONLY RENDERER** | Phase 7 |

**6 broken links.** Longest chain in the system. Table schema is correct: (forecast_date, horizon_days, p30, p50, p70, model_version, generated_at). Maps cleanly to API type TargetZone (horizonDays, p30, p50, p70, generatedAt).

### Flow 3: Live Price (status bar)

```
Databento → ingest_zl_intraday() → mkt.price_1h → Tier B rollup → mkt.latest_price → /api/zl/live → Dashboard status bar
```

Table `latest_price` has (symbol, price, observed_at). API type `ZlLivePrice` has (symbol, price, observedAt). Clean mapping — `observed_at` → `observedAt`.

### Flow 4: Price Drivers (what's moving ZL)

```
Python post-training → promote_to_cloud.py → analytics.driver_attribution_1d → /api/dashboard/drivers → Dashboard drivers card
```

Table has (trade_date, rank, factor, contribution, confidence). API type has (factor, contribution, confidence). Clean — route just needs `ORDER BY rank LIMIT 4` for Chris's Top 4 Drivers.

### Flow 5: Regime State

```
Python regime classification → promote_to_cloud.py → analytics.regime_state_1d → /api/dashboard/regime → Dashboard regime chip
```

Table has (trade_date, regime, confidence). API type has (regime, confidence, updatedAt). **Column mismatch:** `trade_date` → `updatedAt`. Route must alias.

### Flow 6: Strategy Posture (ACCUMULATE/WAIT/DEFER)

```
Python strategy engine → promote_to_cloud.py → analytics.market_posture → /api/strategy/posture → Strategy page
```

Table has (trade_date, posture, rationale). API type has (posture, rationale, updatedAt).

**VIOLATION:** Route currently returns hardcoded `posture: "WAIT"`. Must return `data: null` when no data.

### Flow 7: Sentiment (multi-table)

```
pg_cron: ingest_news() → alt.news_events
pg_cron: ingest_cftc_weekly() → mkt.cftc_1w
Both → /api/sentiment/overview → Sentiment page (3 rows: overview, news feed, CoT)
```

**Complex route:** Needs to aggregate from 2 different schemas:
- Headlines count + sentiment score from `alt.news_events`
- CoT bias from `mkt.cftc_1w`
- News items list from `alt.news_events` (with source, tags, sentiment label)

**VIOLATION:** Route returns hardcoded zeros. Must return `data: null`.

### Flow 8: Legislation (multi-table)

```
pg_cron: ingest_legislation() → alt.legislation_1d + alt.executive_actions + alt.congress_bills
All → /api/legislation/feed → Legislation page
```

**Complex route:** Needs UNION across 3 tables (all share same structure via LIKE). Filter by source. Return with tags. Manageable since all 3 tables have identical schemas.

### Flow 9: Vegas Intel (most complex, Kevin's tool)

```
Manual/Glide → vegas.restaurants, casinos, events, venues, fryers, customer_scores, event_impact
All 7 → /api/vegas/intel → Vegas Intel page (5 sections)
```

**Most complex route:** Must aggregate 7 tables into VegasIntelSnapshot:
- Active events count (from vegas.events WHERE event_date >= today)
- High priority accounts (from vegas.customer_scores WHERE score > threshold)
- Events list with venue names (JOIN events + venues)
- Restaurant data (JOIN restaurants + casinos)
- Fryer counts (JOIN fryers + restaurants)

**VIOLATION:** Returns hardcoded zeros. Must return `data: null`.

**UNDEFINED:** How does data get INTO vegas tables? Migration plan says "Manual / Glide sync" but no Glide integration is defined. This needs a decision:
- Option A: Manual SQL inserts
- Option B: Glide webhook → Edge Function → vegas tables
- Option C: Glide REST API → pg_cron function
- Recommendation: Defer — Vegas Intel data entry is Phase 8. Note as open question.

### Flow 10: Dashboard Metrics (stat cards)

```
pg_cron materialized view refresh → analytics.dashboard_metrics → /api/dashboard/metrics → Dashboard stat cards
```

**UNDEFINED:** What metric_keys go in this table? The migration plan says "pre-computed dashboard numbers" but doesn't enumerate them. Likely candidates:
- Current ZL price
- 24h price change %
- Active forecast count
- Model accuracy (latest MAE)
- Data freshness score

Recommendation: Define metric_keys when wiring the route (Phase 7). Table structure (trade_date, metric_key, metric_value) is flexible enough.

---

## Dropped legacy baseline Routes (10 confirmed dead)

| legacy baseline Route | Why Dropped | Functionality Absorbed By |
|-----------|-------------|--------------------------|
| /api/zl/brief | Redundant | /api/zl/forecast |
| /api/zl/context | Redundant | /api/dashboard/metrics |
| /api/zl/raw | Unnecessary | /api/zl/price-1d serves raw OHLCV |
| /api/zl/chart | Redundant | /api/zl/price-1d |
| /api/zl/price-5m | Unnecessary granularity | /api/zl/intraday (15m/1m) |
| /api/policy/section-brief | Redundant | /api/legislation/feed |
| /api/refresh-drivers | Obsolete | Drivers refresh via pg_cron/Python promotion |
| /api/epu | Redundant | /api/dashboard/metrics |
| /api/weather-risk | Redundant | /api/dashboard/metrics or specialist card |
| /api/quant/overview | Page dropped | Quant page eliminated in V16 |

---

## Systemic Gaps Summary

| # | Gap | Severity | When to Fix |
|---|-----|----------|-------------|
| 1 | 3 mock-data violations (posture, sentiment, vegas) | **High** | Fix immediately (violates hard rule) |
| 2 | Column mismatch: bucket_ts → tradeDate in price routes | Medium | Fix when wiring routes (Phase 2) |
| 3 | Column mismatch: trade_date → updatedAt in regime/posture | Medium | Fix when wiring routes (Phase 7-8) |
| 4 | Sentiment route needs multi-table aggregation | Medium | Design query when wiring (Phase 8) |
| 5 | Legislation route needs 3-table UNION | Low | Simple — same schema via LIKE (Phase 8) |
| 6 | Vegas route needs 7-table aggregation | High | Most complex route. Design carefully (Phase 8) |
| 7 | Dashboard metrics metric_keys undefined | Medium | Define when wiring (Phase 7) |
| 8 | Vegas Glide integration path undefined | Medium | Defer to Phase 8 — open question |
| 9 | **No freshness indicator on dashboard** | Medium | /api/health checks DB connectivity but not data recency. Dashboard status bar shows live-price timestamp, but if ingestion breaks overnight, Chris has no way to distinguish "no data yet" from "system is broken." Need a data-recency signal — either in health route or a dedicated freshness endpoint. Design during Phase 7. |

---

## Verification Checklist

| Rule | Passes? | Note |
|------|---------|------|
| Zero mock data | **FAILS (3 routes)** | posture, sentiment, vegas need fixing to return null |
| All routes map to real tables | Yes | 15/15 verified against migrations |
| Route-to-table column compatibility | **2 mismatches** | bucket_ts/tradeDate, trade_date/updatedAt — fixable in route |
| Dropped legacy baseline routes confirmed dead | Yes | 10 routes, functionality absorbed |
| No Vercel cron routes | Yes | app/api/cron/ does not exist |
| Data flows end-to-end | **No** | All routes except health/auth are scaffolds |
| Complex routes identified | Yes | sentiment (2 tables), legislation (3), vegas (7) |

---

## Implementation Implications

1. **Immediate:** Fix 3 mock-data violations → return null not fake data
2. **Phase 2:** Wire price routes with bucket_ts → tradeDate alias
3. **Phase 7:** Wire dashboard routes, define metric_keys, alias trade_date → updatedAt
4. **Phase 8:** Design multi-table queries for sentiment, legislation, vegas
5. **Phase 8:** Decide Vegas Glide integration path
6. **All routes:** Use Supabase admin client during dev, switch to authenticated after auth (Phase 9)

---

## Sources

- docs/plans/2026-03-17-v16-migration-plan.md — Section 6
- All 15 route files in app/api/
- lib/contracts/api.ts — TypeScript types
- Supabase migrations — table column definitions
