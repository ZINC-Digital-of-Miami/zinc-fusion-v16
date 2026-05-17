---
name: data-review
description: "Comprehensive data health audit for ZINC Fusion V16. Use when: checking for stale data in any table, auditing pg_cron ingest pipeline health, reviewing data quality (null rates, row counts, gaps), verifying each of the 11 specialists has the data it needs, assessing whether the current economic environment (tariffs, trade war, Fed policy, biofuel mandates) is captured by the current dataset, or deciding whether to add/cut data sources for model training. Runs pre-flight, staleness loop, pipeline function loop, data quality loop, specialist coverage loop, economic environment fit loop, and gap/recommendation report. Never modifies data or runs destructive SQL."
argument-hint: 'Allowed focus: staleness | pipeline-health | data-quality | specialist-coverage | economic-fit | training-gate | full-audit'
---

# Data Review

## Bundled Resources

| Resource                | Path                                                                             | When to Use                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Freshness report SQL    | [scripts/freshness_report.sql](./scripts/freshness_report.sql)                   | Run in Supabase SQL editor for Loop 1 — outputs GREEN/YELLOW/RED/EMPTY per table in one query                              |
| All loop SQL queries    | [references/sql-queries.md](./references/sql-queries.md)                         | Full per-loop SQL for Loops 1–3 and 5 — copy/paste into Supabase SQL editor                                                |
| Specialist coverage map | [references/specialist-coverage-map.md](./references/specialist-coverage-map.md) | Required data table per specialist with verdict definitions — reference during Loop 4                                      |
| Data sources & gotchas  | [references/data-sources.md](./references/data-sources.md)                       | Staleness thresholds, pg_cron function registry, known ingest gotchas, Python worker scripts, training window requirements |

---

## What This Skill Does

A full-spectrum data health audit for ZINC Fusion V16. Answers six questions in sequence:

1. **Staleness** — How fresh is each critical table? What failed or timed out recently?
2. **Pipeline health** — Which pg_cron ingest functions are wired, scheduled, and running?
3. **Data quality** — Are there null gaps, bad values, or coverage holes in key tables?
4. **Specialist coverage** — Does each of the 11 specialists have the data it needs to generate valid signals?
5. **Economic environment fit** — Does the training data reflect the current macro/trade/policy environment (2026 tariffs, Fed path, biofuel mandates)?
6. **Recommendations** — What sources to add, cut, or change priority on — with concrete justification.

Runs as loops: pre-flight → staleness → pipeline → quality → specialist coverage → economic fit → final report.

**This skill never modifies data, runs DDL, retrains models, or promotes anything to cloud.**

---

## The Forecasting Problem (Never Deviate)

**What we forecast:** ZL (soybean oil futures) PRICE LEVEL at 30d, 90d, 180d horizons.
**Who uses it:** Chris (buyer). ZL UP = bad. Strategy = ACCUMULATE vs WAIT.
**Model outputs:** `target_price_30d`, `target_price_90d`, `target_price_180d` — future price levels, not returns.
**Training gate:** NEVER start model training without explicit user approval.
**Data rule:** ZERO mock data, ZERO synthetic rows, ZERO placeholder values — ever.

---

## Loop 0 — Pre-Flight (Run Before Any Loop)

STOP if any item fails. Report reason. Do not begin audit loops.

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────────────
[ ] Confirm no local Supabase or Docker command is being used for this audit
[ ] Cloud DB read-only probe succeeds against the Supabase cloud URL (`SELECT current_database(), current_user, now()`)
[ ] Current date confirmed — needed to compute staleness deltas
[ ] Read supabase/migrations/202603210001_seed_source_registry.sql
    Canonical sources: databento, fred, usda, eia, profarmer, vegas_ops
[ ] Read python/fusion/config.py
    Confirm SPECIALISTS = 11, HORIZONS = [30, 90, 180]
[ ] Read docs/plans/2026-03-17-v16-migration-plan.md §4 (schema tables)
    Understand every table and its expected writer + cadence
[ ] Read supabase/migrations/202603180011_pg_cron.sql
    Understand which pg_cron jobs are currently wired
[ ] git status — read-only session confirmed (no edits expected from this skill)
─────────────────────────────────────────────────────────────────────
Present current date + confirm all files were read before proceeding.
Do not run `supabase status` or `supabase start`; those inspect/start a local
Supabase stack and are banned in this repo. Local PostgreSQL is allowed only as
the AG training-source staging database when that boundary is being audited.
```

---

## Loop 1 — Staleness / Freshness Audit

For each critical table, check when the last row was ingested and compare to expected cadence.

### How to Run

```sql
-- Last ingest per source (from ops log)
SELECT source_key, status, started_at, finished_at, rows_written, error_message
FROM ops.ingest_run
WHERE started_at > NOW() - INTERVAL '7 days'
ORDER BY started_at DESC;

-- Last row dates for each critical table
SELECT 'mkt.price_1d'       AS tbl, MAX(trade_date) AS last_row FROM mkt.price_1d
UNION ALL
SELECT 'mkt.price_1h',       MAX(trade_date)  FROM mkt.price_1h
UNION ALL
SELECT 'mkt.futures_1d',     MAX(trade_date)  FROM mkt.futures_1d
UNION ALL
SELECT 'mkt.fx_1d',          MAX(trade_date)  FROM mkt.fx_1d
UNION ALL
SELECT 'mkt.cftc_1w',        MAX(trade_date)  FROM mkt.cftc_1w
UNION ALL
SELECT 'econ.rates_1d',      MAX(obs_date)    FROM econ.rates_1d
UNION ALL
SELECT 'econ.inflation_1d',  MAX(obs_date)    FROM econ.inflation_1d
UNION ALL
SELECT 'econ.commodities_1d',MAX(obs_date)    FROM econ.commodities_1d
UNION ALL
SELECT 'econ.vol_indices_1d',MAX(obs_date)    FROM econ.vol_indices_1d
UNION ALL
SELECT 'econ.weather_1d',    MAX(obs_date)    FROM econ.weather_1d
UNION ALL
SELECT 'supply.usda_exports_1w', MAX(report_date) FROM supply.usda_exports_1w
UNION ALL
SELECT 'supply.usda_wasde_1m',   MAX(report_date) FROM supply.usda_wasde_1m
UNION ALL
SELECT 'supply.eia_biodiesel_1m',MAX(report_date) FROM supply.eia_biodiesel_1m
UNION ALL
SELECT 'supply.epa_rin_1d',      MAX(trade_date)  FROM supply.epa_rin_1d
UNION ALL
SELECT 'supply.conab_production_1m', MAX(report_date) FROM supply.conab_production_1m
UNION ALL
SELECT 'supply.china_imports_1m',MAX(report_date) FROM supply.china_imports_1m
UNION ALL
SELECT 'supply.mpob_palm_1m',    MAX(report_date) FROM supply.mpob_palm_1m
UNION ALL
SELECT 'alt.profarmer_news',     MAX(published_at) FROM alt.profarmer_news
UNION ALL
SELECT 'alt.news_events',        MAX(event_date)   FROM alt.news_events
UNION ALL
SELECT 'alt.legislation_1d',     MAX(published_at) FROM alt.legislation_1d
UNION ALL
SELECT 'alt.executive_actions',  MAX(signed_date)  FROM alt.executive_actions
UNION ALL
SELECT 'training.board_crush_1d',MAX(trade_date)   FROM training.board_crush_1d
ORDER BY last_row NULLS FIRST;
```

### Staleness Thresholds

| Cadence      | Table Type                                        | STALE if last row older than                |
| ------------ | ------------------------------------------------- | ------------------------------------------- |
| Real-time    | `mkt.latest_price`                                | 30 minutes during session hours             |
| Daily        | `price_1d`, `futures_1d`, `fx_1d`, `rates_1d`     | 2 calendar days                             |
| Hourly       | `price_1h`                                        | 4 hours during session                      |
| Weekly       | `cftc_1w`, `usda_exports_1w`                      | 10 calendar days                            |
| Monthly      | `wasde_1m`, `biodiesel_1m`, `conab_1m`, `mpob_1m` | 35 calendar days                            |
| Event-driven | `executive_actions`, `tariff_deadlines`           | Cross-reference known events — manual check |
| Per run      | `profarmer_news`                                  | 2 calendar days (5 pulls/week expected)     |

### Classifying Results

For each table, record one of:

- **GREEN** — Fresh, within threshold, ingest_run shows SUCCESS
- **YELLOW** — Within threshold but ingest_run shows TIMEOUT or missing entry — investigate
- **RED** — Beyond threshold, or last known ingest FAILED — immediate action needed
- **EMPTY** — Zero rows — table was defined but ingest function not yet wired or first run pending

### Section Output

After running queries, produce a table of all checked tables with status. Example:

```
TABLE                     | STATUS | LAST ROW   | EXPECTED CADENCE | NOTES
mkt.price_1d              | GREEN  | 2026-03-24 | daily            | —
mkt.cftc_1w               | YELLOW | 2026-03-13 | weekly           | ingest_run missing
supply.mpob_palm_1m       | EMPTY  | NULL       | monthly          | function not wired
alt.executive_actions     | RED    | 2026-02-15 | event-driven     | 38 days since last row
```

---

## Loop 2 — Pipeline Function Audit

Verify which pg_cron ingest functions have been created and scheduled. The migration plan defines ~25 canonical functions.

### How to Check

```sql
-- All scheduled pg_cron jobs
SELECT jobname, schedule, command, active, jobid
FROM cron.job
ORDER BY jobname;

-- Wired plpgsql functions in ops schema (ingest functions live here)
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'ops'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;
```

### Canonical Function Checklist

For each entry, flag: WIRED (function exists + cron job exists) / FUNCTION-ONLY (function exists but not scheduled) / MISSING (neither exists yet).

```
INGEST FUNCTION               | STATUS        | SCHEDULE           | TARGET SCHEMA
─────────────────────────────────────────────────────────────────────────────────
ingest_zl_daily()             | ?             | Daily 6:05 CT      | mkt
ingest_zl_intraday()          | ?             | Every 15m session  | mkt
ingest_databento_futures()    | ?             | Daily 2 AM CT      | mkt
ingest_databento_options()    | ?             | Daily              | mkt
ingest_fx_daily()             | ?             | Daily              | mkt
ingest_etf_daily()            | ?             | Daily 8 PM ET      | mkt
ingest_fred()                 | ?             | Every 8h           | econ
ingest_cftc_weekly()          | ?             | Friday 4 PM ET     | mkt
ingest_usda_exports()         | ?             | Thursday           | supply
ingest_usda_wasde()           | ?             | Monthly            | supply
ingest_eia_biodiesel()        | ?             | Monthly            | supply
ingest_supply_monthly()       | ?             | Monthly (staggered)| supply
ingest_weather()              | ?             | Daily              | econ
ingest_legislation()          | ?             | Daily              | alt
ingest_news()                 | ?             | Daily              | alt
ingest_trade_policy()         | ?             | Daily              | alt
ingest_biofuel_policy()       | ?             | Daily/Weekly       | supply, alt
ingest_board_crush()          | ?             | Daily              | training
ingest_palm_oil()             | ?             | Daily              | mkt, econ
ingest_market_drivers()       | ?             | Daily              | analytics
check_freshness()             | ?             | Daily              | ops
```

### Known Gotchas From Prior Experience

- **EIA API** has been intermittently down since Mar 2026. Flag if `ingest_eia_biodiesel` shows consistent FAILED runs.
- **FRED daily** fetches only `limit=5` (latest obs). Full history needs `refresh_fred_api.py` run manually.
- **MPOB palm** requires a valid FAS OpenData API key (not FoodData Central). Verify key is in Vault.
- **Yahoo Finance v8** downsamples to monthly for large date ranges. Window must be ≤1 year.
- **FAS site** (fas.usda.gov) returns HTTP/2 stream errors — needs retry logic in function.
- **UCO/Tallow prices**: No free direct API. Must use FRED PPI proxies `WPU06410132` + `PCU3116133116132`.

---

## Loop 3 — Data Quality Audit

For tables that are GREEN/YELLOW in Loop 1, check for internal quality issues.

### Row Count Assessment

```sql
-- Count rows per table for all data tables
SELECT schemaname, tablename,
       n_live_tup AS approx_row_count
FROM pg_stat_user_tables
WHERE schemaname IN ('mkt','econ','alt','supply','training','forecasts','analytics')
ORDER BY schemaname, tablename;
```

**Flag tables with:**

- Zero rows (EMPTY) — not yet ingesting
- Fewer rows than expected (e.g., `mkt.price_1d` should have 1000+ rows of ZL history)
- Suspicious low counts relative to expected history depth

### Null Rate Check (Critical Columns)

Run for any table with RED/YELLOW freshness, or where a specialist depends on it:

```sql
-- Example: mkt.price_1d null rate on required columns
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN open IS NULL THEN 1 ELSE 0 END) AS null_open,
  SUM(CASE WHEN high IS NULL THEN 1 ELSE 0 END) AS null_high,
  SUM(CASE WHEN low IS NULL THEN 1 ELSE 0 END) AS null_low,
  SUM(CASE WHEN close IS NULL THEN 1 ELSE 0 END) AS null_close,
  SUM(CASE WHEN volume IS NULL THEN 1 ELSE 0 END) AS null_volume
FROM mkt.price_1d;
```

Flag any column with null rate > 2% on mandatory price data.

### Continuity Gap Check

```sql
-- Find trading day gaps in mkt.price_1d (should have no gaps > 3 days excluding weekends)
SELECT a.trade_date AS gap_start, b.trade_date AS gap_end,
       b.trade_date - a.trade_date AS gap_days
FROM mkt.price_1d a
JOIN mkt.price_1d b ON b.trade_date = (
  SELECT MIN(trade_date) FROM mkt.price_1d WHERE trade_date > a.trade_date
)
WHERE b.trade_date - a.trade_date > 3
ORDER BY a.trade_date DESC
LIMIT 20;
```

### Check `ops.data_quality_log`

```sql
SELECT source_table, issue_type, issue_detail, detected_at, resolved
FROM ops.data_quality_log
WHERE detected_at > NOW() - INTERVAL '30 days'
ORDER BY detected_at DESC;
```

---

## Loop 4 — Specialist Coverage Map

For each of the 11 specialists, verify that every required data source is:

- Present in the database (table exists)
- Fresh enough (within staleness threshold from Loop 1)
- Has adequate row depth for the training window

**Training window assumption:** Model requires at least 3 years of daily history (≥756 trading days) for reliable training at 180d horizon. Check `mkt.price_1d` first.

---

### specialist: `crush`

| Required Data       | Table                       | Status | Notes                              |
| ------------------- | --------------------------- | ------ | ---------------------------------- |
| Board crush margins | `training.board_crush_1d`   | ?      | Derived daily from futures spreads |
| WASDE soy oil share | `supply.usda_wasde_1m`      | ?      | Monthly — check NOPA release cycle |
| Argentina crush     | `supply.argentina_crush_1m` | ?      | Monthly INDEC data                 |
| Soy complex futures | `mkt.futures_1d`            | ?      | ZS, ZL, ZM spreads                 |

Verdict: READY / PARTIAL (what's missing) / BLOCKED (critical gap)

---

### specialist: `china`

| Required Data        | Table                        | Status | Notes                                |
| -------------------- | ---------------------------- | ------ | ------------------------------------ |
| Chinese soy imports  | `supply.china_imports_1m`    | ?      | GACC monthly — often delayed 6 weeks |
| USDA export sales    | `supply.usda_exports_1w`     | ?      | Weekly USDA FAS data                 |
| Brazil production    | `supply.conab_production_1m` | ?      | CONAB monthly                        |
| FAS GATS trade flows | `supply.fas_gats_1m`         | ?      | Global trade context                 |

---

### specialist: `fx`

| Required Data  | Table           | Status | Notes                             |
| -------------- | --------------- | ------ | --------------------------------- |
| FX spot rates  | `mkt.fx_1d`     | ?      | BRL, CNY, MYR, EUR vs USD minimum |
| FRED FX series | `econ.rates_1d` | ?      | DXY, DTWEXBGS                     |

---

### specialist: `fed`

| Required Data | Table                 | Status | Notes                          |
| ------------- | --------------------- | ------ | ------------------------------ |
| Policy rates  | `econ.rates_1d`       | ?      | Fed Funds, SOFR, 2Y/10Y yield  |
| Inflation     | `econ.inflation_1d`   | ?      | CPI/PPI/PCE — monthly releases |
| Money supply  | `econ.money_1d`       | ?      | M2, bank reserves              |
| Fed speeches  | `alt.fed_speeches`    | ?      | FOMC minutes + speeches        |
| Vol indices   | `econ.vol_indices_1d` | ?      | VIX, MOVE — rate vol context   |

---

### specialist: `tariff`

| Required Data    | Table                   | Status | Notes                                      |
| ---------------- | ----------------------- | ------ | ------------------------------------------ |
| Tariff deadlines | `alt.tariff_deadlines`  | ?      | Event-driven — critical for 2026 trade war |
| Executive orders | `alt.executive_actions` | ?      | White House Federal Register               |
| ICE enforcement  | `alt.ice_enforcement`   | ?      | Trade enforcement actions                  |
| Trade news       | `alt.news_events`       | ?      | Filter: specialist_tags @> '{tariff}'      |

**Note for 2026 context:** This specialist carries high weight given active US trade war. Gaps here directly degrade strategy signal quality.

---

### specialist: `energy`

| Required Data   | Table                     | Status | Notes                               |
| --------------- | ------------------------- | ------ | ----------------------------------- |
| Crude oil price | `econ.commodities_1d`     | ?      | FRED: DCOILWTICO                    |
| Natural gas     | `econ.commodities_1d`     | ?      | FRED: DHHNGSP                       |
| EIA biodiesel   | `supply.eia_biodiesel_1m` | ?      | EIA API intermittently down — check |
| Energy ETFs     | `mkt.etf_1d`              | ?      | USO, XLE                            |

---

### specialist: `biofuel`

| Required Data      | Table                     | Status | Notes                                  |
| ------------------ | ------------------------- | ------ | -------------------------------------- |
| EPA RIN prices     | `supply.epa_rin_1d`       | ?      | D4, D6 credits — daily                 |
| LCFS credits       | `supply.lcfs_credits_1w`  | ?      | California LCFS — weekly               |
| EIA biodiesel prod | `supply.eia_biodiesel_1m` | ?      | Monthly                                |
| Biofuel policy     | `alt.news_events`         | ?      | Filter: specialist_tags @> '{biofuel}' |

---

### specialist: `palm`

| Required Data        | Table                 | Status | Notes                               |
| -------------------- | --------------------- | ------ | ----------------------------------- |
| MPOB palm production | `supply.mpob_palm_1m` | ?      | **Requires valid FAS OpenData key** |
| CPO price            | `econ.commodities_1d` | ?      | Malaysia CPO palm price             |
| Palm ETF proxy       | `mkt.etf_1d`          | ?      | PALM or equivalent                  |

---

### specialist: `volatility`

| Required Data       | Table                       | Status | Notes                                    |
| ------------------- | --------------------------- | ------ | ---------------------------------------- |
| ZL options chain    | `mkt.options_1d`            | ?      | Implied vol surface input                |
| Implied vol surface | `mkt.vol_surface`           | ?      | Derived from options_1d                  |
| VIX / OVX           | `econ.vol_indices_1d`       | ?      | Market fear context                      |
| GARCH outputs       | `forecasts.garch_forecasts` | ?      | Conditional vol from Python run_garch.py |

---

### specialist: `substitutes`

| Required Data       | Table                 | Status | Notes                      |
| ------------------- | --------------------- | ------ | -------------------------- |
| Tallow PPI proxy    | `econ.commodities_1d` | ?      | FRED: WPU06410132          |
| Rendering PPI proxy | `econ.commodities_1d` | ?      | FRED: PCU3116133116132     |
| Canola ETF          | `mkt.etf_1d`          | ?      | Canola/vegetable oil proxy |
| Palm bridge         | `econ.commodities_1d` | ?      | CPO vs ZL spread           |

---

### specialist: `trump_effect`

| Required Data    | Table                    | Status | Notes                                       |
| ---------------- | ------------------------ | ------ | ------------------------------------------- |
| Executive orders | `alt.executive_actions`  | ?      | **Highest-priority gap in 2026**            |
| Tariff deadlines | `alt.tariff_deadlines`   | ?      | Trade war timeline                          |
| Policy news      | `alt.news_events`        | ?      | Filter: specialist_tags @> '{trump_effect}' |
| Trade metrics    | `supply.usda_exports_1w` | ?      | Export cancellations/resumptions            |

**Critical note:** The `trump_effect` specialist exists precisely for the current US trade war environment. Any staleness here has outsized impact on model signal quality. This specialist should be treated as HIGH PRIORITY during triage.

---

### Coverage Matrix Summary

After completing all 11 specialist checks, produce a summary:

```
SPECIALIST       | DATA READY | CRITICAL GAPS                  | VERDICT
crush            | ?          | —                              | ?
china            | ?          | china_imports_1m stale?        | ?
fx               | ?          | —                              | ?
fed              | ?          | fed_speeches empty?            | ?
tariff           | ?          | executive_actions stale?       | ?
energy           | ?          | EIA API down?                  | ?
biofuel          | ?          | epa_rin_1d empty?              | ?
palm             | ?          | mpob empty (Vault key)?        | ?
volatility       | ?          | vol_surface empty?             | ?
substitutes      | ?          | —                              | ?
trump_effect     | ?          | executive_actions stale?       | ?
```

---

## Loop 5 — Economic Environment Fit

This loop answers: _Does the training data adequately represent the current macro and policy environment so that the model can generate meaningful ZL forecasts for Chris?_

Current date context: **March 2026**.

### Section 5A — Trade War / Tariff Regime

Active US trade war context relevant to ZL:

- Section 232 / Section 301 tariff escalations (US-China)
- Retaliatory tariffs on US soy exports to China
- Ag exemptions / exclusions and their durations
- Biofuel trade policy (SAF mandates, blending obligations)

**Questions to answer:**

- [ ] Does `alt.executive_actions` cover major trade executive orders from 2025–2026?
- [ ] Does `alt.tariff_deadlines` have upcoming tariff dates populated?
- [ ] Does `alt.news_events` have recent trade war signals tagged with `{tariff}` or `{trump_effect}`?
- [ ] Are export cancellations from China visible in `supply.usda_exports_1w` recent rows?

If the training data does not capture active tariff escalations since Jan 2025, the model's tariff and trump_effect specialists will operate on stale regime assumptions. **Flag as HIGH RISK.**

### Section 5B — Federal Reserve / Interest Rate Regime

Fed policy path: post-hiking cycle, uncertain rate-cut trajectory.

**Questions to answer:**

- [ ] Does `econ.rates_1d` have Fed Funds rate through current date?
- [ ] Does `econ.inflation_1d` have 2025–2026 monthly CPI/PCE releases?
- [ ] Does `alt.fed_speeches` have FOMC minutes from the last 6 months?

A model trained without current rate regime data will underweight the carry cost of commodity long positions.

### Section 5C — Biofuel Policy Regime

2026 biofuel context:

- EPA RVO (Renewable Volume Obligation) annual rulemaking
- SAF (Sustainable Aviation Fuel) mandate pressures
- LCFS program updates in California
- Soy oil demand uplift/downlift from biofuel policy shifts

**Questions to answer:**

- [ ] Does `supply.epa_rin_1d` show recent D4 biodiesel RIN prices?
- [ ] Does `supply.lcfs_credits_1w` have 2025–2026 credit prices?
- [ ] Is biofuel policy news tagged in `alt.news_events`?

### Section 5D — Physical Supply Chain Conditions

2026 crop/supply context:

- South American crop size (Brazil/Argentina) for 2025/26 marketing year
- US crop progress and early 2026 planting intentions
- China demand vs strategic reserve restocking

**Questions to answer:**

- [ ] Does `supply.conab_production_1m` have the 2025/26 marketing year forecasts?
- [ ] Does `supply.usda_wasde_1m` have the most recent WASDE release?
- [ ] Does `econ.weather_1d` have current drought/La Nina conditions?

### Section 5E — History Depth for Model Training

AutoGluon at 180d horizon needs sufficient training observations. ZL history check:

```sql
SELECT
  MIN(trade_date) AS earliest_row,
  MAX(trade_date) AS latest_row,
  COUNT(*) AS total_trading_days,
  MAX(trade_date) - MIN(trade_date) AS calendar_span_days
FROM mkt.price_1d;
```

**Minimum thresholds:**

- Warn if < 756 trading days (< 3 years) — marginal for 180d horizon
- Flag if < 504 trading days (< 2 years) — BLOCKED for reliable 180d training

### Section 5F — Regime Diversity in Training Data

The model should have seen multiple market regimes:

- Low volatility trending up (2020–2021 soy oil bull)
- High volatility shock (Feb 2022 Ukraine impact on fats/oils)
- GARCH regime shifts (vol clustering)
- Policy shock regimes (tariff announcements, biofuel mandate changes)

Look at the date range of `mkt.price_1d`. If training data only covers 2024–2026, it is missing prior regimes and the model will underfit on shock events.

---

## Loop 6 — Gap Analysis & Recommendations

After completing all five audit loops, synthesize findings into a structured report.

### Output Format

```
DATA REVIEW SUMMARY — ZINC FUSION V16
Audit Date: [DATE]
Auditor: GitHub Copilot (data-review skill)
─────────────────────────────────────────────────────────────────────────

CRITICAL (action required before next training run):
  1. [table/source] — [issue] — [recommended action]
  2. ...

HIGH PRIORITY (action required within this sprint):
  1. [table/source] — [issue] — [recommended action]

MEDIUM PRIORITY (address before Phase 7):
  1. ...

INFORMATIONAL (no action required, noting for awareness):
  1. ...

─────────────────────────────────────────────────────────────────────────

PIPELINE FUNCTIONS NOT YET WIRED:
  - [function] → [target table] → [recommended wire-up sprint]

─────────────────────────────────────────────────────────────────────────

SOURCES TO ADD (justified by specialist coverage gap or economic fit):
  [Source name]
  Justification: [why this helps ZL forecasting]
  Specialist(s) benefited: [which of the 11]
  Integration path: [pg_cron function name + target table]
  Cost/complexity: [free/paid, effort level]

SOURCES TO CUT OR DEPRIORITIZE:
  [Source name]
  Justification: [why it's redundant or low signal for ZL forecasting]
  Action: [disable ingest function / drop table / keep but deprioritize]

─────────────────────────────────────────────────────────────────────────

TRAINING GATE ASSESSMENT:
  [ ] mkt.price_1d has sufficient history (≥756 trading days)?
  [ ] All 11 specialists have at least PARTIAL data coverage?
  [ ] No CRITICAL gaps in any specialist's required data?
  [ ] Economic environment (2025-2026 trade war + Fed path) is represented?
  [ ] User has explicitly approved training run?

  VERDICT: READY TO TRAIN / NOT READY — [reason]
  (Note: Even if READY, user must explicitly approve before train_models.py runs)
```

---

## Hard Rules for This Skill

1. **No training without explicit user approval.** Even if all data checks pass, the training gate requires explicit human go-ahead.
2. **No destructive SQL.** Observation and reads only — no UPDATE, DELETE, DROP, or TRUNCATE.
3. **No promoting data.** Do not run `promote_to_cloud.py` or push local parquet files.
4. **No schema changes.** All DDL goes through Supabase CLI migrations via the supabase-schema-audit skill.
5. **No guessing on freshness.** If a table is empty or the dates are ambiguous, report EMPTY/UNKNOWN — do not assume it is fresh.
6. **Report don't fix.** This skill identifies issues and produces a prioritized report. Fixing is a separate approved action.
7. **Specialist count is 11.** crush, china, fx, fed, tariff, energy, biofuel, palm, volatility, substitutes, trump_effect. Never 10.
8. **Banned words in recommendations:** cones, bands, funnels, confidence intervals. Targets are horizontal lines at price levels.

---

## Reference: The 11 Specialists and Their Primary Data Sources

| Specialist   | Primary Tables                                                                                   | Cadence        |
| ------------ | ------------------------------------------------------------------------------------------------ | -------------- |
| crush        | `training.board_crush_1d`, `supply.usda_wasde_1m`, `supply.argentina_crush_1m`, `mkt.futures_1d` | Daily/Monthly  |
| china        | `supply.china_imports_1m`, `supply.usda_exports_1w`, `supply.conab_production_1m`                | Weekly/Monthly |
| fx           | `mkt.fx_1d`, `econ.rates_1d`                                                                     | Daily          |
| fed          | `econ.rates_1d`, `econ.inflation_1d`, `econ.money_1d`, `alt.fed_speeches`, `econ.vol_indices_1d` | Daily/Monthly  |
| tariff       | `alt.tariff_deadlines`, `alt.executive_actions`, `alt.ice_enforcement`, `alt.news_events`        | Event/Daily    |
| energy       | `econ.commodities_1d`, `supply.eia_biodiesel_1m`, `mkt.etf_1d`                                   | Daily/Monthly  |
| biofuel      | `supply.epa_rin_1d`, `supply.lcfs_credits_1w`, `supply.eia_biodiesel_1m`, `alt.news_events`      | Daily/Weekly   |
| palm         | `supply.mpob_palm_1m`, `econ.commodities_1d`, `mkt.etf_1d`                                       | Daily/Monthly  |
| volatility   | `mkt.options_1d`, `mkt.vol_surface`, `econ.vol_indices_1d`, `forecasts.garch_forecasts`          | Daily          |
| substitutes  | `econ.commodities_1d` (FRED PPI proxies), `mkt.etf_1d`                                           | Daily          |
| trump_effect | `alt.executive_actions`, `alt.tariff_deadlines`, `alt.news_events`, `supply.usda_exports_1w`     | Event/Daily    |

---

## Quick Invocation Examples

```
/data-review                         → full audit (all 6 loops)
/data-review stale data              → Loop 0 + Loop 1 only
/data-review pipeline health         → Loop 0 + Loop 2 only
/data-review specialist coverage     → Loop 0 + Loop 4 only
/data-review economic fit            → Loop 0 + Loop 5 only
/data-review trump_effect specialist → Loop 0 + Loop 4 (trump_effect only) + Loop 5A
/data-review training gate           → Loop 0 + all loops + training gate verdict
```
