# Dashboard Revised Work Plan — Post-Audit

**Date:** 2026-05-17
**Status:** LOCKED — awaiting approval to execute
**Previous:** [2026-03-17-v16-migration-plan.md](2026-03-17-v16-migration-plan.md)

---

## Audit Findings Summary

### What's Wired and Working
- 6 dashboard sections rendered behind Supabase Auth at `app/(protected)/dashboard/page.tsx`
- Candlestick chart with SMA-200 overlay, Fibonacci pivot lines
- ProbabilitySurface (30d/90d/180d heat grid) from `forecasts.target_zones`
- RegimeAnalysisChart on lightweight-charts
- AI Market Intelligence row (GPT-driven via AI snapshot JSON files)
- Market Risk Factors (5 specialist driver cards)
- 19 Supabase migrations, all 9 schemas deployed
- 13 Python pipeline modules scaffolded

### Critical Gaps
- **Target Zone overlay OFF chart by design** — stays on `ProbabilitySurface` card only
- **GPT (`gpt-5.5-fast`) being replaced** with OpenRouter free model (DeepSeek V4 Flash)
- **ProFarmer Playwright scraper does NOT exist** — trusted-fill data only
- **Glide API keys NOT in V16** — must be extracted from V15 project
- **Previous quality audit findings** have been folded into source fixes; the Quality Playbook install is retired
- **`app/dashboard/page.tsx` is a DUPLICATE** — identical to `app/(protected)/dashboard/page.tsx`, unreachable via URL routing because `(protected)` layout group takes precedence. NOT safe to delete without verifying no import-time side effects. Flagged for approval.

---

## Architecture Decisions (LOCKED)

### D1: Target Zones Stay Off Chart
- No chart prop, chart primitive, or feature flag exists for Target Zones
- Target Zones live only in `ProbabilitySurface` dashboard card
- Regression coverage locks `ZlCandlestickChart` and the protected dashboard page to this decision

### D2: OpenRouter Replaces GPT for AI Cards
- **Primary:** `deepseek/deepseek-v4-flash:free` (128K context, strong financial/analytical prose)
- **Fallback:** `qwen/qwen3-coder-480b-a35b:free`
- API key: Supabase Vault `app.openrouter_api_key`
- Snapshot source label: `openrouter-daily-refresh`
- All 5 AI card snapshot files regenerated with new model
- `strategicSpecialInstructions` packet format preserved exactly

### D3: ProFarmer — Playwright, Hourly 7am–4am ET
- Python Playwright scraper → `alt.profarmer_news`
- Hourly cron during active hours (7am–4am ET daily)
- GitHub Actions fallback for redundancy
- The "slight pause" after login must be preserved

### D4: Vegas Glide — Daily pg_cron + JSON API
- Keys must be extracted from V15 project
- Daily pg_cron job → Glide JSON API → `vegas.*` tables
- Vegas Intel page reads from `vegas.*` tables with AI card fallback for strategy analysis

### D5: Cadence
- Chart data: local DuckDB raw hourly Databento refresh promoted to Supabase `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`
- Non-price ingestion: weekly weekend batch
- AI cards: daily refresh via `fill_site_with_trusted_data.py` (OpenRouter)
- ProFarmer: hourly 7am–4am ET by Python Playwright system schedule with GitHub Actions fallback; not a Vercel cron route

### D6: DuckDB + Supabase Chart Split
- DuckDB owns raw/deep ZL Databento chart recovery and AG training source data at `data/duckdb/zinc_fusion_raw.duckdb`.
- Supabase owns bounded clean chart serving tables, auth, schema, forecasts, analytics, ops, and all non-chart warehouse data.
- Supabase chart storage is limited to `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`.
- The 1h serving cache rolls the daily chart bar; no 1m/15m Supabase chart store is active.
- Frontend chart routes read Supabase only; they never read DuckDB directly.
- The obsolete Supabase-native ZL chart cron writers and any Edge/serverless chart pulls stay disabled unless a new approved migration reverses that decision.

### D7: Duplicate Dashboard Page
- `app/dashboard/page.tsx` is a dead route — `(protected)/layout.tsx` wins URL resolution
- Must NOT delete without explicit approval
- Documented as a "gotcha" in memory

### D8: Vegas/Sentiment Turnover Precision
- `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md` is the exact implementation contract for Vegas Intel and Sentiment body work.
- The turnover scope is body-only. Current V16 `BackendShell`, top nav, and top page headers stay locked unless explicitly reopened.
- The dashboard chart and chart behavior are excluded from this turnover work.
- Vegas Intel is highest priority within the turnover because it carries Kevin's operational sales workflow, Glide depth, event pressure logic, opportunity rows, and draft intel behavior.
- Agents must implement exact body tokens, section order, spacing, card treatment, phone rules, API fields, and behavior logic from the turnover. Approximate visual matches are defects.
- Glide remains read-only and server-side: canonical app ID `6262JQJdNjhra79M25e4`, 8 table groups, no browser token, no public unauthenticated sync route, no Glide writes.

---

## Wave Plan

### WAVE 1: Firefighting & Structural Cleanup (Week 1)

| # | Task | Effort |
|---|------|--------|
| 1.1 | Apply BUG-001 (intraday 1m fallback) patch | 1h |
| 1.2 | Apply BUG-003 (status vocab normalization) patch | 1h |
| 1.3 | Apply BUG-004 (README port rule) patch | 30m |
| 1.4 | Resolve duplicate `app/dashboard/page.tsx` (approval-gated) | 30m |
| 1.5 | Delete unused `components/dashboard/dashboard-shell.tsx` | 15m |
| 1.6 | Audit `DashboardCards.tsx` for vestigial status | 30m |
| 1.7 | Add regression coverage for no Target Zone chart wiring | 15m |

### WAVE 2: AI Model Migration — GPT → OpenRouter (Week 1)

| # | Task | Effort |
|---|------|--------|
| 2.1 | Store OpenRouter API key in Supabase Vault | 30m |
| 2.2 | Build OpenRouter client module | 3h |
| 2.3 | Modify `fill_site_with_trusted_data.py` — swap OpenAI for OpenRouter | 4h |
| 2.4 | Update `lib/server/ai-snapshot.ts` — add `openrouter-daily-refresh` | 15m |
| 2.5 | Regenerate all 5 AI card snapshots, validate | 2h |
| 2.6 | Add model health monitoring | 1h |

### WAVE 3: ProFarmer Playwright Scraper (Week 1–2)

| # | Task | Effort |
|---|------|--------|
| 3.1 | Research ProFarmer login flow, 7 sections | 2h |
| 3.2 | Build `python/fusion/profarmer_scraper.py` | 8h |
| 3.3 | Configure hourly cron 7am–4am ET | 3h |
| 3.4 | Build GitHub Actions fallback | 2h |
| 3.5 | Test full scrape cycle | 4h |

### WAVE 4: Data Plumbing — pg_cron Jobs (Week 2–3)

| # | Task | Effort |
|---|------|--------|
| 4.1 | Verify DuckDB raw ZL refresh and Supabase serving promotion (`price_1h`, `price_1d`, `latest_price`) | 2h |
| 4.2 | Confirm obsolete Supabase-native ZL chart cron jobs are disabled in cloud | 1h |
| 4.3 | Remove active route fallbacks/readers for `mkt.price_15m` and `mkt.price_1m` | 1h |
| 4.4 | Add approved Supabase retention/pruning for bounded `mkt.price_1h`; keep `mkt.price_1d` daily-only and compact | 2h |
| 4.5 | Migrate AG matrix/source planning from local PostgreSQL/cloud reads to DuckDB/local artifacts | 4h |
| 4.6 | FRED core ingestion | 4h |
| 4.7 | Databento futures ingestion (non-chart cross-asset futures, not ZL chart refresh) | 3h |
| 4.8 | CFTC weekly ingestion | 2h |
| 4.9 | FX daily ingestion | 2h |
| 4.10 | Weekly batch jobs (8+ sources) | 8h |

### WAVE 5: Vegas Intel — Turnover-Exact Body + Glide Integration (Week 3)

| # | Task | Effort |
|---|------|--------|
| 5.1 | Read the full 2026-05-18 turnover and map each Vegas body section to V16 files before editing | 1h |
| 5.2 | Re-run the 8-table read-only Glide probe for app ID `6262JQJdNjhra79M25e4` without printing secrets | 2h |
| 5.3 | Design approval-gated raw Glide landing and serving promotion path for restaurants, casinos, fryers, export_list, scheduled_reports, shifts, shift_casinos, and shift_restaurants | 3h |
| 5.4 | Build server-side Glide sync into approved Supabase tables only after migration approval | 6h |
| 5.5 | Expand `/api/vegas/intel` payload with verified oil type, service cadence, contact, casino/property, fryer count, total capacity, event timing, cuisine/event pressure, and provenance fields | 4h |
| 5.6 | Rebuild Vegas body below the locked header: segment cards, event rows, countdown circles, opportunity rows, empty/missing states, and max-width 480px body behavior | 6h |
| 5.7 | Implement deliberate server-side draft Intel workflow only if approved; do not imply the V15 button already had a completed workflow | 4h |
| 5.8 | Verify desktop and phone screenshots against the turnover, plus lint/build/guard | 3h |

### WAVE 5B: Sentiment Body Precision (Week 3)

| # | Task | Effort |
|---|------|--------|
| 5B.1 | Read the full 2026-05-18 turnover and map all seven Sentiment body sections to current V16 files before editing | 1h |
| 5B.2 | Rebuild Sentiment body below the locked header: Fear & Greed, price strip, futures impact, market snapshot, volatility, participants, and headline lanes | 8h |
| 5B.3 | Restore turnover-specified card hierarchy, gauges, bars, badges, section accents, and phone behavior without changing chart code | 4h |
| 5B.4 | Verify desktop and phone screenshots against the turnover, plus lint/build/guard | 3h |

### WAVE 6: Production Hardening (Week 3–4)

| # | Task | Effort |
|---|------|--------|
| 6.1 | Fix API auth — anon key + JWT | 4h |
| 6.2 | Consistent loading/error/empty states | 4h |
| 6.3 | Apply BUG-002 + BUG-006 fixes | 1h |
| 6.4 | Regenerate quality artifacts | 2h |
| 6.5 | Run full safety gate | 1h |

### WAVE 7: Feature Completion (Week 4–5)

| # | Task | Effort |
|---|------|--------|
| 7.1 | 7 Specialist highlight cards | 5d |
| 7.2 | Strategy contract impact calculator | 3d |
| 7.3 | Landing page NeuralSphere refinement | 2d |
| 7.4 | Python pipeline end-to-end | 3d |

### WAVE 8: Quality & Polish (Week 5–6)

| # | Task | Effort |
|---|------|--------|
| 8.1 | API contract test suite | 2d |
| 8.2 | Accessibility audit | 2d |
| 8.3 | E2E Playwright tests | 3d |
| 8.4 | Responsive verification | 1d |
| 8.5 | Storybook | 2d |

---

## Milestones

| Milestone | Criteria | Target |
|-----------|----------|--------|
| **M0: Bugs Closed + Cleanup** | BUG-001/003/004 fixed, duplicate page resolved, cruft deleted | May 19 |
| **M1: OpenRouter Live** | All 5 AI card snapshots regenerated with DeepSeek V4 Flash, cards validate | May 21 |
| **M2: ProFarmer Scraping** | Playwright scraper running hourly, data landing in `alt.profarmer_news` | May 25 |
| **M3: Core Data Fresh** | DuckDB ZL refresh/promote has SUCCESS evidence; Supabase chart serving tables are fresh; FRED core, Databento futures, CFTC, FX all running with SUCCESS status | May 28 |
| **M4: Vegas Glide Live** | `vegas.*` tables populated from Glide JSON API, Vegas Intel page showing real data | Jun 3 |
| **M5: Auth + Guard Clean** | API routes use anon key + JWT, active fusion guard passes, prior audit findings fixed | Jun 8 |
| **M6: Full Feature Set** | 7 specialist cards, contract calculator, NeuralSphere, pipeline run complete | Jun 15 |
| **M7: V16 Dashboard Complete** | All gates pass, all pages operational, zero mock data | Jun 20 |

---

## Gotchas Inventory

1. **Duplicate dashboard page:** `app/dashboard/page.tsx` and `app/(protected)/dashboard/page.tsx` are identical. `(protected)` wins route resolution. Do NOT delete naked `app/dashboard/` without explicit approval — it may have been a deliberate fallback or transition artifact.

2. **API route RLS bypass:** Repaired in source 2026-05-18 for dashboard-facing/authenticated read routes. These routes now use the request-bound Supabase server client (`createClient()`), while `/api/health` remains the public uptime probe.

3. **`/api/zl/forecast-targets` envelope divergence:** Repaired 2026-05-18. The route now returns the canonical `{ ok, data, asOf, source }` envelope, and `ProbabilitySurface` consumes `/api/zl/target-zones`.

4. **`ops.ingest_run.status` vocabulary split:** Repaired in source 2026-05-18. A corrective migration normalizes persisted values to `RUNNING`, `SUCCESS`, `FAILED`, and `TIMEOUT`; cloud deployment still requires explicit `db push` approval.

5. **ZL chart freshness pinned by Databento `206`:** Repaired in source 2026-05-18 by locking the active ZL chart path to local DuckDB raw storage plus Python promotion. Source migration `202605180003_disable_supabase_zl_chart_cron.sql` disables the obsolete Supabase-native ZL chart cron writers once explicitly pushed to cloud. Frontend chart routes continue reading Supabase `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`; they do not read DuckDB directly. Cleanup target: remove all active `mkt.price_15m`/`mkt.price_1m` route dependencies and prevent Edge/serverless chart pulls outside the DuckDB promotion path.

6. **ProFarmer login pause:** The legacy scraper required a specific wait after login before navigation. Must be preserved in the new Playwright implementation.

7. **Satechi Hub may not auto-mount:** V15 project location unknown until manually mounted.

8. **AI card `strategicSpecialInstructions` packets:** Must be preserved exactly in format when migrating from GPT to OpenRouter. These are the "instruction packets" that teach the AI what each card needs.

9. **`DashboardCards.tsx` and `dashboard-shell.tsx`:** Appear vestigial but must audit before deleting.

10. **No `layout.tsx` in naked `app/dashboard/`:** Means it has no auth protection — another reason it was likely superseded by `(protected)`.

11. **Training gate:** NEVER start model training without explicit user approval. `train-readiness --dry-run` currently reports `blocked` (row floor not met).
