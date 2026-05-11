# ZINC-FUSION-V16 Migration Plan

## Clean-Room Rebuild on Supabase

**Date:** 2026-03-17
**Status:** Approved design — ready for execution
**Approach:** Audit-first blueprint — product requirements drive architecture, not legacy baseline code

---

## Table of Contents

1. [Principles](#1-principles)
2. [Product Surface — What V16 Must Deliver](#2-product-surface--what-v16-must-deliver)
3. [Target Architecture](#3-target-architecture)
4. [Schema Design (9 Schemas)](#4-schema-design-9-schemas)
5. [Job Architecture — Replacing Inngest](#5-job-architecture--replacing-inngest)
6. [API Surface](#6-api-surface)
7. [Auth & Security Model](#7-auth--security-model)
8. [Python Pipeline Rebuild](#8-python-pipeline-rebuild)
9. [Frontend Wireframe](#9-frontend-wireframe)
10. [Evaluation Gates & Quality Checks](#10-evaluation-gates--quality-checks)
11. [Phased Execution Sequence](#11-phased-execution-sequence)
12. [Risk Matrix](#12-risk-matrix)
13. [Highest-Value Validation Steps](#13-highest-value-validation-steps)
14. [Dependency-Aware Remediation Sequence](#14-dependency-aware-remediation-sequence)

---

## 1. Principles

### What V16 Is

- A from-scratch rebuild — **no code transferred from legacy baseline**
- legacy baseline stays live as reference and rollback during the entire build
- legacy baseline is a reference for _what the product does_, not a source of code to port
- Purpose: eliminate all drift, errors, mismatches, legacy baggage, Inngest complexity

### What V16 Is Not

- Not a migration-in-place
- Not a refactor of legacy baseline
- Not a copy-paste with cleanup
- Not allowed to inherit: the old Prisma migration chain, copied `.vercel/` state, hand-copied `.env.local` habits, the Inngest estate, dead pages, dead jobs, or unclear contracts

### Non-Negotiable Rules

1. No old migration history crosses the boundary
2. Every table must have a reader AND a writer
3. Every page must justify its data dependencies
4. Every job must justify its existence
5. Start from the screen, not the schema
6. Rewrite the chart from scratch using legacy baseline as visual reference — settings were hard-won, preserve behavior exactly
7. Rewrite the landing page from scratch using legacy baseline as visual reference — specific and intentional design to preserve
8. ProFarmer is mandatory ($500/month)
9. 11 specialists — never 10. `trump_effect` is the 11th.
10. Target = future price level. Target Zones = horizontal lines. Never cones, bands, or funnels.

---

## 2. Product Surface — What V16 Must Deliver

### Primary Users & Their Needs

| User                                                                        | Need                                                 | V16 Surface                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| **Chris** (owner, US Oil Solutions — BUYS raw soybean oil by the trainload) | Know where ZL price is heading to time purchases     | Dashboard chart + Target Zones + Strategy posture |
| **Chris**                                                                   | Understand what's driving price                      | Top 4 Drivers, Regime state, Specialist signals   |
| **Kevin** (sales director)                                                  | Pitch restaurants, time service visits around events | Vegas Intel page                                  |
| **Both**                                                                    | Policy/legislation impact on soy oil                 | Legislation page                                  |
| **Both**                                                                    | Market sentiment read                                | Sentiment page                                    |

### V16 Page Surface (6 pages — Quant dropped)

1. **`/`** — Landing page (rewrite from scratch using legacy baseline as visual reference — ZERO code copied, ZERO mock data)
2. **`/dashboard`** — ZL candlestick chart (rewrite from scratch using legacy baseline as visual reference) + Target Zones + live price + regime + drivers + cards
3. **`/strategy`** — Posture recommendation, contract impact calculator, factor waterfall (keep content, redesign layout)
4. **`/legislation`** — Federal Register / policy tracking (clean rebuild)
5. **`/sentiment`** — News sentiment, CoT positioning, narrative (keep first 3-4 rows)
6. **`/vegas-intel`** — Restaurant/casino event intelligence (keep ALL content, better layout — events = everything)

### Critical Data Contracts

| Contract                  | Powers                                | Freshness             |
| ------------------------- | ------------------------------------- | --------------------- |
| ZL OHLCV daily            | Chart rendering                       | Daily by market close |
| ZL OHLCV 1h               | Intraday chart                        | Hourly during session |
| ZL live/latest price      | Live ticker, status bar               | Real-time or near-RT  |
| Forecast Target Zones     | P30/P50/P70 horizontal zones on chart | After each model run  |
| Specialist signals        | Driver attribution, regime            | Daily after pipeline  |
| Monte Carlo / probability | Probability statements                | After each MC run     |
| Regime state              | Dashboard regime chip                 | Daily                 |
| Legislation events        | Legislation page                      | Daily                 |
| News/sentiment            | Sentiment page                        | Daily                 |
| Vegas operations          | Vegas Intel page                      | Event-driven          |

### What Dies (legacy baseline baggage that does NOT cross)

- 34 Prisma migrations
- 104 Inngest functions (replaced by pg_cron + http extension + Python workers)
- Docker Inngest local dev container and healing scripts
- Duplicate/overlapping data ingestion jobs
- Dead tables (`eia_biodiesel_1w` with 0 rows, `uco_prices_1w` with 0 rows)
- Tables with no reader (orphaned)
- `inngest_receipts` table
- Quant page (dropped)
- The entire `.vercel/` state
- Manual `.env.local` habits
- Over-normalized Vegas tables (17 → 7)
- ProFarmer Docker complexity (rebuilt as Python Playwright)

---

## 3. Target Architecture

### Stack

| Layer                  | legacy baseline (current)       | V16 (target)                                                       |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------ |
| **Database**           | Prisma Postgres (cloud)         | Supabase Postgres                                                  |
| **Schema mgmt**        | Prisma + 34 migrations          | Supabase migrations (SQL-first)                                    |
| **Frontend**           | Next.js on Vercel               | Next.js on Vercel (new project) + shadcn/ui + Radix + Tailwind CSS |
| **Scheduling**         | Inngest (104 functions, Docker) | pg_cron + http extension (all ingestion inside Postgres)           |
| **DB client (TS)**     | pg.Pool + Prisma for validation | Supabase JS client + pg.Pool for bulk                              |
| **DB client (Python)** | psycopg2 direct                 | psycopg2 direct to Supabase Postgres                               |
| **ML**                 | AutoGluon (local, CPU)          | AutoGluon (local, CPU) — rebuilt clean                             |
| **Specialists**        | 11 Python signal generators     | 11 Python signal generators — rebuilt clean                        |
| **Auth**               | Custom cookie-based             | Supabase Auth                                                      |
| **Env mgmt**           | Manual .env.local               | Vercel <> Supabase integration, `vercel env pull`                  |
| **API secrets**        | Manual env vars                 | Supabase Vault (`current_setting()`)                               |
| **UI system**          | Mixed CSS + shadcn/ui           | shadcn/ui + Radix + Tailwind CSS + ZINC Fusion brand tokens        |

### Cloud Supabase ONLY — No Local Supabase, No Docker

| Scenario                      | Approach                                                                                                                                                  | Why                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend dev**              | Reads from cloud Supabase                                                                                                                                 | Single source of truth. No local/cloud drift. `vercel env pull` provides connection.                                                                  |
| **Python training/inference** | Reads canonical raw data from cloud Supabase, can materialize the bounded AG training source into local PostgreSQL for training, and writes intermediates to **local parquet files** during compute. Promotes validated outputs back to cloud. | Cloud is canonical. Local PostgreSQL is a training-source staging database only, not Supabase and not serving truth. Intermediates stay local during iteration. Only validated artifacts are promoted back to cloud DB. |
| **Data ingestion**            | Runs **INSIDE Postgres** via pg_cron + http extension                                                                                                     | No Vercel cron routes. No external orchestrator. Ingestion is a database-native operation.                                                            |
| **Supabase CLI**              | Used for migrations ONLY (`supabase db push`, `supabase db diff --linked`)                                                                                | No `supabase status`. No `supabase start`. No local Supabase or Docker containers. Local PostgreSQL, when used, is a separate AG training-source database. |

**Guard rail:** Create a `training` Postgres role that can only write to `training.*` and `forecasts.*` schemas. The Python pipeline uses this role. Frontend service role is read-only on those schemas.

### Architecture Diagram

```
+-----------------------------------------------------------+
|                      BROWSER                               |
|  Next.js App (Vercel) -- 6 pages                          |
|  Supabase JS client for auth + reads                      |
+---------------------------+-------------------------------+
                            |
+---------------------------v-------------------------------+
|                       VERCEL                               |
|  Frontend hosting ONLY + read-only API routes              |
|  No cron routes. No data ingestion.                        |
|  Env: auto-injected via Supabase integration               |
+---------------------------+-------------------------------+
                            |
+---------------------------v-------------------------------+
|                      SUPABASE                              |
|  Single cloud DB (9 schemas: mkt, econ, alt, supply,      |
|    training, forecasts, analytics, ops, vegas)              |
|  pg_cron + http extension (ALL data ingestion ~22 jobs)    |
|  Vault (API keys via current_setting())                    |
|  Auth (user authentication)                                |
|  RLS policies per schema                                   |
+-----------------------------------------------------------+

+-----------------------------------------------------------+
|              LOCAL MACHINE (compute workspace)              |
|  Python ML Pipeline (rebuilt from scratch)                  |
|  - Reads raw data from cloud Supabase via psycopg2         |
|    (cloud is canonical; local PostgreSQL is AG staging only) |
|  - Writes intermediates to local parquet files              |
|  - promote_to_cloud.py pushes validated outputs to cloud   |
|                                                            |
|  ProFarmer Scraper (Python Playwright, system cron)        |
|  - Writes directly to cloud Supabase                       |
+-----------------------------------------------------------+
```

### Cloud-Canonical Data Contract

| Layer                                                             | Canonical Location          | Notes                                                        |
| ----------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| Raw ingest tables (mkt, econ, alt, supply)                        | **Cloud Supabase**          | pg_cron + http writes directly to cloud                      |
| Serving tables (analytics, forecasts.target_zones)                | **Cloud Supabase**          | Dashboard reads from cloud                                   |
| Published forecasts / Target Zones                                | **Cloud Supabase**          | Pre-computed, served to chart                                |
| Training metadata (model_registry, training_runs)                 | **Cloud Supabase**          | Registry of what was trained and when                        |
| Ops observability (ingest_run, pipeline_alerts)                   | **Cloud Supabase**          | All logging in cloud                                         |
| Wide intermediate artifacts (feature matrix, specialist parquets) | **Local compute workspace** | Parquet files during processing only — not canonical storage |
| Model artifacts (AutoGluon model files)                           | **Local compute workspace** | Large binary artifacts, not in any database                  |

**Training data storage architecture** (whether wide training artifacts should be retained locally vs promoted to cloud `training.*` tables) is a separate checkpoint decision, still gated. Current posture: cloud Supabase `training.*` tables exist and are the intended destination for `promote_to_cloud.py`. Local parquet files are ephemeral compute intermediates. As of the 2026-05-09 training-prep remediation, local prep artifacts live under `data/fusion/`, model artifacts live under `models/fusion/`, and cloud promotion is isolated behind the explicit `promote_to_cloud.py` approval gate. Promotion strips `target_price_{h}d` labels out of cloud `training.matrix_1d.feature_snapshot`; labels remain local-only training columns.

### Cron-First Ingestion Contract

All data ingestion runs inside Supabase Postgres via pg_cron + http extension. No ingestion readiness can be claimed until:

1. **Functions exist** — plpgsql ingestion functions are deployed via migration
2. **Cron jobs are registered** — `SELECT count(*) FROM cron.job` returns expected schedule count
3. **First successful run** — each function has at least one `status = 'ok'` row in `ops.ingest_run`
4. **Vault keys are stored** — `current_setting('app.<key>')` returns non-null for all configured sources

**Current state (as of planning):** `cron.job` has 0 entries. Extensions pg_cron, http, pg_net are enabled. No ingestion functions exist. This is an explicit blocker for Gate 4.

---

## 4. Schema Design (9 Schemas)

### Schema Consolidation (12 -> 9)

| Dropped    | Reason                                     | Absorbed Into |
| ---------- | ------------------------------------------ | ------------- |
| `features` | 3 intermediate tables — training artifacts | `training`    |
| `model`    | 3 tables — part of training lifecycle      | `training`    |
| `pos`      | 1 table (`cftc_1w`) — it's market data     | `mkt`         |

### Schema: `mkt` (Market Data + Positioning)

| Table          | Purpose                                | Writer                               | Reader                           | Granularity |
| -------------- | -------------------------------------- | ------------------------------------ | -------------------------------- | ----------- |
| `price_1d`     | ZL daily OHLCV — powers the chart      | pg_cron: zl-daily                    | Dashboard chart, all pages       | Daily       |
| `price_1h`     | ZL hourly bars                         | pg_cron: zl-intraday                 | Intraday chart view              | Hourly      |
| `price_15m`    | ZL 15-min bars                         | pg_cron: zl-intraday                 | Intraday chart zoom              | 15min       |
| `price_1m`     | ZL 1-min bars (90-day retention)       | pg_cron: zl-intraday                 | Fine-grain chart                 | 1min        |
| `latest_price` | Most recent ZL price + timestamp       | pg_cron: zl-intraday, pg_cron rollup | Status bar, live ticker          | Real-time   |
| `futures_1d`   | 84 commodity/index futures daily       | pg_cron: databento-futures           | Specialist features, cross-asset | Daily       |
| `options_1d`   | ZL options chain                       | pg_cron: databento-options           | Vol surface                      | Daily       |
| `fx_1d`        | FX rates                               | pg_cron: fx-daily                    | FX specialist                    | Daily       |
| `etf_1d`       | Sector/commodity ETFs                  | pg_cron: etf-daily                   | Substitutes specialist           | Daily       |
| `vol_surface`  | ZL implied vol surface                 | Derived from options_1d              | Volatility specialist            | Daily       |
| `cftc_1w`      | CFTC positioning (absorbed from `pos`) | pg_cron: cftc-weekly                 | Sentiment page, CoT              | Weekly      |

### Schema: `econ` (Macro/Economic)

| Table            | Purpose                                                                | Writer                     | Reader                                  | Granularity    |
| ---------------- | ---------------------------------------------------------------------- | -------------------------- | --------------------------------------- | -------------- |
| `rates_1d`       | Interest rates, yields, SOFR, Fed Funds                                | pg_cron: fred              | Fed specialist, trump_effect specialist | Daily          |
| `inflation_1d`   | CPI, PPI, PCE                                                          | pg_cron: fred              | Macro context                           | Monthly        |
| `labor_1d`       | Employment, claims                                                     | pg_cron: fred              | Macro context                           | Weekly/Monthly |
| `activity_1d`    | GDP, industrial production, crop progress                              | pg_cron: fred, nass-weekly | Macro context                           | Varies         |
| `money_1d`       | M2, reserves                                                           | pg_cron: fred              | Fed specialist                          | Monthly        |
| `vol_indices_1d` | VIX, MOVE, OVX                                                         | pg_cron: fred              | Volatility specialist                   | Daily          |
| `commodities_1d` | FRED commodity prices (crude, gas, palm, soy, tallow PPI, UCO proxies) | pg_cron: fred, palm-oil    | Multiple specialists                    | Daily          |
| `weather_1d`     | Temperature, precipitation, drought indices                            | pg_cron: weather           | Weather features, supply context        | Daily          |

### Schema: `alt` (Alternative Intel)

| Table               | Purpose                                                                                                              | Writer                                      | Reader                              | Granularity  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------- | ------------ |
| `profarmer_news`    | ProFarmer articles ($500/mo, mandatory)                                                                              | Python Playwright scraper                   | Sentiment page, biofuel specialist  | Daily        |
| `legislation_1d`    | Federal Register regulations                                                                                         | pg_cron: legislation                        | Legislation page                    | Daily        |
| `executive_actions` | White House executive orders                                                                                         | pg_cron: legislation                        | Legislation page, tariff specialist | Daily        |
| `congress_bills`    | Congressional bills (NEW — legacy baseline had no table)                                                             | pg_cron: legislation                        | Legislation page                    | Daily        |
| `fed_speeches`      | Fed speeches (NEW — legacy baseline had no table)                                                                    | pg_cron: legislation                        | Fed specialist                      | Daily        |
| `ice_enforcement`   | ICE trade enforcement                                                                                                | pg_cron: trade-policy                       | Tariff specialist                   | Daily        |
| `news_events`       | Aggregated news with `source` discriminator column (Google, CONAB, FRED Blog, ESMIS, CBP, AEI, FarmDoc, biofuel RSS) | pg_cron: news, trade-policy, biofuel-policy | Sentiment page                      | Daily        |
| `tariff_deadlines`  | Upcoming tariff dates/actions                                                                                        | pg_cron: trade-policy                       | Strategy page, tariff specialist    | Event-driven |

**Design note:** `news_events` consolidates legacy baseline's separate tables (`econ_news`, `policy_news`, `cbp_trade`, `aei_trade`, `farmdoc_rins`, `fas_news`, `esmis_publications`, `biofuel_policy`) into a single table with a `source` column and `specialist_tags[]` array. This is cleaner — one table to query for the sentiment page, filterable by source or tag.

### Schema: `supply` (Physical Supply Chain)

| Table                 | Purpose                                          | Writer                  | Reader                              | Granularity |
| --------------------- | ------------------------------------------------ | ----------------------- | ----------------------------------- | ----------- |
| `usda_exports_1w`     | Country-level export sales (soybeans, oil, meal) | pg_cron: usda-exports   | China specialist, tariff specialist | Weekly      |
| `usda_wasde_1m`       | WASDE crop forecasts                             | pg_cron: usda-wasde     | Strategy page, supply context       | Monthly     |
| `eia_biodiesel_1m`    | Biodiesel production                             | pg_cron: eia-biodiesel  | Biofuel specialist                  | Monthly     |
| `epa_rin_1d`          | RIN credit prices                                | pg_cron: biofuel-policy | Biofuel specialist                  | Daily       |
| `lcfs_credits_1w`     | Low Carbon Fuel Standard credits                 | pg_cron: biofuel-policy | Biofuel specialist                  | Weekly      |
| `conab_production_1m` | Brazil crop production                           | pg_cron: supply-monthly | China specialist, palm specialist   | Monthly     |
| `china_imports_1m`    | Chinese soy complex imports                      | pg_cron: supply-monthly | China specialist                    | Monthly     |
| `argentina_crush_1m`  | Argentina crush margins                          | pg_cron: supply-monthly | Crush specialist                    | Monthly     |
| `mpob_palm_1m`        | Malaysia palm production                         | pg_cron: supply-monthly | Palm specialist                     | Monthly     |
| `panama_canal_1d`     | Canal transit data                               | pg_cron: panama-canal   | Supply logistics context            | Daily       |
| `fas_gats_1m`         | Global trade flows                               | pg_cron: supply-monthly | Trade context                       | Monthly     |

**Dropped from legacy baseline:** `eia_biodiesel_1w` (0 rows, never worked), `uco_prices_1w` (0 rows). UCO/tallow tracked via FRED PPI proxies in `econ.commodities_1d`.

### Schema: `training` (Entire ML Lifecycle)

| Table                              | Purpose                                            | Writer                               | Reader                                    | Granularity      |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------ | ----------------------------------------- | ---------------- |
| `matrix_1d`                        | Feature matrix (~1500 cols)                        | Python: build_matrix                 | Python: train_models                      | Daily rows       |
| `specialist_features_crush`        | Crush specialist raw features                      | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_china`        | China specialist raw features                      | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_fx`           | FX specialist raw features                         | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_fed`          | Fed specialist raw features                        | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_tariff`       | Tariff specialist raw features                     | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_energy`       | Energy specialist raw features                     | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_biofuel`      | Biofuel specialist raw features                    | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_palm`         | Palm specialist raw features                       | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_volatility`   | Volatility specialist raw features                 | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_substitutes`  | Substitutes specialist raw features                | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_features_trump_effect` | Trump effect specialist raw features               | Python: generate_specialist_features | Python: generate_specialist_signals       | Daily            |
| `specialist_signals_1d`            | Composite signals (11x3 = 33 cols)                 | Python: generate_specialist_signals  | Python: build_matrix (merged into matrix) | Daily            |
| `oof_core_1d`                      | Out-of-fold predictions                            | Python: train_models                 | Analytics derivation, model evaluation    | Per training run |
| `training_runs`                    | Training run metadata                              | Python: train_models                 | Ops monitoring                            | Per run          |
| `model_registry`                   | Active model versions (absorbed from `model`)      | Python: train_models                 | Python: forward inference                 | Per model        |
| `model_audit`                      | Model performance tracking (absorbed from `model`) | Python: evaluation scripts           | Dashboard accuracy metrics                | Per run          |
| `prediction_accuracy`              | Realized vs predicted (absorbed from `model`)      | Python: evaluation scripts           | Dashboard accuracy metrics                | Daily            |
| `board_crush_1d`                   | Soy crush margins (absorbed from `features`)       | pg_cron: board-crush                 | Crush specialist                          | Daily            |

### Schema: `forecasts` (All Forecast Outputs)

| Table                       | Purpose                                          | Writer                             | Reader                                | Granularity      |
| --------------------------- | ------------------------------------------------ | ---------------------------------- | ------------------------------------- | ---------------- |
| `production_1d`             | Forward price forecasts per horizon              | Python: generate_forward_forecasts | Dashboard Target Zones, strategy      | Per forecast run |
| `garch_forecasts`           | Conditional volatility forecasts                 | Python: run_garch                  | Volatility context, MC input          | Per run          |
| `monte_carlo_runs`          | 10,000 MC simulation results                     | Python: run_monte_carlo            | Probability distributions             | Per run          |
| `probability_distributions` | Probability distribution data                    | Python: run_monte_carlo            | Analytics                             | Per horizon      |
| `target_zones`              | **NEW** — Pre-computed P30/P50/P70 serving table | Python: generate_target_zones      | Dashboard chart overlay (direct read) | Per forecast run |
| `forecast_summary_1d`       | Human-readable forecast summary                  | Python: post-processing            | Strategy page, brief                  | Per run          |

**Key V16 change:** `target_zones` is a dedicated serving table. legacy baseline derived Target Zones on-the-fly from scattered forecast tables. V16 pre-computes and serves them clean.

### Schema: `analytics` (Dashboard Serving Layer)

| Table                   | Purpose                              | Writer                             | Reader                 | Granularity |
| ----------------------- | ------------------------------------ | ---------------------------------- | ---------------------- | ----------- |
| `driver_attribution_1d` | Top N price drivers                  | Python: post-training analysis     | Dashboard drivers card | Daily       |
| `regime_state_1d`       | Current market regime                | Python: regime classification      | Dashboard regime chip  | Daily       |
| `market_posture`        | ACCUMULATE/WAIT/DEFER recommendation | Python: strategy engine            | Strategy page          | Daily       |
| `risk_metrics`          | Portfolio risk summary               | Python: risk calculation           | Strategy page          | Daily       |
| `dashboard_metrics`     | Pre-computed dashboard numbers       | pg_cron: materialized view refresh | Dashboard stat cards   | Hourly      |
| `chart_overlays`        | Pivot lines, support/resistance      | pg_cron                            | Chart rendering        | Daily       |

### Schema: `ops` (Operational Health)

| Table              | Purpose                                       | Writer                       | Reader               | Granularity  |
| ------------------ | --------------------------------------------- | ---------------------------- | -------------------- | ------------ |
| `ingest_run`       | Job execution log (replaces inngest_receipts) | Every pg_cron function       | Freshness monitoring | Per run      |
| `data_quality_log` | Data quality issues                           | Validation checks in writers | Alerting             | Event-driven |
| `pipeline_alerts`  | Staleness/failure alerts                      | pg_cron: freshness check     | Ops monitoring       | Daily        |
| `source_registry`  | Canonical list of all data sources + status   | Manual / migration seed      | Reference            | Static       |

**Dropped from legacy baseline:** `quarantined_record` (overbuilt), `data_quality_metrics` (overlaps with log), `inngest_receipts` (Inngest is dead), `ablation_results` (research artifact).

### Schema: `vegas` (Vegas Operations)

| Table             | Purpose                                                          | Writer              | Reader                         | Granularity  |
| ----------------- | ---------------------------------------------------------------- | ------------------- | ------------------------------ | ------------ |
| `restaurants`     | Restaurant accounts                                              | Manual / Glide sync | Vegas Intel page               | Event-driven |
| `casinos`         | Casino properties                                                | Manual              | Vegas Intel page               | Static       |
| `events`          | Vegas events (CES, SEMA, March Madness) — **this is everything** | Manual / pg_cron    | Vegas Intel page, event impact | Event-driven |
| `venues`          | Event venue mapping                                              | Manual              | Vegas Intel page               | Static       |
| `fryers`          | Fryer equipment tracking                                         | Manual / Glide sync | Vegas Intel page               | Event-driven |
| `customer_scores` | Restaurant scoring/priority                                      | Derived             | Vegas Intel page               | Periodic     |
| `event_impact`    | Event -> oil demand impact                                       | Derived             | Vegas Intel page               | Event-driven |

**Consolidated from legacy baseline's 17 tables.** V16 drops over-normalized structure (`shifts`, `shift_casinos`, `shift_restaurants`, `cuisine_affinity`, `cuisine_match`, `event_labels`, `event_entities`, `event_profiles`, `daily_spend`) and uses fewer tables with richer JSON columns where appropriate.

---

## 5. Job Architecture — Replacing Inngest

### The legacy baseline Problem

104 Inngest functions running through a Docker Inngest dev container locally + Vercel serverless in production. Single point of orchestration failure, port conflicts (3000/8288), complex multi-layer healing scripts, serveHost drift incidents.

### V16 Job Homes — 4 Tiers

| Tier  | Home                                           | What Goes Here                                                                 | Why                                                                                                                                            |
| ----- | ---------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **pg_cron + http extension (inside Postgres)** | All ~22 data ingestion jobs                                                    | plpgsql functions call external APIs via `http_get`/`http_post`, parse JSON, upsert to tables. Triggered by pg_cron. No external orchestrator. |
| **B** | **Supabase pg_cron**                           | DB-internal operations                                                         | Runs inside Postgres, zero network hops, SQL-native                                                                                            |
| **C** | **Python workers (local/CI)**                  | Training pipeline, specialist signals, forecast generation, Monte Carlo, GARCH | Long-running compute, needs Python libs                                                                                                        |
| **D** | **Dedicated service**                          | ProFarmer scraper                                                              | Needs browser runtime                                                                                                                          |

### Tier A: pg_cron + http Extension (~22 plpgsql Functions)

legacy baseline had 104 fragmented Inngest functions. V16 consolidates to ~22 plpgsql functions triggered by pg_cron, running entirely inside Postgres via the `http` extension. No Vercel cron routes. No external orchestrator. FRED is split into `ingest_fred_core()` (chart-critical minimum, Phase 4) and `ingest_fred_catalog()` (full expansion, Phase 6). Databento functions stay separate — different symbol sets, different failure domains (see checkpoint-4-job-architecture.md).

**API keys** are stored in Supabase Vault and accessed via `current_setting()` inside plpgsql functions.

**Consolidation map:**

| V16 pg_cron Function         | Replaces (legacy baseline Inngest)                                                                                                                                                   | Schedule                 | Target Schema |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------- |
| `ingest_zl_daily()`          | `zl-daily`                                                                                                                                                                           | Daily 6:05 CT            | mkt           |
| `ingest_zl_intraday()`       | `zl-1h`, `zl-15m`, `zl-1m-intraday-refresh`                                                                                                                                          | Every 15m during session | mkt           |
| `ingest_databento_futures()` | 5 futures shards + 5 statistics shards + `databento-futures-1h` + `futures-legacy-symbols-nightly`                                                                                   | Daily 2 AM CT            | mkt           |
| `ingest_databento_options()` | 5 options shards                                                                                                                                                                     | Daily                    | mkt           |
| `ingest_fx_daily()`          | `databento-fx-daily`, `fx-spot-daily`, `fx-databento-spot-daily`                                                                                                                     | Daily                    | mkt           |
| `ingest_etf_daily()`         | `databento-etf-daily`, `databento-etf-vwap`, `yahoo-etf-fallback`                                                                                                                    | Daily 8 PM ET            | mkt           |
| `ingest_indices_daily()`     | `yahooIndicesDaily`                                                                                                                                                                  | Daily                    | mkt           |
| `ingest_fred_core()`         | Chart-critical FRED subset: rates (DFF, DGS2, DGS10), vol indices (VIXCLS, OVXCLS), inflation (CPIAUCSL), activity (INDPRO), crude (DCOILWTICO), soy (WPU06410132, PCU3116133116132) | Every 8h                 | econ          |
| `ingest_fred_catalog()`      | Full FRED catalog expansion: remaining 120+ series across all 8 econ tables (money supply, labor, weather proxies, extended commodity series)                                        | Every 8h                 | econ          |
| `ingest_cftc_weekly()`       | `cftcWeekly`                                                                                                                                                                         | Friday 4 PM ET           | mkt           |
| `ingest_usda_exports()`      | `usdaExportSalesWeekly`                                                                                                                                                              | Thursday                 | supply        |
| `ingest_usda_wasde()`        | `usdaWasdeMonthly`                                                                                                                                                                   | Monthly                  | supply        |
| `ingest_eia_biodiesel()`     | `eiaBiodieselMonthly`                                                                                                                                                                | Monthly                  | supply        |
| `ingest_supply_monthly()`    | CONAB, Argentina, MPOB, China imports, FAS GATS (5 functions)                                                                                                                        | Monthly (staggered)      | supply        |
| `ingest_panama_canal()`      | `panamaCanalDaily`                                                                                                                                                                   | Daily                    | supply        |
| `ingest_weather()`           | NOAA + OpenMeteo + weather features (3 functions)                                                                                                                                    | Daily                    | econ          |
| `ingest_legislation()`       | Federal Register + Congress bills + WhiteHouse + Fed speeches (4 functions)                                                                                                          | Daily                    | alt           |
| `ingest_news()`              | Google News + CONAB news + FRED Blog + ESMIS (4 functions)                                                                                                                           | Daily                    | alt           |
| `ingest_trade_policy()`      | CBP + AEI + ICE (3 functions)                                                                                                                                                        | Daily                    | alt           |
| `ingest_biofuel_policy()`    | EPA RIN + FarmDoc + LCFS + biofuel RSS (4 functions)                                                                                                                                 | Daily/Weekly             | supply, alt   |
| `ingest_board_crush()`       | `boardCrushDaily`                                                                                                                                                                    | Daily                    | training      |
| `ingest_palm_oil()`          | CPO + palm multi-source (3 functions)                                                                                                                                                | Daily                    | mkt, econ     |
| `ingest_specialist_sync()`   | `specialistSignalsSync`                                                                                                                                                              | Daily                    | training      |
| `ingest_market_drivers()`    | Existing market-drivers job                                                                                                                                                          | Daily                    | analytics     |
| `check_freshness()`          | `freshnessMonitor`                                                                                                                                                                   | Daily                    | ops           |
| `ingest_nyfed_daily()`       | `nyfedDaily`                                                                                                                                                                         | Daily                    | econ          |

**No Vercel cron routes exist.** All ingestion is database-native.

### Tier B: Supabase pg_cron (~5 DB-internal jobs)

| Job                           | SQL Operation                                                                                               | Schedule |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| Retention: delete old 1m bars | `DELETE FROM mkt.price_1m WHERE trade_date < now() - interval '90 days'`                                    | Daily    |
| Stale run cleanup             | `UPDATE ops.ingest_run SET status='TIMEOUT' WHERE started_at < now() - interval '24h' AND status='RUNNING'` | Daily    |
| Materialized view refresh     | `REFRESH MATERIALIZED VIEW analytics.dashboard_summary`                                                     | Hourly   |
| Latest price rollup           | `INSERT INTO mkt.latest_price SELECT ... FROM mkt.price_1h ...`                                             | Hourly   |
| Data freshness alert          | SQL function checking max dates across critical tables                                                      | Daily    |

### Tier C: Python Workers (~9 scripts)

Python writes intermediates to **LOCAL FILES** (parquet), not directly to cloud database tables. Only validated, promoted outputs go to cloud Supabase via `promote_to_cloud.py`.

| Script                            | What It Does                                             | Writes To (Local)                               | Promoted To (Cloud)                               | Trigger                |
| --------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- | ---------------------- |
| `build_matrix.py`                 | Assemble feature matrix                                  | `data/matrix_1d.parquet`                        | training.matrix_1d                                | Manual / system cron   |
| `train_models.py`                 | AutoGluon training (3 horizons: 30d/90d/180d)            | `models/` artifacts + `data/training_*.parquet` | training.\*, model_registry                       | Manual (training gate) |
| `generate_specialist_features.py` | 11 specialist feature generators                         | `data/specialist_features_*.parquet`            | training.specialist*features*\*                   | Manual / system cron   |
| `generate_specialist_signals.py`  | Composite signal extraction                              | `data/specialist_signals.parquet`               | training.specialist_signals_1d                    | After features         |
| `generate_forward_forecasts.py`   | Forward inference                                        | `data/forecasts_production.parquet`             | forecasts.production_1d                           | After training         |
| `run_monte_carlo.py`              | 10,000 MC runs per horizon                               | `data/monte_carlo_*.parquet`                    | forecasts.monte*carlo*_, forecasts.probability\__ | After forecasts        |
| `run_garch.py`                    | GJR-GARCH volatility                                     | `data/garch_forecasts.parquet`                  | forecasts.garch_forecasts                         | After price data       |
| `generate_target_zones.py`        | **NEW** — Pre-compute P30/P50/P70 serving data           | `data/target_zones.parquet`                     | forecasts.target_zones                            | After Monte Carlo      |
| `promote_to_cloud.py`             | **NEW** — Push validated local outputs to cloud Supabase | N/A (reads local parquet)                       | All promoted tables                               | After validation gate  |
| `refresh_fred_api.py`             | Full FRED history backfill (130+ series)                 | Writes directly to cloud (bulk historical)      | econ.\*                                           | Weekly system cron     |

### Tier D: ProFarmer — Special Handling

ProFarmer is $500/month and mandatory. Requires a headless browser.

**V16 approach:** Rebuild as a Python script using Playwright, triggered by system cron on the local/dev machine. Writes directly to cloud Supabase. Falls back to GitHub Actions scheduled workflow for redundancy if local machine is offline.

| Aspect     | legacy baseline                              | V16                                   |
| ---------- | -------------------------------------------- | ------------------------------------- |
| Runtime    | Puppeteer-extra (Node.js) via Docker Inngest | Playwright (Python) via system cron   |
| Hosting    | Docker container on local machine            | Direct Python script on local machine |
| Fallback   | None (if Docker down, no scraping)           | GitHub Actions scheduled workflow     |
| Browser    | System Chrome via `resolveChromePath()`      | Playwright-managed Chromium           |
| Complexity | 23 serverExternalPackages, healing scripts   | Single Python script, no Docker       |

### Ingestion Auth Pattern

pg_cron functions run **inside Postgres** as the `postgres` role — no external HTTP auth needed. No CRON_SECRET. No Vercel cron routes to protect.

API keys for external data sources (Databento, FRED, etc.) are stored in **Supabase Vault** and accessed inside plpgsql functions via `current_setting('app.databento_api_key')` etc. Keys never leave the database boundary.

---

## 6. API Surface

### Read Routes (dashboard-facing, ~15 routes)

| Route                     | Returns                                                  | Source Table(s)                                               |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| `/api/zl/price-1d`        | ZL daily OHLCV for chart                                 | mkt.price_1d                                                  |
| `/api/zl/price-1h`        | ZL hourly bars                                           | mkt.price_1h                                                  |
| `/api/zl/intraday`        | ZL 15m/1m bars                                           | mkt.price_15m, mkt.price_1m                                   |
| `/api/zl/live`            | Latest price + timestamp                                 | mkt.latest_price                                              |
| `/api/zl/target-zones`    | P30/P50/P70 zone data for chart overlay                  | forecasts.target_zones                                        |
| `/api/zl/forecast`        | Forecast summary (horizon, predicted price, probability) | forecasts.production_1d, forecasts.forecast_summary_1d        |
| `/api/dashboard/metrics`  | Pre-computed dashboard stats                             | analytics.dashboard_metrics                                   |
| `/api/dashboard/drivers`  | Top 4 price drivers                                      | analytics.driver_attribution_1d                               |
| `/api/dashboard/regime`   | Current regime state                                     | analytics.regime_state_1d                                     |
| `/api/strategy/posture`   | ACCUMULATE/WAIT/DEFER + rationale                        | analytics.market_posture                                      |
| `/api/sentiment/overview` | News sentiment + CoT positioning                         | alt.news_events, mkt.cftc_1w                                  |
| `/api/legislation/feed`   | Legislation + executive actions feed                     | alt.legislation_1d, alt.executive_actions, alt.congress_bills |
| `/api/vegas/intel`        | Restaurants, events, impact, customer data               | vegas.\*                                                      |
| `/api/health`             | DB connectivity + data freshness check                   | ops.ingest_run                                                |

### Data Ingestion (pg_cron — NOT Vercel routes)

All data ingestion runs as pg_cron + http plpgsql functions inside Supabase. No Vercel cron routes exist. See Section 5 Tier A for the current list of ~22 pg_cron functions.

### Auth Routes

| Route                | Purpose                |
| -------------------- | ---------------------- |
| `/api/auth/callback` | Supabase Auth callback |
| `/api/auth/check`    | Session validation     |

### Dropped from legacy baseline

- `/api/zl/brief` — fold into forecast
- `/api/zl/context` — fold into dashboard metrics
- `/api/zl/raw` — unnecessary
- `/api/zl/chart` — redundant with price-1d
- `/api/zl/price-5m` — unnecessary granularity
- `/api/policy/section-brief` — merge into legislation feed
- `/api/refresh-drivers` — drivers refresh via cron
- `/api/epu` — fold into dashboard metrics
- `/api/weather-risk` — fold into dashboard
- `/api/quant/overview` — quant page dropped

---

## 7. Auth & Security Model

### legacy baseline Problem

Custom cookie-based auth with unclear RLS enforcement. Service-role key used for all DB reads, bypassing Supabase RLS policies. No clear separation between public reads and admin writes.

### V16 Auth Design

**Two access tiers:**

| Tier                                    | Who                             | Supabase Key       | Can Do                                          |
| --------------------------------------- | ------------------------------- | ------------------ | ----------------------------------------------- |
| **Dashboard user** (Chris, Kevin)       | Authenticated via Supabase Auth | `anon` key + JWT   | Read all dashboard-facing tables via API routes |
| **System** (cron jobs, Python pipeline) | Service role                    | `service_role` key | Write to all tables, bypasses RLS               |

### RLS Strategy

| Schema                         | RLS | Policy                                                                         |
| ------------------------------ | --- | ------------------------------------------------------------------------------ |
| `mkt`, `econ`, `alt`, `supply` | ON  | `SELECT` for authenticated users, `INSERT/UPDATE` for service_role only        |
| `training`, `forecasts`        | ON  | `SELECT` for authenticated users, `INSERT/UPDATE/DELETE` for service_role only |
| `analytics`                    | ON  | `SELECT` for authenticated users, writes only from pg_cron or service_role     |
| `ops`                          | ON  | `SELECT` for service_role only (not user-facing)                               |
| `vegas`                        | ON  | `SELECT` for authenticated users, writes for service_role                      |

### API Route Auth Pattern

```
Browser -> /api/zl/price-1d -> middleware checks Supabase session cookie
  -> if valid: query with supabase client (respects RLS)
  -> if not: 401

pg_cron -> ingest_fred_core() / ingest_fred_catalog() plpgsql functions -> run inside Postgres as postgres role
  -> no external auth needed, access API keys via Supabase Vault
```

### Environment Variables

| Variable                        | Source               | Used By                                                        |
| ------------------------------- | -------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase integration | Browser client                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase integration | Browser client                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase integration | Server-side routes, cron                                       |
| `DATABASE_URL`                  | Supabase integration | Python pipeline (psycopg2 direct, port 5432)                   |
| `DATABASE_POOLER_URL`           | Supabase integration | Python short reads (port 6543)                                 |
| _(API keys in Vault)_           | Supabase Vault       | pg_cron ingestion functions access via `current_setting()`     |
| `DATABENTO_API_KEY`             | Supabase Vault       | pg_cron ingestion functions (accessed via `current_setting()`) |
| `FRED_API_KEY`                  | Supabase Vault       | pg_cron ingestion functions (accessed via `current_setting()`) |
| `PROFARMER_*`                   | Local env only       | ProFarmer scraper (never on Vercel)                            |

### Security Rules

1. No `service_role` key exposed to browser — ever
2. All browser reads go through API routes with JWT/session validation
3. `NEXT_PUBLIC_*` vars contain only anon key and URL — no secrets
4. Python pipeline uses direct connection (port 5432) for bulk writes — not pooler
5. ProFarmer credentials never deployed to Vercel
6. No manual `.env` copying — all env management through Vercel integration + `vercel env pull`

---

## 8. Python Pipeline Rebuild

### Pipeline Phases

```
Phase 1: Data Ingestion     <-- pg_cron + http extension handles this (not Python)
Phase 2: Feature Assembly    <-- build_matrix.py
Phase 3: Specialist Features <-- generate_specialist_features.py
Phase 4: Specialist Signals  <-- generate_specialist_signals.py
Phase 5: Core Training       <-- train_models.py (AutoGluon, 3 horizons: 30d/90d/180d)
Phase 6: Forward Inference   <-- generate_forward_forecasts.py
Phase 7: Monte Carlo         <-- run_monte_carlo.py (10,000 runs)
Phase 8: GARCH               <-- run_garch.py
Phase 9: Post-Processing     <-- generate_target_zones.py (NEW)
```

### What Changes from legacy baseline

| Aspect                  | legacy baseline                                   | V16                                                                             |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| **DB connection**       | psycopg2 -> Prisma Postgres                       | psycopg2 -> Supabase Postgres (direct for writes, pooler for reads)             |
| **Config**              | Scattered across modules                          | Single `config.py` with frozen model zoo, schema constants                      |
| **Matrix builder**      | 1,487 features, accumulated drift columns         | Clean rebuild — only features with a reader. Intentional count.                 |
| **Specialist features** | 11 buckets, some with ffill bugs, EIA zeros       | 11 buckets, clean loaders, explicit null policy per source                      |
| **Model artifacts**     | `models/core_v2/{horizon}d/` local files          | Same local structure, `model_registry` in Supabase tracks promotions            |
| **Forward inference**   | Two scripts existed (old OOF-based + new forward) | Single `generate_forward_forecasts.py` — forward only                           |
| **Target Zones**        | Derived on-the-fly in API routes                  | Pre-computed by `generate_target_zones.py`, written to `forecasts.target_zones` |
| **Package manager**     | uv                                                | uv (keep)                                                                       |
| **Testing**             | pytest with ~16% coverage                         | pytest — rebuild tests alongside pipeline                                       |

### New Script: `generate_target_zones.py`

legacy baseline scattered Target Zone computation across API routes and Monte Carlo outputs. V16 has a dedicated post-processing step:

```
Reads:  forecasts.production_1d + forecasts.monte_carlo_runs + forecasts.garch_forecasts
Computes: P30/P50/P70 price levels per horizon
Writes: forecasts.target_zones (serving table)
Dashboard reads: forecasts.target_zones directly -- no on-the-fly computation
```

### Pipeline Runner

```bash
# Full pipeline
python -m fusion.pipeline run --all

# Individual phases
python -m fusion.pipeline run --phase matrix
python -m fusion.pipeline run --phase specialists
python -m fusion.pipeline run --phase train
python -m fusion.pipeline run --phase forecast
python -m fusion.pipeline run --phase monte-carlo
python -m fusion.pipeline run --phase target-zones

# Dry run (shows what would happen, no writes)
python -m fusion.pipeline run --all --dry-run
```

### Connection Strategy

```
Cloud Supabase connection string:
  Direct (port 5432): for long training writes — no pooler timeout
  Pooled (port 6543): for short reads/queries

Env vars:
  SUPABASE_DB_URL       = direct connection
  SUPABASE_POOLER_URL   = pooled connection
```

### Data Posture

Cloud Supabase is canonical for all stored data. The Python pipeline is a compute client:

- **Reads:** from cloud Supabase (canonical source) via psycopg2
- **Training source:** local PostgreSQL staging database for AG only after explicit local load
- **Computes:** locally — all feature engineering, training, forecasting, simulation runs on local machine
- **Intermediates:** local parquet files — ephemeral compute artifacts, not canonical storage
- **Promotes:** validated compact outputs back to cloud Supabase via `promote_to_cloud.py`

Training data storage architecture keeps cloud Supabase canonical while allowing local PostgreSQL as the bounded AG training-source staging database. Current design: `promote_to_cloud.py` pushes validated outputs to cloud `training.*` tables. The local training source is not serving truth and is not a local Supabase replacement.

### Training Gate (carried from legacy baseline — still mandatory)

**NEVER start model training without explicit user approval.** The pipeline runner has a `--dry-run` flag. Training writes are gated behind a confirmation prompt.

Readiness gate is a separate hard stop. Non-dry-run `train` must also pass:

- local PostgreSQL source checks for all local raw hourly symbols, not a hardcoded symbol subset
- local raw FRED checks for all local long-form FRED series, not a hardcoded core-series subset
- local weather and alt/econ presence and recency checks
- ProFarmer must be present in the local AG source, not cloud-only
- active local training matrix and target tables must meet the production-scale row floor (`TRAINING_MIN_MATRIX_ROWS`, default `500000`)
- options are excluded from AG readiness unless explicitly enabled with `TRAINING_REQUIRE_OPTIONS=1`
- `train-readiness --dry-run` must run the same read-only checks and may return `blocked`

### Model Architecture (unchanged conceptually)

- **L0 Core:** 3 AutoGluon TimeSeriesPredictor ensembles (30d/90d/180d), each training 19-model zoo
- **Target:** Future ZL futures contract price (`close.shift(-horizon)`), columns named `target_price_{h}d`
- **Metric:** MAE (point forecast accuracy)
- **Output:** Single `predicted_price` per horizon
- **Covariates:** All OBSERVED (no known future values)
- **Validation:** 4 expanding windows
- **Frequency:** Business day (`B`)
- **L2/L3:** Calibration + Monte Carlo wraps price prediction with probability -> Target Zones

### Big-11 Specialists (unchanged conceptually)

| Bucket       | Model Type  | Signal Contract                       |
| ------------ | ----------- | ------------------------------------- |
| crush        | GBM         | Crush margin z-score + momentum       |
| china        | GBM         | Demand outlook + Brazil competition   |
| substitutes  | RF          | Substitution pressure + richness      |
| fx           | ARDL        | FX pressure index + carry             |
| fed          | Ridge       | Rates regime + change                 |
| tariff       | Rule-based  | Tariff risk + EPU spike               |
| energy       | VAR         | Energy spillover + momentum           |
| biofuel      | NLP + EMA   | Policy pressure + trend               |
| palm         | ECM + Ridge | Cointegration + mean reversion        |
| volatility   | GJR-GARCH   | Conditional variance z-score + regime |
| trump_effect | Event study | Intensity + volatility impact         |

---

## 9. Frontend Wireframe

### Shell: shadcn/ui + Radix + Tailwind CSS

shadcn/ui provides the component primitives. V16 builds the dashboard shell from scratch — sidebar nav, header bar, content area, responsive layout — using shadcn/ui components with ZINC Fusion brand tokens.

### Page Map (6 pages)

```
/                   -> Landing page (rewrite from scratch, legacy baseline visual reference)
/dashboard          -> Main dashboard (rewrite chart + cards from scratch, shadcn/ui shell)
/strategy           -> Strategy posture (keep content, redesign layout)
/legislation        -> Legislation tracking (clean rebuild)
/sentiment          -> News + CoT (keep first 3-4 rows)
/vegas-intel        -> Vegas operations (keep ALL, better layout)
```

### Landing Page (`/`)

**Directive: REWRITE FROM SCRATCH using legacy baseline as visual reference only — ZERO code copied.** The legacy baseline landing page design is specific and intentional. V16 reproduces it faithfully inside the shadcn/ui public (non-authenticated) shell. ZERO mock data.

**Elements to preserve exactly:**

- Hero composition with headline + proof + CTA
- NeuralSphere or equivalent premium visual
- Product module cards
- Trust/proof strip (horizons, specialists, update SLA)
- Method section narrative
- Logo + brand identity
- Typography and spacing intent

**Layout reference:**

```
+-------------------------------------------------------------+
| Top Nav: logo | product | methodology | access | CTA         |
+-------------------------------------------------------------+
| Hero:                                                        |
| Left: headline + proof + CTA                                 |
| Right: live chart teaser / animated data object              |
+-------------------------------------------------------------+
| Trust / proof strip: horizons | specialists | update SLA     |
+-------------------------------------------------------------+
| Product modules: Dashboard | Strategy | Policy | Intel       |
+-------------------------------------------------------------+
| Method section: How the intelligence stack works             |
+-------------------------------------------------------------+
| CTA / Footer                                                 |
+-------------------------------------------------------------+
```

### Dashboard (`/dashboard`)

**Directive: REWRITE chart from scratch using legacy baseline as visual reference — ZERO code copied, ZERO mock data. Keep cards.**

| Zone           | Content                                                                                                                                                                                                                            | Notes                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Chart area** | LightweightZlCandlestickChart — rewritten from scratch using legacy baseline as visual reference (ZERO code copied). ForecastTargetsPrimitive for Target Zones. PivotLinesPrimitive for pivots. Watermark. All settings preserved. | **Do not modify chart settings. They were hard-won.** |
| **Status bar** | Live price, last update, regime chip, data freshness                                                                                                                                                                               | mkt.latest_price, analytics.regime_state_1d           |
| **Cards row**  | Dashboard stat cards — keep exactly as-is                                                                                                                                                                                          | analytics.dashboard_metrics                           |
| **Drivers**    | Top 4 drivers card (ChrisTop4Drivers)                                                                                                                                                                                              | analytics.driver_attribution_1d                       |
| **Regime**     | Regime analysis chart                                                                                                                                                                                                              | analytics.regime_state_1d                             |

**Specialist highlight cards (planned — add in future sprint):**

These key elements need to be highlighted on the dashboard as cards. Not V16 launch blockers but planned additions:

- **Weather** risk card — drought/temperature impact on soy crop
- **Crush** margin card — current board crush, oil share, ratios
- **Volatility** regime card — current GARCH regime, VIX/OVX context
- **China** demand card — import trends, YoY comparison
- **Legislation** alert card — latest regulations affecting soy oil/biofuel
- **Used Cooking Oil (UCO)** price card — tallow/grease PPI proxies
- **Palm Oil** supply card — MPOB production, CPO price, substitution pressure

### Sentiment (`/sentiment`)

**Directive: Keep first 3-4 rows from legacy baseline.**

| Row   | Content                                            | Status                |
| ----- | -------------------------------------------------- | --------------------- |
| 1     | Sentiment overview / headline metrics              | KEEP                  |
| 2     | News feed with sentiment tags and source filtering | KEEP                  |
| 3     | CoT positioning / CFTC visualization               | KEEP                  |
| 4     | Narrative summary                                  | KEEP (if in top rows) |
| Lower | Deeper analytics                                   | Defer                 |

### Vegas Intel (`/vegas-intel`)

**Directive: Keep ALL. Events = everything. Better layout.**

| Element                  | Status                          | Notes                                                         |
| ------------------------ | ------------------------------- | ------------------------------------------------------------- |
| **Events calendar/feed** | KEEP — this is everything       | CES, SEMA, March Madness, conventions                         |
| **Intel buttons**        | KEEP                            | AI-powered sales strategy recommendations                     |
| **Restaurant data**      | KEEP                            | Real customer API data, real oil volumes used                 |
| **Casino/venue mapping** | KEEP                            | Which properties, which events                                |
| **AI sales strategy**    | KEEP — this is the gold feature | Personalized pitch generation matched with real customer data |
| **Fryer tracking**       | KEEP                            | Equipment lifecycle, service scheduling                       |
| **Layout**               | REDESIGN                        | Better information hierarchy, same content                    |

### Strategy (`/strategy`)

**Directive: Keep content, rethink layout.**

| Element                                | Status                                          |
| -------------------------------------- | ----------------------------------------------- |
| Market posture (ACCUMULATE/WAIT/DEFER) | KEEP                                            |
| Contract impact calculator             | KEEP                                            |
| Factor waterfall                       | KEEP                                            |
| FusionBrain visualization              | EVALUATE — keep if product-relevant             |
| Risk metrics                           | KEEP                                            |
| Specialist signal summary              | KEEP                                            |
| Layout                                 | REDESIGN — needs more thought, better hierarchy |

### Legislation (`/legislation`)

Clean rebuild. Feed of Federal Register rules, executive actions, congressional bills, with specialist tags and relevance scoring.

### Design Token Layer

V16 tokens for shadcn/ui customization:

- Colors (brand palette from legacy baseline logo)
- Spacing
- Radii
- Elevation
- Motion rules (subtle on data pages, richer on landing)
- Chart accent colors
- Typography
- Data-state colors (bullish/bearish/neutral)

---

## 10. Evaluation Gates & Quality Checks

### Gate 1: Supabase Foundation Verification

**Before any feature work:**

| Check                                                    | Evidence Required                                               |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| Supabase project created and reachable                   | Read-only cloud DB probe succeeds against cloud Supabase (`SELECT current_database(), current_user, now()`) |
| Cloud Supabase reachable from local machine              | `psql` or psycopg2 connection test succeeds against cloud Supabase          |
| Vercel <> Supabase integration active                    | Env vars auto-populated in Vercel project settings              |
| `vercel env pull` works in V16 repo                      | `.env.local` generated with correct Supabase keys               |
| DB health route responds                                 | `GET /api/health` returns `{ ok: true }` from local and preview |
| Direct psycopg2 connection from Python                   | Connection test passes against cloud Supabase                   |
| V16 repo is NOT linked to legacy baseline Vercel project | `vercel ls` shows only `zinc-fusion-v16`                        |

### Gate 2: Schema Integrity

**After schema creation, before any writes:**

| Check                                            | Evidence Required             |
| ------------------------------------------------ | ----------------------------- |
| All 9 schemas exist                              | `\dn` in psql lists exactly 9 |
| Every table has a primary key                    | No heap-only tables           |
| Every table has `created_at` timestamp           | Audit trail                   |
| Every table with external data has `ingested_at` | Freshness tracking            |
| Every table referenced by an API route exists    | Route -> table trace complete |
| No orphan tables (no reader AND no writer)       | Full dependency map           |
| RLS enabled on all tables                        | `rowsecurity = true` for all  |
| Indexes on all date/symbol columns               | `\di` confirms indexes        |

### Gate 3: Auth & Security Verification

| Check                                                            | Evidence Required                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| API keys stored in Supabase Vault                                | Vault entries confirmed for all external data sources       |
| All pg_cron ingestion functions use `current_setting()` for keys | Code review of each plpgsql function                        |
| No `service_role` key in browser-accessible code                 | Grep for key in client components = 0 results               |
| `NEXT_PUBLIC_*` vars contain only anon key and URL               | No secrets in public vars                                   |
| RLS policies block unauthenticated reads                         | Test: anon request without JWT -> rejected                  |
| Supabase Auth callback route works                               | Login -> callback -> session -> authenticated read succeeds |
| Python pipeline uses direct connection for bulk writes           | Connection string check                                     |

### Gate 4A: Cron Readiness Preflight (NEW — blocks Gate 4)

**Before any Gate 4 claim, cron infrastructure must be verified:**

| Check                                            | SQL Validation                                                                                                      | Evidence Required                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| pg_cron extension enabled                        | `SELECT count(*) FROM pg_extension WHERE extname = 'pg_cron'` = 1                                                   | Extension active                 |
| http extension enabled                           | `SELECT count(*) FROM pg_extension WHERE extname = 'http'` = 1                                                      | Extension active                 |
| Ingestion functions exist                        | `SELECT count(*) FROM pg_proc WHERE proname LIKE 'ingest_%'` ≥ expected count                                       | Functions deployed via migration |
| Cron jobs registered                             | `SELECT count(*) FROM cron.job` ≥ Phase 4 expected schedule count                                                   | Schedules active                 |
| No duplicate job names                           | `SELECT jobname, count(*) FROM cron.job GROUP BY jobname HAVING count(*) > 1` = 0 rows                              | No duplicates                    |
| No duplicate function names                      | `SELECT proname, count(*) FROM pg_proc WHERE proname LIKE 'ingest_%' GROUP BY proname HAVING count(*) > 1` = 0 rows | No duplicates                    |
| Vault keys stored                                | `SELECT current_setting('app.databento_api_key') IS NOT NULL` (repeat per source)                                   | Keys accessible                  |
| At least one successful run per Phase 4 function | `SELECT DISTINCT job_name FROM ops.ingest_run WHERE status = 'ok'` ⊇ Phase 4 functions                              | First-success evidence           |

**Preflight SQL block (run before claiming Gate 4):**

```sql
-- 1. Extension check
SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'http', 'pg_net');

-- 2. Schedule density
SELECT count(*) AS total_jobs FROM cron.job;

-- 3. Duplicate job name audit
SELECT jobname, count(*) FROM cron.job GROUP BY jobname HAVING count(*) > 1;

-- 4. Duplicate function name audit
SELECT proname, count(*) FROM pg_proc
WHERE proname LIKE 'ingest_%' AND pronamespace = 'public'::regnamespace
GROUP BY proname HAVING count(*) > 1;

-- 5. Critical source health (staleness per table)
SELECT 'mkt.price_1d' AS tbl, max(bucket_ts) AS latest, now() - max(bucket_ts) AS age FROM mkt.price_1d
UNION ALL
SELECT 'mkt.latest_price', max(updated_at), now() - max(updated_at) FROM mkt.latest_price
UNION ALL
SELECT 'econ.rates_1d', max(observation_date), now() - max(observation_date)::timestamp FROM econ.rates_1d;

-- 6. Vault key accessibility
SELECT current_setting('app.databento_api_key', true) IS NOT NULL AS databento_key_set,
       current_setting('app.fred_api_key', true) IS NOT NULL AS fred_key_set;

-- 7. First-success evidence
SELECT job_name, min(started_at) AS first_success
FROM ops.ingest_run WHERE status = 'ok' GROUP BY job_name;

-- 8. Duplicate ingested row check (example for price_1d)
SELECT symbol, bucket_ts, count(*) FROM mkt.price_1d
GROUP BY symbol, bucket_ts HAVING count(*) > 1;
```

**Gate 4A MUST pass before Gate 4 can be claimed.** If `cron.job` is empty, Gate 4 is blocked regardless of function existence.

### Gate 4: Data Flow Verification (requires Gate 4A)

| Check                                                | Evidence Required                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Each pg_cron ingestion function writes expected rows | Manual trigger -> DB row count increases                                       |
| Each API read route returns expected shape           | Sample response matches contract                                               |
| Chart renders with real data from Supabase           | Visual inspection on preview deploy                                            |
| Target Zones render on chart                         | ForecastTargetsPrimitive draws P30/P50/P70 lines                               |
| Live price updates                                   | latest_price timestamp is recent                                               |
| Freshness monitor fires and reports correctly        | After 24h, check ops.pipeline_alerts                                           |
| Gate 4A preflight passes                             | All cron readiness checks from Gate 4A pass                                    |
| No stale critical tables                             | `check_freshness()` confirms chart-critical tables within staleness thresholds |
| No duplicate ingested rows                           | `(source, symbol, bucket_ts)` uniqueness verified on OHLCV tables              |

### Gate 5: Python Pipeline Verification

| Check                                                            | Evidence Required                              |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `build_matrix.py` writes to training.matrix_1d in cloud Supabase | Row count > 0, column count matches            |
| All 11 specialist feature generators complete                    | specialist*features*{bucket} has rows for each |
| `generate_specialist_signals.py` produces 33 signal columns      | Check specialist_signals_1d                    |
| Training run completes for all 3 horizons                        | training_runs has 3 new rows                   |
| Forward inference writes to forecasts.production_1d              | Predicted prices exist per horizon             |
| Monte Carlo writes 10,000 runs                                   | monte_carlo_runs count check                   |
| `generate_target_zones.py` produces P30/P50/P70                  | target_zones has rows                          |
| Dashboard reads Target Zones correctly                           | Chart overlay matches Python output            |

### Gate 6: Parity Verification (legacy baseline vs V16)

| Check                                  | Evidence Required                     |
| -------------------------------------- | ------------------------------------- |
| `/api/zl/price-1d` — same OHLCV data   | Diff legacy baseline vs V16 responses |
| `/api/zl/live` — same latest price     | Compare timestamps and values         |
| Target Zones — same P30/P50/P70 levels | Side-by-side chart comparison         |
| Dashboard cards — same metrics         | Screenshot comparison                 |
| Sentiment page — same news feed        | Visual comparison                     |
| Vegas Intel — same events/restaurants  | Data comparison                       |

---

## 11. Phased Execution Sequence

Each phase has entry criteria, deliverables, and exit criteria. No phase starts until the prior phase's exit criteria are met.

### Phase 0: Infrastructure Foundation

**Entry:** New Supabase project created, new Vercel project created, new Git repo initialized.

| Step | Action                                                     | Exit Evidence                                                   |
| ---- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| 0.1  | Create Supabase project (Pro plan)                         | Dashboard accessible, connection string works                   |
| 0.2  | Create Vercel project `zinc-fusion-v16`                    | `vercel ls` shows project                                       |
| 0.3  | Install Supabase <> Vercel integration                     | Env vars auto-populated                                         |
| 0.4  | Init Next.js app with shadcn/ui + Radix + Tailwind CSS     | `npm run dev` renders shell                                     |
| 0.5  | Install shadcn/ui component library                        | `npx shadcn-ui init` succeeds                                   |
| 0.6  | Enable `http` and `pg_cron` extensions on cloud Supabase   | Extensions visible in Supabase dashboard, test `http_get` works |
| 0.7  | Create `/api/health` route                                 | Returns `{ ok: true }` from preview                             |
| 0.8  | Verify Python psycopg2 connects to cloud Supabase          | Connection test passes                                          |
| 0.9  | Copy brand assets (logo, watermark, icons) into `public/`  | Assets render on preview                                        |
| 0.10 | Set up `uv` Python environment with clean `pyproject.toml` | `uv sync` succeeds                                              |

**Exit criteria:** Health route live on preview, Python connects to cloud, brand assets visible, shadcn/ui shell renders, pg_cron + http extensions enabled on cloud Supabase.

### Phase 1: Schema & Seed

**Entry:** Phase 0 complete.

| Step | Action                                                                            | Exit Evidence                         |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------- |
| 1.1  | Create all 9 schemas via Supabase migration                                       | `\dn` shows 9 schemas                 |
| 1.2  | Create `mkt.*` tables (11 tables)                                                 | All tables exist with correct columns |
| 1.3  | Create `econ.*` tables (8 tables)                                                 | All tables exist                      |
| 1.4  | Create `alt.*` tables including NEW congress_bills + fed_speeches (8 tables)      | All tables exist                      |
| 1.5  | Create `supply.*` tables (11 tables)                                              | All tables exist                      |
| 1.6  | Create `training.*` tables including absorbed features + model tables (19 tables) | All tables exist                      |
| 1.7  | Create `forecasts.*` tables including NEW target_zones (6 tables)                 | All tables exist                      |
| 1.8  | Create `analytics.*` tables (6 tables)                                            | All tables exist                      |
| 1.9  | Create `ops.*` tables (4 tables)                                                  | All tables exist                      |
| 1.10 | Create `vegas.*` tables — consolidated design (7 tables)                          | All tables exist                      |
| 1.11 | Enable RLS on all tables                                                          | `rowsecurity = true` for all          |
| 1.12 | Create RLS policies (authenticated read, service_role write)                      | Policy tests pass                     |
| 1.13 | Create indexes on all date/symbol columns                                         | `\di` confirms indexes                |
| 1.14 | Seed `ops.source_registry` with all data sources                                  | Registry populated                    |
| 1.15 | Run Gate 2 (Schema Integrity) checks                                              | All checks pass                       |

**Exit criteria:** All tables exist, RLS active, indexes created, Gate 2 passes.

### Phase 1.5: Page Rewrites

**Entry:** Phase 1 complete. All schemas and tables exist.

All 6 pages are rewritten from scratch using legacy baseline as **VISUAL reference only**. ZERO code copied from legacy baseline. ZERO mock data — pages render in empty state until data is wired in later phases.

| Step  | Action                                                                                        | Exit Evidence                               |
| ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1.5.1 | Rewrite Landing page from scratch (legacy baseline is visual reference ONLY — no code copied) | Page renders in empty/placeholder state     |
| 1.5.2 | Rewrite Dashboard page from scratch (chart component, cards, status bar)                      | Page renders with empty state, no mock data |
| 1.5.3 | Rewrite Strategy page from scratch                                                            | Page renders with empty state               |
| 1.5.4 | Rewrite Legislation page from scratch                                                         | Page renders with empty state               |
| 1.5.5 | Rewrite Sentiment page from scratch                                                           | Page renders with empty state               |
| 1.5.6 | Rewrite Vegas Intel page from scratch                                                         | Page renders with empty state               |

**Rules:**

- ZERO code copied from legacy baseline — every line written fresh
- ZERO mock data — components show empty/loading states
- legacy baseline is studied for visual design and UX patterns only
- Data wiring happens in Phase 2 (chart), Phase 7 (dashboard), Phase 8 (secondary pages)

**Exit criteria:** All 6 pages render cleanly in empty state. No legacy baseline code present. No mock data.

### Phase 2: Read Path — Chart & Live Price

**Entry:** Phase 1 complete. This is the most critical phase — if the chart doesn't work, nothing else matters.

| Step | Action                                                                                                    | Exit Evidence                                      |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 2.1  | Seed `mkt.price_1d` with legacy baseline historical data (manual export/import)                           | 2+ years of ZL daily bars in Supabase              |
| 2.2  | Build `/api/zl/price-1d` read route                                                                       | Returns OHLCV JSON matching legacy baseline format |
| 2.3  | Rewrite LightweightZlCandlestickChart from scratch (legacy baseline visual reference, ZERO code copied)   | Chart renders with real data from Supabase         |
| 2.4  | Rewrite ForecastTargetsPrimitive from scratch                                                             | Target Zone lines render (placeholder data OK)     |
| 2.5  | Rewrite PivotLinesPrimitive from scratch                                                                  | Pivot lines render                                 |
| 2.6  | Rewrite chart watermark from scratch                                                                      | Watermark visible                                  |
| 2.7  | Build `/api/zl/live` read route                                                                           | Returns latest price                               |
| 2.8  | Rewrite useZlLivePrice hook from scratch                                                                  | Status bar shows live price                        |
| 2.9  | Rewrite dashboard cards from scratch (legacy baseline visual reference, ZERO code copied, ZERO mock data) | Cards render with placeholder/seeded data          |
| 2.10 | Build `/api/zl/price-1h` route                                                                            | Hourly data serves correctly                       |
| 2.11 | Parity check: legacy baseline chart vs V16 chart side-by-side                                             | Visually identical                                 |

**Exit criteria:** Chart renders identically to legacy baseline with real historical data. Live price route works. Cards render.

### Phase 3: Landing Page

**Entry:** Phase 2 complete (chart works).

| Step | Action                                                                                                                                                             | Exit Evidence                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| 3.1  | Rewrite legacy baseline landing page design from scratch into shadcn/ui public shell (legacy baseline is visual reference ONLY — ZERO code copied, ZERO mock data) | Landing page renders                      |
| 3.2  | Rewrite hero composition, typography, spacing from scratch (legacy baseline visual reference)                                                                      | Visual match to legacy baseline           |
| 3.3  | Rewrite NeuralSphere or equivalent premium visual from scratch                                                                                                     | Animation renders                         |
| 3.4  | Rewrite product module cards from scratch (ZERO mock data)                                                                                                         | Cards render with correct copy            |
| 3.5  | Rewrite trust/proof strip from scratch                                                                                                                             | Horizons, specialists, update SLA visible |
| 3.6  | Chart teaser section (can use the real chart component)                                                                                                            | Chart preview renders                     |
| 3.7  | CTA -> dashboard flow                                                                                                                                              | Click-through works                       |
| 3.8  | Logo in header                                                                                                                                                     | Brand identity correct                    |

**Exit criteria:** Landing page is visually faithful to legacy baseline. CTA leads to dashboard.

### Phase 4A: Cron Infrastructure Preflight (NEW — before Phase 4)

**Entry:** Phase 2 complete. Extensions enabled (verified in CP1). Vault keys not yet stored. cron.job empty.

This phase establishes cron readiness before any ingestion function is built. No runtime ingestion claims until this phase exits cleanly.

| Step | Action                                                                     | Exit Evidence                                                                            |
| ---- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 4A.1 | Store all required API keys in Supabase Vault (Databento, FRED, FAS, etc.) | `current_setting('app.databento_api_key')` returns non-null inside plpgsql               |
| 4A.2 | Verify pg_cron extension is operational                                    | `SELECT count(*) FROM cron.job` succeeds (returns 0 — no jobs yet, but table accessible) |
| 4A.3 | Verify http extension can make outbound calls                              | Test `SELECT http_get('https://httpbin.org/get')` succeeds inside a plpgsql block        |
| 4A.4 | Create `ops.ingest_run` logging pattern (if not already present)           | Logging table and insert function verified                                               |
| 4A.5 | Run Gate 4A preflight SQL block                                            | All checks pass (extensions present, vault keys accessible, no duplicate names)          |

**Exit criteria:** Vault keys stored, extensions operational, Gate 4A preflight passes. Phase 4 can begin.

### Phase 4: Data Ingestion — Critical pg_cron Functions

**Entry:** Phase 4A complete (cron infrastructure verified). Chart needs fresh data, not just seed data.

All data ingestion is implemented as plpgsql functions using pg_cron + http extension inside Supabase. No Vercel cron routes. No vercel.json cron config. API keys stored in Supabase Vault.

| Step | Action                                                                                                                               | Exit Evidence                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 4.1  | (Completed in Phase 4A — Vault keys already stored)                                                                                  | Verified in Phase 4A exit                                  |
| 4.2  | Build `ingest_zl_daily()` plpgsql function (ZL daily OHLCV via http extension)                                                       | New rows in mkt.price_1d after pg_cron fires               |
| 4.3  | Build `ingest_zl_intraday()` plpgsql function (1h + 15m via http extension)                                                          | Intraday bars populating                                   |
| 4.4  | Build `ingest_fred_core()` plpgsql function (chart-critical FRED subset: rates, vol indices, inflation, activity, crude, tallow PPI) | Core econ.\* tables updating with chart-critical series    |
| 4.5  | Build `ingest_databento_futures()` plpgsql function (all futures + stats)                                                            | mkt.futures_1d updating                                    |
| 4.6  | Build `ingest_databento_options()` plpgsql function                                                                                  | mkt.options_1d updating                                    |
| 4.7  | Build `ingest_fx_daily()` plpgsql function                                                                                           | mkt.fx_1d updating                                         |
| 4.8  | Build `ingest_etf_daily()` plpgsql function                                                                                          | mkt.etf_1d updating                                        |
| 4.9  | Build `ingest_cftc_weekly()` plpgsql function                                                                                        | mkt.cftc_1w updating                                       |
| 4.10 | Register all pg_cron schedules for steps 4.2-4.9                                                                                     | `SELECT count(*) FROM cron.job` ≥ expected Phase 4 count   |
| 4.11 | Build `check_freshness()` plpgsql function                                                                                           | ops.pipeline_alerts populating                             |
| 4.12 | Verify at least one successful controlled run of each Phase 4 function                                                               | `ops.ingest_run` has `status = 'ok'` row for each function |
| 4.13 | Run Gate 4A preflight again (post-registration)                                                                                      | All cron readiness checks pass with registered jobs        |

**Exit criteria:** Chart shows today's data. Core market tables updating on schedule via pg_cron. `ingest_fred_core()` feeding chart-critical FRED series. Freshness monitoring active. Gate 4A re-verified with registered jobs. No Vercel cron routes. `cron.job` count matches expected Phase 4 schedule density.

### Phase 5: Python Pipeline Rebuild

**Entry:** Phase 4 complete (data flowing into Supabase).

Python pipeline writes all intermediates to **LOCAL FILES** (parquet). Only validated outputs are promoted to cloud Supabase via `promote_to_cloud.py`. This prevents half-baked training artifacts from polluting the production database.

| Step | Action                                                                                                            | Exit Evidence                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 5.1  | Rebuild `config.py` — frozen model zoo, schema constants, DB URLs, local output paths                             | Config loads cleanly                                                                    |
| 5.2  | Rebuild `build_matrix.py` — reads from cloud Supabase, writes `data/fusion/matrix_1d.parquet` locally             | Local parquet has rows with expected column count and separate target columns           |
| 5.3  | Rebuild specialist feature generators (all 11) — writes `data/fusion/specialist_features/*.parquet` locally       | Local parquet files populated for each bucket with no target columns                    |
| 5.4  | Rebuild `generate_specialist_signals.py` — writes `data/fusion/specialist_signals.parquet` locally                | Local parquet has 33 signal columns                                                     |
| 5.5  | Rebuild `train_models.py` — AutoGluon, 3 horizons (30d/90d/180d), frozen zoo — writes artifacts + parquet locally | Training completes, artifacts saved locally, training_runs parquet logged               |
| 5.6  | Rebuild `generate_forward_forecasts.py` — writes `data/forecasts_production.parquet` locally                      | Local parquet has predicted prices per horizon                                          |
| 5.7  | Rebuild `run_monte_carlo.py` — 10,000 runs — writes `data/monte_carlo_*.parquet` locally                          | Local parquet files populated                                                           |
| 5.8  | Rebuild `run_garch.py` — writes `data/garch_forecasts.parquet` locally                                            | Local parquet populated                                                                 |
| 5.9  | Build NEW `generate_target_zones.py` — writes `data/target_zones.parquet` locally                                 | Local parquet has P30/P50/P70 per horizon                                               |
| 5.10 | Build NEW `promote_to_cloud.py` — reads local parquet, validates, pushes to cloud Supabase                        | Promotion gate: validates row counts, schema match, null checks before writing to cloud |
| 5.11 | Rebuild `pipeline.py` runner (orchestrates all phases including promotion)                                        | `PYTHONPATH=python python3 -m fusion.pipeline --all` completes end-to-end               |
| 5.12 | Run promotion gate — validate local outputs, promote to cloud                                                     | Cloud tables populated with validated data                                              |
| 5.13 | Run Gate 5 (Python Pipeline Verification)                                                                         | All checks pass                                                                         |

**Exit criteria:** Full pipeline runs end-to-end. Intermediates stored locally as parquet. Promotion gate validates before cloud write. Target Zones appear on dashboard chart after promotion.

### Phase 6: Remaining Data Ingestion + FRED Catalog Expansion

**Entry:** Phase 4 complete.

| Step | Action                                                                                                             | Exit Evidence                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 6.0  | Build `ingest_fred_catalog()` plpgsql function (full FRED catalog: remaining 120+ series across all 8 econ tables) | All econ.\* tables fully populated with complete FRED series set |
| 6.1  | Build `ingest_supply_monthly()` plpgsql function (CONAB, Argentina, MPOB, China, FAS)                              | supply.\* tables updating                                        |
| 6.2  | Build `ingest_usda_exports()` + `ingest_usda_wasde()` plpgsql functions                                            | supply.usda\_\* updating                                         |
| 6.3  | Build `ingest_eia_biodiesel()` plpgsql function                                                                    | supply.eia_biodiesel_1m updating                                 |
| 6.4  | Build `ingest_biofuel_policy()` plpgsql function (EPA RIN, FarmDoc, LCFS, RSS)                                     | supply + alt tables updating                                     |
| 6.5  | Build `ingest_legislation()` plpgsql function (Federal Register, Congress, WhiteHouse, Fed speeches)               | alt.\* tables updating                                           |
| 6.6  | Build `ingest_news()` plpgsql function (Google News, CONAB, FRED Blog, ESMIS)                                      | alt.news_events updating                                         |
| 6.7  | Build `ingest_trade_policy()` plpgsql function (CBP, AEI, ICE)                                                     | alt.\* tables updating                                           |
| 6.8  | Build `ingest_weather()` plpgsql function (NOAA, OpenMeteo, features)                                              | econ.weather_1d updating                                         |
| 6.9  | Build `ingest_board_crush()` plpgsql function                                                                      | training.board_crush_1d updating                                 |
| 6.10 | Build `ingest_palm_oil()` plpgsql function                                                                         | mkt/econ palm tables updating                                    |
| 6.11 | Build `ingest_panama_canal()` plpgsql function                                                                     | supply.panama_canal_1d updating                                  |
| 6.12 | Build ProFarmer scraper (Python Playwright, system cron)                                                           | alt.profarmer_news populating                                    |
| 6.13 | Set up pg_cron jobs (retention, stale cleanup, materialized views, freshness)                                      | pg_cron schedule visible in Supabase dashboard                   |
| 6.14 | Register all remaining pg_cron schedules                                                                           | All pg_cron jobs visible and firing in Supabase dashboard        |

**Exit criteria:** All data sources feeding Supabase. ProFarmer scraping. pg_cron running DB maintenance.

### Phase 7: Dashboard Completion + Analytics Routes

**Entry:** Phase 5 complete (forecasts exist).

| Step | Action                                         | Exit Evidence                                        |
| ---- | ---------------------------------------------- | ---------------------------------------------------- |
| 7.1  | Build `/api/zl/target-zones` route             | Returns P30/P50/P70 from forecasts.target_zones      |
| 7.2  | Wire Target Zones into chart                   | Horizontal zone lines render with real forecast data |
| 7.3  | Build `/api/dashboard/drivers` route           | Returns top 4 drivers                                |
| 7.4  | Wire ChrisTop4Drivers card                     | Drivers display with real data                       |
| 7.5  | Build `/api/dashboard/regime` route            | Returns regime state                                 |
| 7.6  | Wire regime chip + RegimeAnalysisChart         | Regime renders                                       |
| 7.7  | Build `/api/dashboard/metrics` route           | Returns dashboard stats                              |
| 7.8  | Wire all dashboard cards with live data        | Cards show real numbers                              |
| 7.9  | Run Gate 6 (Parity Verification) for dashboard | V16 dashboard matches legacy baseline                |

**Specialist highlight cards (noted for future sprint):**

- Weather risk card
- Crush margin card
- Volatility regime card
- China demand card
- Legislation alert card
- UCO/tallow price card
- Palm oil supply card

**Exit criteria:** Dashboard fully functional with real data. Target Zones rendering. Cards live. Parity with legacy baseline confirmed.

### Phase 8: Secondary Pages

**Entry:** Phase 7 complete.

| Step | Action                                                                                                                                                                                                                              | Exit Evidence                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 8.1  | Build `/api/sentiment/overview` route                                                                                                                                                                                               | Returns news + CoT data                                  |
| 8.2  | Wire Sentiment page with real data — first 3-4 rows from legacy baseline visual reference (ZERO code copied, ZERO mock data)                                                                                                        | Sentiment overview, news feed, CoT, narrative render     |
| 8.3  | Build `/api/legislation/feed` route                                                                                                                                                                                                 | Returns legislation + executive actions + congress bills |
| 8.4  | Wire Legislation page with real data (ZERO code copied from legacy baseline, ZERO mock data)                                                                                                                                        | Feed renders with tags and relevance                     |
| 8.5  | Build `/api/strategy/posture` route                                                                                                                                                                                                 | Returns ACCUMULATE/WAIT/DEFER + rationale                |
| 8.6  | Wire Strategy page with real data — keep content, redesign layout (ZERO code copied from legacy baseline, ZERO mock data)                                                                                                           | Posture, calculator, waterfall, risk metrics render      |
| 8.7  | Build `/api/vegas/intel` route                                                                                                                                                                                                      | Returns events, restaurants, scores, customer data       |
| 8.8  | Wire Vegas Intel page with real data — ALL content, better layout. Events = everything. Intel buttons + AI sales strategy + real customer API data + real oil usage = gold. (ZERO code copied from legacy baseline, ZERO mock data) | All elements render                                      |
| 8.9  | Parity check: all pages vs legacy baseline                                                                                                                                                                                          | Functionality matches or exceeds                         |

**Exit criteria:** All 6 pages (Landing, Dashboard, Strategy, Legislation, Sentiment, Vegas Intel) operational.

### Phase 9: Auth, Security, Observability

**Entry:** Phase 8 complete.

| Step | Action                                                      | Exit Evidence                        |
| ---- | ----------------------------------------------------------- | ------------------------------------ |
| 9.1  | Implement Supabase Auth (login flow for Chris/Kevin)        | Login flow works                     |
| 9.2  | Protect all dashboard routes (middleware)                   | Unauthenticated -> redirect to login |
| 9.3  | Run Gate 3 (Auth & Security Verification)                   | All checks pass                      |
| 9.4  | Set up error tracking (Sentry or Vercel Analytics)          | Errors captured                      |
| 9.5  | Set up uptime monitoring for critical routes                | Alerts configured                    |
| 9.6  | Set up Supabase database alerts (storage, connection count) | Alerts configured                    |

**Exit criteria:** Auth working, security gates pass, monitoring live.

### Phase 10: Parallel Validation & Cutover

**Entry:** All prior phases complete.

| Step | Action                                            | Exit Evidence                         |
| ---- | ------------------------------------------------- | ------------------------------------- |
| 10.1 | Run legacy baseline + V16 side by side for 1 week | Both serving, compare outputs daily   |
| 10.2 | Run Gate 6 (Parity Verification) — full suite     | All parity checks pass                |
| 10.3 | Run Gate 4 (Data Flow Verification) — full suite  | All data flows verified               |
| 10.4 | Freeze legacy baseline changes                    | No new legacy baseline deploys        |
| 10.5 | Switch DNS/routing to V16                         | V16 serves production traffic         |
| 10.6 | Monitor for 48h                                   | No errors, data fresh, charts correct |
| 10.7 | Keep legacy baseline as rollback for 2 weeks      | Rollback available                    |
| 10.8 | Retire legacy baseline                            | Archive repo, disable Vercel project  |

**Exit criteria:** V16 is production. legacy baseline is archived.

---

## 12. Risk Matrix

### Prioritized Risks

| #       | Risk                                                                  | Likelihood | Impact         | Mitigation                                                                                                                                                                            |
| ------- | --------------------------------------------------------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1**  | Chart rendering breaks during rewrite                                 | Medium     | **Critical**   | Rewrite from scratch using legacy baseline as visual reference, do not refactor. Test on preview with real data before proceeding.                                                    |
| **R2**  | pg_cron complexity / http extension limitations                       | Low        | High           | Test each plpgsql ingestion function individually. Fall back to Edge Functions if http extension cannot handle a specific API.                                                        |
| **R3**  | Supabase connection pooler timeouts during Python training writes     | Medium     | High           | Use direct connection (port 5432) for bulk writes, not pooler. Set `statement_timeout`.                                                                                               |
| **R4**  | ProFarmer scraper breaks in Playwright rebuild                        | Medium     | High ($500/mo) | Build Playwright version early. Test against ProFarmer site. Keep legacy baseline scraper as fallback.                                                                                |
| **R5**  | Specialist feature generators produce different signals after rebuild | Medium     | High           | Validate V16 outputs against legacy baseline outputs row-by-row before training.                                                                                                      |
| **R6**  | AutoGluon model performance degrades on clean matrix                  | Medium     | Medium         | Expected — clean matrix has different features. Retrain and evaluate. Dry run first.                                                                                                  |
| **R7**  | FRED/Databento/USDA API changes between builds                        | Low        | Medium         | Use legacy baseline as reference for API contracts. Check docs before building each cron.                                                                                             |
| **R8**  | Supabase RLS blocks legitimate reads                                  | Medium     | Medium         | Test RLS policies explicitly in Gate 3.                                                                                                                                               |
| **R9**  | Vegas Intel data sync breaks (Glide integration)                      | Low        | Medium         | Evaluate Glide sync separately.                                                                                                                                                       |
| **R10** | Schema drift on cloud Supabase                                        | Low        | Medium         | Supabase CLI migrations as single source of truth (`db push`, `db diff --linked`). Never manual DDL. No local Supabase to drift.                                                      |
| **R11** | pg_cron function timeout or http extension response limits            | Low        | Medium         | pg_cron runs inside Postgres with configurable timeout. http extension handles standard REST APIs. ProFarmer stays as external Python scraper.                                        |
| **R12** | Env variable mismatch between environments                            | Low        | Low            | Vercel <> Supabase integration. `vercel env pull` for local. No manual .env copying.                                                                                                  |
| **R13** | Cron jobs not registered — ingestion claimed but not running          | Medium     | **Critical**   | Gate 4A blocks all ingestion claims until `cron.job` has expected entries and first-success evidence exists in `ops.ingest_run`. Never claim ingestion readiness before registration. |
| **R14** | FRED core/catalog split misses chart-critical series                  | Low        | High           | `ingest_fred_core()` explicitly includes rates, vol indices, inflation, activity, crude, tallow PPI. Catalog expansion deferred to Phase 6 — does not block chart rendering.          |

---

## 13. Highest-Value Validation Steps

Run these first — they reveal architectural problems fastest:

1. **Does Phase 4A verify cron readiness and first successful writes before claiming data readiness?** If `cron.job` is empty or no function has a successful `ops.ingest_run` entry, all downstream ingestion claims are false. Run the Gate 4A preflight SQL block.
2. **Can Python connect to cloud Supabase and write a row?** If this fails, the entire training pipeline design is blocked.
3. **Does the chart render with seeded data from Supabase?** If this fails, the core product is broken.
4. **Does a single pg_cron + http plpgsql function fire, fetch data, and write to a table?** If this fails, the entire ingestion architecture is wrong.
5. **Does Supabase Auth work with the shadcn/ui shell?** If this fails, the auth design needs rework.
6. **Can `build_matrix.py` read from Supabase and assemble features?** If this fails, the Python <> Supabase data flow needs debugging.
7. **Does `check_freshness()` detect and alert on stale data?** Simulate a stale source and verify `ops.pipeline_alerts` fires. This must work before Gate 4/Gate 5 claims.

---

## 14. Dependency-Aware Remediation Sequence

If something breaks, fix in this order (upstream first):

```
Supabase connectivity
  -> Schema correctness
    -> RLS policies
      -> Seed data
        -> Chart rendering (MOST CRITICAL)
          -> Cron routes (ZL daily first)
            -> FRED/macro crons
              -> Python pipeline
                -> Specialist features
                  -> Training
                    -> Forecasts
                      -> Target Zones
                        -> Dashboard wiring
                          -> Secondary pages
                            -> Auth
                              -> Monitoring
```

---

## Appendix A: legacy baseline Reference Files

These legacy baseline files serve as reference for what V16 must deliver. They are NOT copied — they are studied for contracts and behavior.

### Chart (visual reference — most critical, rewrite from scratch)

- [`frontend/src/components/LightweightZlCandlestickChart.tsx`](frontend/src/components/LightweightZlCandlestickChart.tsx)
- [`frontend/src/lib/charts/ForecastTargetsPrimitive.ts`](frontend/src/lib/charts/ForecastTargetsPrimitive.ts)
- [`frontend/src/lib/charts/PivotLinesPrimitive.ts`](frontend/src/lib/charts/PivotLinesPrimitive.ts)
- [`frontend/src/lib/charts/pivots.ts`](frontend/src/lib/charts/pivots.ts)
- [`frontend/src/hooks/useZlLivePrice.ts`](frontend/src/hooks/useZlLivePrice.ts)

### Landing Page (visual reference — rewrite from scratch)

- [`frontend/src/app/page.tsx`](frontend/src/app/page.tsx)
- [`frontend/src/components/viz/NeuralSphere.tsx`](frontend/src/components/viz/NeuralSphere.tsx)

### Dashboard

- [`frontend/src/app/dashboard/page.tsx`](frontend/src/app/dashboard/page.tsx)
- [`frontend/src/components/StatusBar.tsx`](frontend/src/components/StatusBar.tsx)
- [`frontend/src/components/ChrisTop4Drivers.tsx`](frontend/src/components/ChrisTop4Drivers.tsx)
- [`frontend/src/components/RegimeAnalysisChart.tsx`](frontend/src/components/RegimeAnalysisChart.tsx)

### Pages

- [`frontend/src/app/strategy/page.tsx`](frontend/src/app/strategy/page.tsx)
- [`frontend/src/app/legislation/page.tsx`](frontend/src/app/legislation/page.tsx)
- [`frontend/src/app/sentiment/page.tsx`](frontend/src/app/sentiment/page.tsx)
- [`frontend/src/app/vegas-intel/page.tsx`](frontend/src/app/vegas-intel/page.tsx)

### Brand Assets (KEEP)

- [`frontend/public/logo.svg`](frontend/public/logo.svg)
- [`frontend/public/chart_watermark.svg`](frontend/public/chart_watermark.svg)
- [`frontend/public/ZINC Fusion Icon Transparent (6000 X 3000 Px) (2000 X 2000 Px) - 1.svg`](frontend/public/ZINC%20Fusion%20Icon%20Transparent%20%286000%20X%203000%20Px%29%20%282000%20X%202000%20Px%29%20-%201.svg)
- [`frontend/public/head.glb`](frontend/public/head.glb)

### Shell & Styling

- [`frontend/src/app/layout.tsx`](frontend/src/app/layout.tsx)
- [`frontend/src/components/Header.tsx`](frontend/src/components/Header.tsx)
- [`frontend/src/app/globals.css`](frontend/src/app/globals.css)

### Inngest Estate (reference for what jobs did — NOT for porting)

- [`frontend/src/inngest/functions.ts`](frontend/src/inngest/functions.ts) — barrel export of all functions
- [`frontend/src/app/api/inngest/route.ts`](frontend/src/app/api/inngest/route.ts) — registration hub

### Python Pipeline (reference for what scripts did — NOT for porting)

- [`src/fusion/core_training/config.py`](src/fusion/core_training/config.py) — model zoo
- [`src/fusion/core_training/build_matrix.py`](src/fusion/core_training/build_matrix.py) — feature assembly
- [`src/fusion/core_training/train_models.py`](src/fusion/core_training/train_models.py) — training
- [`scripts/generate_forward_forecasts.py`](scripts/generate_forward_forecasts.py) — inference
- [`scripts/run_monte_carlo.py`](scripts/run_monte_carlo.py) — MC simulation
- [`scripts/run_garch.py`](scripts/run_garch.py) — GARCH
- [`scripts/generate_specialist_features.py`](scripts/generate_specialist_features.py) — specialist features
- [`scripts/generate_specialist_signals.py`](scripts/generate_specialist_signals.py) — specialist signals

## Appendix B: Banned Words & Required Language

### Banned (never use)

- "cones" / "probability cone"
- "confidence band"
- "funnel"
- "cents/lb"
- "10 specialists" (there are 11)

### Required

- "Target Zones" (horizontal price zones)
- "predicted_price" (core output)
- "ZL futures contract price"
- "ZL has an X% chance of hitting XX.XX by [date]"
- "Monte Carlo", "pinball", "MAE/accuracy %"

## Appendix C: Data Source Reference

### Paid Sources

- **ProFarmer** ($500/month) — mandatory, 8,535+ articles
- **Databento** — ZL futures, options, statistics, FX, ETF OHLCV

### Free API Sources

- FRED (130+ series) — rates, inflation, commodities, vol indices
- CFTC — weekly CoT positioning
- USDA FAS — export sales, WASDE
- EIA — biodiesel production
- EPA — RIN credit prices
- NOAA / Open-Meteo — weather
- Federal Register — regulations
- Congress.gov — bills
- White House — executive actions
- Google News — sentiment feed
- CONAB — Brazil crop production
- MPOB — Malaysia palm (needs API key)
- Panama Canal Authority — transit data

### FRED PPI Proxies for UCO/Tallow

- `WPU06410132` — Tallow PPI
- `PCU3116133116132` — Rendering PPI
- Stored in `econ.commodities_1d`, consumed by biofuel specialist
