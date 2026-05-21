# ZINC-FUSION-V16: Corrected Execution Plan

**Date:** 2026-03-19
**Status:** Ready for checkpoint execution
**Origin:** Architecture corrections session — cloud-only DB, pg_cron+http, zero mock data, rewrite-only

---

## Confirmed Architecture Direction (locked 2026-03-19)

- **Cloud Supabase ONLY** — no local Supabase, no Docker, no local ports
- **pg_cron + http extension** — all data ingestion runs inside Postgres ($0 incremental)
- **Vercel = frontend hosting ONLY** — zero crons, zero ingestion, zero serverless compute for jobs
- **Python intermediates → local parquet files** — only validated outputs promoted to cloud
- **shadcn/ui** — not "Chanui" (doesn't exist)
- **ZERO mock data** — no placeholders, no temps, no synthetic data anywhere, ever
- **ZERO code copying** — every V16 line written fresh, legacy baseline is visual reference only
- **All API keys from legacy baseline** — reuse existing, don't create new
- **Design holdoff** — build clean structure now, aesthetics later
- **ProFarmer** — Python Playwright on local machine, pg_cron coordinates/monitors

---

## Current State Assessment (audited 2026-03-19)

| Phase | Status | Evidence |
|-------|--------|----------|
| 0: Infrastructure | DONE | Health route, Supabase clients, auth pages, shadcn/ui, brand assets |
| 1: Schema | DONE | 11 SQL migrations, all 9 schemas + RLS + indexes + pg_cron |
| Pages | PARTIAL | Landing page has real content. All others are 1-line stubs. |
| Cron routes | DELETED | 25 scaffold routes removed 2026-03-19. vercel.json emptied. |
| Python | SCAFFOLDED | 10 scripts exist at ~250 bytes each (stubs) |
| Data ingestion | NOT STARTED | pg_cron+http functions not yet written |

---

## Checkpoint 1: Verify Cloud Supabase State

Claude must confirm:
- Are all 9 schemas deployed to cloud? (`supabase db push` or verify via direct query)
- Are RLS policies active?
- Are http and pg_cron extensions enabled on cloud?
- Can Python connect and read from cloud?

Decision rule:
- If schemas not deployed → push migrations first
- If extensions not enabled → enable via migration

Required deliverable:
- Verification results logged
- Any missing infrastructure fixed before proceeding

---

## Checkpoint 2: Page Rewrites — All 6 Pages

Rewrite ALL 6 pages from scratch using legacy baseline as VISUAL reference only.

**HARD RULES:**
- ZERO lines copied from legacy baseline
- ZERO mock data — empty state components where data isn't wired yet
- ZERO placeholder numbers, fake prices, sample arrays
- Study legacy baseline visually (screenshots, behavior), then write fresh V16 code
- Each page uses shadcn/ui components + Tailwind CSS
- Each page connects to its read API route (which returns empty arrays until data flows)

**Pages to rewrite:**

| Page | legacy baseline Reference | V16 Approach |
|------|--------------|-------------|
| `/` (Landing) | Already partially done — NeuralSphere, hero, stats | Complete the rewrite. Verify against legacy baseline visual. |
| `/dashboard` | Chart + status bar + cards + drivers + regime | Rewrite chart component (lightweight-charts), status bar, card shells. Empty until data wired. |
| `/strategy` | Posture + calculator + waterfall + risk | Rewrite page structure. Empty cards. Keep content goals, rethink layout. |
| `/legislation` | Feed of regulations + executive actions | Clean rebuild. Feed component with filter UI. Empty until data flows. |
| `/sentiment` | News feed + CoT + narrative | Rewrite first 3-4 rows from legacy baseline's design. Empty until data flows. |
| `/vegas-intel` | Events + restaurants + AI strategy | Stand up the IDEA only. Same API goals (Glide JSON). Layout TBD — don't finalize. |

**Exit criteria:**
- All 6 pages render in browser
- All pages show empty state (not errors, not mock data)
- All pages use shadcn/ui components
- No legacy baseline code exists in V16

---

## Checkpoint 3: Read API Routes — Wire to Supabase

Make all read-only API routes query real Supabase tables (which may be empty).

| Route | Source Table | Returns |
|-------|------------|---------|
| `/api/zl/price-1d` | mkt.price_1d | `{ ok: true, data: [] }` until seeded |
| `/api/zl/price-1h` | mkt.price_1h | Same pattern |
| `/api/zl/intraday` | mkt.price_1h | Same |
| `/api/zl/live` | mkt.latest_price | Same |
| `/api/zl/target-zones` | forecasts.target_zones | Same |
| `/api/zl/forecast` | forecasts.production_1d | Same |
| `/api/dashboard/metrics` | analytics.dashboard_metrics | Same |
| `/api/dashboard/drivers` | analytics.driver_attribution_1d | Same |
| `/api/dashboard/regime` | analytics.regime_state_1d | Same |
| `/api/strategy/posture` | analytics.market_posture | Same |
| `/api/sentiment/overview` | alt.news_events, mkt.cftc_1w | Same |
| `/api/legislation/feed` | alt.legislation_1d, alt.executive_actions | Same |
| `/api/vegas/intel` | vegas.* | Same |
| `/api/health` | ops.source_registry | Already done |

**Exit criteria:**
- Each route queries real Supabase tables via Supabase JS client
- Returns empty arrays (not errors) when tables are empty
- No mock data in any route

---

## Checkpoint 4: Data Ingestion — pg_cron + http Functions

Write plpgsql functions for all ~22 data ingestion jobs. Each function:
1. Uses `http_get()` or `http_post()` to fetch external API
2. Parses JSON response
3. UPSERTs to target table
4. Logs to `ops.ingest_run`
5. API keys from Supabase Vault

Schedule all via pg_cron.

**Priority order (critical data first):**
1. ZL daily OHLCV (Databento) → mkt.price_1d
2. ZL intraday (Databento) → mkt.price_1h
3. FRED (130+ series) → econ.*
4. Databento futures → mkt.futures_1d
5. FX daily → mkt.fx_1d
6. ETF daily → mkt.etf_1d
7. CFTC weekly → mkt.cftc_1w
8. All remaining ingestion jobs

**Exit criteria:**
- Chart shows today's data
- Core market tables updating on schedule
- Freshness monitoring active
- All API keys in Supabase Vault

---

## Checkpoint 5: Python Pipeline

Rebuild all Python scripts to:
- Read raw data from cloud Supabase (psycopg2 pooler, port 6543)
- Write intermediates to local parquet files (data/ directory)
- Promote validated outputs to cloud (psycopg2 direct, port 5432)

New script: `promote_to_cloud.py` (gated — requires explicit approval)

**Exit criteria:**
- Full pipeline runs end-to-end
- Local parquet files created for intermediates
- Validated outputs promoted to cloud
- Target Zones appear on dashboard chart

---

## Checkpoint 6: ProFarmer Playwright Scraper

Rebuild as Python Playwright (not Puppeteer):
- 7 section URLs, staggered schedule
- Login with stealth + keyboard events
- CAPTCHA detection
- System cron triggers locally
- pg_cron monitors freshness in cloud
- GitHub Actions fallback

**Exit criteria:**
- Articles appearing in alt.profarmer_news
- Freshness alerts fire if scraper stops

---

## Checkpoint 7: Dashboard Wiring + Remaining Pages

Wire real data into all pages:
- Chart with real OHLCV + Target Zones + pivots
- Dashboard cards with real metrics
- Strategy with real posture
- Legislation with real feed
- Sentiment with real news + CoT
- Vegas Intel with Glide API data

**Exit criteria:**
- All 6 pages show real data
- legacy baseline/V16 visual parity check passes

---

## Checkpoint 8: Auth + Observability + Cutover

- Supabase Auth for Chris/Kevin
- Protected dashboard routes
- Error tracking
- legacy baseline/V16 parallel run
- Cutover

---

## Checkpoint Invocation Pattern

For each checkpoint, run a read-audit -> decision -> implementation -> verification cycle tied to this plan and record decision evidence in docs/decisions/
