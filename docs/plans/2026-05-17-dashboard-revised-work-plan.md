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
- Chart data: daily/hourly (ZL price_1d, price_1h)
- Non-price ingestion: weekly weekend batch
- AI cards: daily refresh via `fill_site_with_trusted_data.py` (OpenRouter)
- ProFarmer: hourly 7am–4am ET (only active hourly edge cron)

### D6: Duplicate Dashboard Page
- `app/dashboard/page.tsx` is a dead route — `(protected)/layout.tsx` wins URL resolution
- Must NOT delete without explicit approval
- Documented as a "gotcha" in memory

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
| 4.1 | FRED core ingestion | 4h |
| 4.2 | Databento futures ingestion | 3h |
| 4.3 | CFTC weekly ingestion | 2h |
| 4.4 | FX daily ingestion | 2h |
| 4.5 | Verify ZL daily ingestion | 1h |
| 4.6 | Weekly batch jobs (8+ sources) | 8h |

### WAVE 5: Vegas Intel — Glide Integration (Week 3)

| # | Task | Effort |
|---|------|--------|
| 5.1 | Locate V15 Glide API keys | 2h |
| 5.2 | Build Glide → Supabase sync pg_cron function | 6h |
| 5.3 | Wire Vegas Intel page to `vegas.*` tables | 4h |
| 5.4 | Build customer scoring | 3h |

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
| **M3: Core Data Fresh** | FRED core, Databento futures, CFTC, FX all running with SUCCESS status | May 28 |
| **M4: Vegas Glide Live** | `vegas.*` tables populated from Glide JSON API, Vegas Intel page showing real data | Jun 3 |
| **M5: Auth + Guard Clean** | API routes use anon key + JWT, active fusion guard passes, prior audit findings fixed | Jun 8 |
| **M6: Full Feature Set** | 7 specialist cards, contract calculator, NeuralSphere, pipeline run complete | Jun 15 |
| **M7: V16 Dashboard Complete** | All gates pass, all pages operational, zero mock data | Jun 20 |

---

## Gotchas Inventory

1. **Duplicate dashboard page:** `app/dashboard/page.tsx` and `app/(protected)/dashboard/page.tsx` are identical. `(protected)` wins route resolution. Do NOT delete naked `app/dashboard/` without explicit approval — it may have been a deliberate fallback or transition artifact.

2. **All API routes use `createSupabaseAdminClient()`:** Service role everywhere, bypassing RLS. Must migrate to anon key + JWT pattern per Migration Plan §7.

3. **`/api/zl/forecast-targets` envelope divergence:** Repaired 2026-05-18. The route now returns the canonical `{ ok, data, asOf, source }` envelope, and `ProbabilitySurface` consumes `/api/zl/target-zones`.

4. **`ops.ingest_run.status` vocabulary split:** Repaired in source 2026-05-18. A corrective migration normalizes persisted values to `RUNNING`, `SUCCESS`, `FAILED`, and `TIMEOUT`; cloud deployment still requires explicit `db push` approval.

5. **ZL chart freshness pinned by Databento `206`:** Repaired in source 2026-05-18 with a dual path: local DuckDB keeps raw ZL Databento hourly history for AG/training recovery, and Supabase cron ingest now explicitly accepts Databento HTTP `200` and `206` payloads for live chart-serving tables. Frontend chart routes continue reading Supabase `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`.

6. **ProFarmer login pause:** The legacy scraper required a specific wait after login before navigation. Must be preserved in the new Playwright implementation.

7. **Satechi Hub may not auto-mount:** V15 project location unknown until manually mounted.

8. **AI card `strategicSpecialInstructions` packets:** Must be preserved exactly in format when migrating from GPT to OpenRouter. These are the "instruction packets" that teach the AI what each card needs.

9. **`DashboardCards.tsx` and `dashboard-shell.tsx`:** Appear vestigial but must audit before deleting.

10. **No `layout.tsx` in naked `app/dashboard/`:** Means it has no auth protection — another reason it was likely superseded by `(protected)`.

11. **Training gate:** NEVER start model training without explicit user approval. `train-readiness --dry-run` currently reports `blocked` (row floor not met).
