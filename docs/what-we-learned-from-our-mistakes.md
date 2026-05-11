# What We Learned From Our Mistakes

## Why This Document Exists

legacy baseline was built over months by multiple AI agents and a human architect. Along the way, every category of mistake was made — some multiple times. This document exists so V16 doesn't repeat them.

**Read this before writing any code. Every section is a scar from real production pain.**

---

## Category 1: Orchestration & Infrastructure Drift

### The Inngest ServeHost Disaster

**What happened:** A rogue AI agent changed the Inngest `serveHost` configuration to point at `https://rabid-raccoon.vercel.app` instead of the correct legacy baseline URL. This caused all 25+ cron jobs to return 500 errors. Nothing ingested. Data went stale. Nobody noticed immediately.

**Root cause:** The Inngest configuration was mutable and the `VERCEL_URL` environment variable was leaking into the serve host for local dev.

**What we built to fix it:** A 3-layer defense system:
- Layer 1: Config hardening — `serveHost` only set in production (`VERCEL==="1"` AND `VERCEL_ENV==="production"`)
- Layer 2: Guard script (`inngest_guard.sh`) — static analysis blocks Vercel URLs in config, health checks verify endpoints
- Layer 3: Healer script (`inngest_heal.sh`) — self-healing loop that detects drift, restarts dead servers, kills port squatters

**V16 lesson:** We eliminated Inngest entirely. Vercel Cron + pg_cron is simpler, has no orchestrator to drift, and no ports to conflict. The best defense against orchestrator drift is not having an orchestrator.

### Port Conflict Hell

**What happened:** Three services needed three ports:
- Port 3000: legacy baseline Next.js app
- Port 3001: rabid-raccoon Next.js app
- Port 8288: Inngest dev server (Docker)

Agents would accidentally start dev servers on occupied ports, or Inngest would fail to connect because the dev server wasn't running yet, or Docker would die and take Inngest with it.

**V16 lesson:** V16 has no local Supabase, no Docker, and no Inngest container. Local services are limited to the app dev server and the bounded local PostgreSQL AG training-source staging database when explicitly needed. Ingestion schedules run inside Supabase via pg_cron + http, not Vercel cron and not local Docker.

### Docker Inngest Complexity Spiral

**What happened:** ProFarmer (browser scraper) couldn't run on Vercel serverless (timeout). So we ran it through Docker Inngest locally. This required:
- Docker container running `inngest-dev` on port 8288
- `resolveChromePath()` to detect runtime environment (Docker vs macOS vs Vercel)
- 23 entries in `serverExternalPackages` in `next.config.ts`
- 22 glob patterns in `outputFileTracingIncludes`
- Healing scripts to restart Docker when it died
- Guard scripts to prevent config drift

All this to run one scraper.

**V16 lesson:** ProFarmer is rebuilt as a standalone Python Playwright script triggered by system cron. No Docker. No Inngest. No `serverExternalPackages`. One file, one cron entry, direct write to Supabase.

---

## Category 2: Schema & Migration Drift

### The 34-Migration Graveyard

**What happened:** Over months of development, 34 Prisma migrations accumulated. Schema changes were made reactively — add a column here, rename a constraint there, change a type somewhere else. The migration chain became fragile. A single migration that tried to reconcile drift (`20260226220000_drift_reconciliation_safe`) had to handle constraint renames and column type changes across hundreds of fields.

**Specific pain:** `matrix_1d` had ~566 `@db.Real` fields (4-byte) because of Postgres row size limits, but 29 newer columns were bare `Float?` (8-byte DOUBLE PRECISION). This was intentional but confusing — and only documented after multiple agents got confused.

**V16 lesson:** Fresh Supabase project, no migration chain to inherit. SQL-first migrations via Supabase CLI. Every column type is intentional from day one. No Prisma — direct SQL migrations are the source of truth.

### Model-Matrix Schema Drift

**What happened:** The feature matrix grew from 1,018 columns to 1,559 columns over time as new data sources were added. But the trained models still expected 1,018. This created a silent drift:
- 554 extra columns in the matrix were ignored by AutoGluon (harmless but wasteful)
- 13 columns the models expected were MISSING from the matrix (had to be backfilled as NaN)

The 13 missing columns were legacy pandas_ta technical indicators and ETF-derived features that had been removed from the matrix builder but were still baked into the model artifacts.

**V16 lesson:** The matrix builder and model config must be rebuilt together. The frozen model zoo in `config.py` defines what trains. The matrix builder defines what features exist. These two must agree. Any column reconciliation hack is a sign of drift.

### Orphaned Tables — Data Sources With No Reader

**What happened:** Five tables existed with real data but were NOT wired into the matrix builder:
- `mkt.etf_1d` (46K rows)
- `alt.legislation_1d` (2,944 rows)
- `supply.eia_biodiesel_1m` (179 rows)
- `supply.eia_biodiesel_1w` (0 rows — never worked)
- `supply.uco_prices_1w` (0 rows — never populated)

The Inngest functions were ingesting data. The tables were filling up. But nobody was reading them. The data sat there doing nothing.

Even worse: two Inngest functions (`fedSpeechesDaily`, `congressBillsDaily`) were registered and running on schedule, but their target DB tables **didn't even exist**. They were silently failing every day.

**V16 lesson:** The migration plan requires every table to have both a reader AND a writer. No orphans allowed. The schema design traces from screen → component → hook → route → SQL → table → writer → source. If any link is missing, the table doesn't get created.

---

## Category 3: External API & Data Source Mistakes

### The Wrong USDA API Key (Months of Failure)

**What happened:** The `USDA_API_KEY` stored in Vercel was `98AE1A55...` — a FoodData Central key. But the data we needed came from FAS (Foreign Agricultural Service) and MARS (Market News). Different USDA services, different APIs, different keys. The wrong key was deployed for months. Every USDA FAS call silently failed or returned wrong data.

**V16 lesson:** Verify every API key against the specific service it's meant for. USDA alone has at least 4 different API systems with different auth. Document which key goes to which service in the source registry.

### The Wrong USDA Report Number

**What happened:** We built an ingestion pipeline for USDA AMS report 2464, thinking it was tallow/grease pricing. It was actually **boxed beef**. The correct tallow reports are:
- Report 2839 (NW_LS906) — weekly tallow
- Report 2837 (NW_LS442) — daily tallow

We discovered this only after building and testing the entire pipeline.

**V16 lesson:** Before building ANY data ingestion, verify the source report by actually looking at the data it returns. Don't trust report numbers from memory or assumptions.

### The MARS API Auth Surprise

**What happened:** We assumed the USDA MARS API (mymarketnews.ams.usda.gov) was free and unauthenticated like most USDA APIs. It isn't. It requires registration and returns 403 without credentials. We built the UCO/tallow price ingestion pipeline before discovering this.

**Workaround:** FRED PPI proxy series (`WPU06410132` for Tallow PPI, `PCU3116133116132` for Rendering PPI) used as substitutes.

**V16 lesson:** Test API access BEFORE building the ingestion pipeline. A 5-minute curl test would have saved hours of development.

### EIA API Completely Down

**What happened:** The entire EIA API (`api.eia.gov`) has been unresponsive since approximately March 1, 2026. The key is valid but the service times out. `eia_biodiesel_1w` has 0 rows because the API never responded.

**V16 lesson:** Build all data ingestion with graceful failure handling. Log the failure to `ops.ingest_run`, don't crash the cron route, and alert if a source is stale for more than N days.

### Yahoo Finance Downsampling Trap

**What happened:** Yahoo Finance v8 API silently downsamples OHLCV data to monthly bars when the requested date range is too large. We were requesting 5+ years and getting monthly data back, thinking it was daily. The data looked plausible (prices were in range) but the granularity was wrong.

**V16 lesson:** Always request Yahoo data in 1-year windows using `period1/period2` epoch timestamps. Verify the response granularity matches expectations.

### FRED Daily Limit Gotcha

**What happened:** FRED API with `limit=5` returns only the 5 most recent observations. The daily ingestion was set to `limit=5` to keep payloads small. This works fine for daily maintenance — but when someone expected a full history from the daily function, they got 5 rows. A separate `refresh_fred_api.py` script was needed for full backfill.

**V16 lesson:** Separate the daily maintenance path (fetch latest N) from the backfill path (fetch full history). Make both explicit.

---

## Category 4: ProFarmer — An Entire Category of Pain

### The 17-Day Outage Nobody Noticed

**What happened:** ProFarmer scraping died on February 15, 2026 and wasn't fixed until March 3. That's 17 days of a $500/month data source producing nothing. The cause was Turbopack tree-shaking in Next.js breaking transitive dependencies:

```
puppeteer-extra → is-plain-object → kind-of → fs-extra
```

Each dependency in the chain broke separately and was fixed incrementally. The fix required:
- 23 entries in `serverExternalPackages`
- 22 glob patterns in `outputFileTracingIncludes`
- A complete rethink of where the scraper runs

**V16 lesson:** ProFarmer is rebuilt in Python with Playwright. No Node.js transitive dependency chain. No Turbopack tree-shaking. No `serverExternalPackages`. One language, one browser automation library, one script.

### "Vercel Will Fix It" — The Repeated Lie

**What happened:** Multiple times, agents claimed that redeploying to Vercel would fix ProFarmer. It never did. Vercel serverless has a 60s/300s timeout limit. A headless browser scraping 7 ProFarmer sections takes 30+ seconds per section. Vercel serverless is fundamentally the wrong platform for browser scraping.

**V16 lesson:** ProFarmer does NOT run on Vercel. It runs locally as a Python script with system cron, or on GitHub Actions as a scheduled workflow. This is a hard constraint, not a temporary workaround.

---

## Category 5: AI Agent Behavioral Mistakes

### The Specialist Count Error (11, Not 10)

**What happened:** AI agents consistently said "10 specialists" and forgot `trump_effect`. This happened so many times that it became a hard-coded correction in AGENTS.md. The trump_effect specialist (event_study model scoring tariff/trade policy intensity) is the 11th specialist and is especially important in the current trade environment.

**V16 lesson:** Hardcoded in CLAUDE.md. The Big-11: crush, china, fx, fed, tariff, energy, biofuel, palm, volatility, substitutes, trump_effect.

### The Cone/Band/Funnel Language Drift

**What happened:** AI agents kept using "probability cones," "confidence bands," and "funnels" to describe the forecast visualization. The actual visualization is **horizontal Target Zones** — flat price lines at P30/P50/P70 levels, similar to support/resistance on a trading chart. Cones and bands imply a widening shape over time, which is visually and conceptually wrong.

**V16 lesson:** Banned words are hardcoded in CLAUDE.md. Use "Target Zones." Always.

### The Returns vs Price Target Confusion

**What happened:** Early development used `pct_change()` returns as the target variable. This was corrected to `close.shift(-horizon)` — the actual future ZL futures price. But agents kept reverting to returns in conversations and code suggestions. The distinction matters because:
- Core output `predicted_price=48.52` means "ZL will be at 48.52"
- L2/L3 adds "88% chance by July 7th"
- If the target were returns, the output would be a meaningless percentage

**V16 lesson:** Target is ALWAYS the future price level. `target_price_{h}d` columns. Never returns.

### The "While I'm Here" Refactor Disease

**What happened:** AI agents would be asked to fix a small bug and would "improve" surrounding code, rename variables, add type annotations to untouched functions, reorganize imports, or refactor adjacent modules. Each change was individually reasonable but collectively created massive diffs that were hard to review, introduced unexpected regressions, and obscured the actual fix.

**V16 lesson:** Hard rule: Fix what was asked. Touch nothing else. If you see something worth improving, note it but don't do it unless explicitly asked.

### The Crush Specialist Confusion

**What happened:** AI agents confused raw crush features (`board_crush`, `soy_oil_share`, `zl_cl_ratio` from the `analytics.board_crush_1d` table) with the crush specialist's processed signals (`sig_crush_1`, `sig_crush_2`, `sig_crush_conf` from `training.specialist_signals_1d`). These are completely different things:
- Raw features are input data from the market
- Specialist signals are model outputs that consume those inputs

**V16 lesson:** The distinction is architectural. Raw market data lives in `mkt.*`, `econ.*`, `supply.*`. Specialist features are computed in `training.specialist_features_{bucket}`. Specialist signals are the final output in `training.specialist_signals_1d`. Three layers, three purposes.

---

## Category 6: Environment & Configuration Mistakes

### The .env Artifact Hygiene Failure

**What happened:** Diagnostic commands like `vercel env pull` created temporary files (`frontend/.env.vercel.production`, `.env.local.bak`, etc.) that were left in the workspace. Some contained service-role keys. Some were accidentally staged for commit.

**V16 lesson:** `.gitignore` must cover `.env*` patterns from day one. `vercel env pull` writes to `.env.local` only. Any other env artifact is deleted immediately after use.

### The dotenv/config Path Bug

**What happened:** The Prisma config file (`config/prisma.config.ts`) imported `dotenv/config`, which loads `.env` from the current working directory. But the CWD was `config/`, not the repo root. So it looked for `config/.env` instead of `.env`. This caused connection failures that were extremely confusing to debug.

**V16 lesson:** V16 doesn't use Prisma. But the general lesson stands: know exactly where your config loaders look for files, especially when your project has subdirectories with their own package.json.

### External Drive Git Index Staleness

**What happened:** The repo lives on an external Satechi Hub drive. macOS sometimes fails to update the git index properly on external volumes. Files that were clearly modified showed as unchanged in `git status`. The fix required `git update-index --force-remove` + `--add` to force detection.

**V16 lesson:** If git status seems wrong on an external drive, force-refresh the index. Don't assume git is right.

---

## Category 7: The "Build It Before Verifying It" Pattern

### Building Pipelines Before Testing API Access

Multiple data ingestion pipelines were fully built before anyone verified that the API was accessible, the key was valid, or the response format matched expectations. This wasted hours each time.

**V16 rule:** Before building ANY cron route:
1. `curl` the API endpoint manually
2. Verify the response format
3. Verify the API key works
4. Verify the data is what you expect
5. THEN build the route

### Training Models Before Verifying the Matrix

The first training run used a matrix with no specialist signals (the `training.specialist_signals_1d` table was empty). The models trained successfully but on incomplete data. Results were meaningless.

**V16 rule:** Before training:
1. Verify matrix column count matches expectations
2. Verify specialist signals are populated
3. Verify no critical columns are all-NaN
4. Run `--dry-run` first
5. Get explicit user approval

### Deploying Before Checking Dependencies

The ProFarmer fix required specific `serverExternalPackages` entries. Agents would add one entry, deploy, discover the next missing module, add another entry, deploy again. This happened ~15 times across `is-plain-object`, `kind-of`, `fs-extra`, and their entire transitive dependency trees.

**V16 rule:** When adding a Node.js dependency that has native/complex deps, trace the full dependency tree BEFORE deploying. `npm ls <package>` shows the tree.

---

## Category 8: The Accumulation Problem

### Dead Code That Lived Forever

**What happened:** The `gs_quant_lib` directory contained 235 files and ~138,000 lines of code from Goldman Sachs' quantitative library. It had ZERO imports from anywhere in the codebase. It lived in the repo for months because nobody checked whether anything actually used it. When finally deleted, along with other dead code (469 files total), it was the single largest cleanup in legacy baseline history.

**V16 lesson:** V16 starts clean. If a file has no import, it doesn't exist. Dead code is never "kept for reference" — that's what legacy baseline's repo is for.

### Jobs That Existed Because They Already Existed

**What happened:** legacy baseline had 104 Inngest functions. Some existed only because:
- An earlier version of the system needed them
- Someone started building them but never finished wiring the output
- They were duplicates of other jobs with slightly different logic
- They compensated for bugs in other jobs

Nobody audited whether each job was still needed.

**V16 lesson:** Every job must justify its existence by tracing to a user-visible page element. The migration plan's job triage framework (Section 5) requires this. No "just in case" jobs.

### Tables That Nobody Read

**What happened:** `eia_biodiesel_1w` (0 rows), `uco_prices_1w` (0 rows), `quarantined_record`, `ablation_results`, `data_quality_metrics` — all existed in the schema, some with Inngest functions writing to them, but no API route or frontend component ever read them.

**V16 lesson:** The migration plan's schema design (Section 4) includes a "Reader" column for every table. If the Reader column is empty, the table doesn't get created.

---

## The Meta-Lesson

Every mistake in this document shares a root cause: **acting before verifying**.

- Building before testing API access
- Training before verifying the matrix
- Deploying before checking dependencies
- Creating tables before confirming readers exist
- Writing code before reading existing code
- Assuming things work because they used to work

V16's phased execution with evaluation gates exists specifically to prevent this pattern. Each phase has exit criteria that must be verified before the next phase begins. The gates aren't bureaucracy — they're scars from real failures.

**When in doubt: verify first, build second.**
