# Fable Turnover — 2026-06-11

**Project:** ZINC Fusion V16 — soybean oil procurement forecasting system  
**Client:** US Oil Solutions (Las Vegas) — Chris (buyer), Kevin (sales/Vegas Intel)  
**Prepared by:** Claude Sonnet 4.6 session review  
**Corrected 2026-06-11 (Fable 5 verification pass):** the original draft misdiagnosed the outage. Corrections are inline below; the verified root-cause record and forward plan live in `docs/plans/2026-06-11-data-source-pivot-and-stabilization-plan.md`.

## VERIFIED ROOT CAUSE (correction)

The primary reason the site would not load content was **not** stale code or empty vegas tables: **the cloud Supabase project (`iptjkulvyhpddigovssd`) was PAUSED** (free-tier inactivity; last API activity ~2026-06-01), so every data read failed. It was restored 2026-06-11 ~17:05 UTC and the live API immediately returned data. The project will re-pause after ~7 idle days unless the plan is upgraded (CP-1 in the pivot plan). Secondary, real: Vercel auto-deploy dead since 2026-05-26. Refuted: "vegas tables are empty" (see below).

---

## Required Reading Before Touching Code

Read in this order, every session, no exceptions:

1. `AGENTS.md` — hard rules, tech stack, authority hierarchy
2. `docs/INDEX.md` — file authority map
3. `docs/MASTER_PLAN.md` — operational rules, guard state
4. `docs/agent-safety-gates.md` — fail-closed completion contract
5. `docs/plans/2026-03-17-v16-migration-plan.md` — the canonical build plan (AGENTS.md calls it "your bible"; omitted from the original draft in error)
6. `docs/plans/2026-05-17-dashboard-revised-work-plan.md` — active wave plan (architecture decisions D1–D8 are locked)
7. `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md` — Vegas Intel body implementation contract
8. `docs/plans/2026-06-11-data-source-pivot-and-stabilization-plan.md` — current stabilization/pivot plan and open checkpoints

---

## State of the Repository Right Now (2026-06-11)

### Git / Deployment Status

| Item | State |
|------|-------|
| Local branch | `main` |
| Origin/main | In sync (all commits pushed) |
| Vercel production | **STALE — stuck at `2f65de626` (2026-05-26, 16 days old)** |
| Uncommitted changes | 4 working tree files modified, NOT committed |

**The site is running old code.** Three commits pushed to GitHub after the last Vercel build have never been deployed:

```
c7c0b13ef  2026-06-08  Ground Vegas Intel in Glide signals
c600eae70  2026-06-08  fix: ground vegas intel in glide signals
8b6832043  2026-06-02  Add Operator completion-gate lane
```

Vercel's auto-deploy from GitHub is broken or was manually paused. Fix: `vercel deploy --prod` from the project root after committing the pending changes, or restore the GitHub→Vercel webhook.

### Uncommitted Working Tree Changes

These 4 files have local edits that are **NOT committed**:

| File | What Changed |
|------|-------------|
| `lib/vegas/fetchVegasIntel.ts` | Removed `isMissingRelationError` helper; simplified `readCoverageCount` — any failure falls through to the next candidate table silently |
| `lib/vegas/normalizeVegasIntel.ts` | Refactored `serviceChangesPerWeek`: biweekly now resolves before generic weekly; month-based cadences resolve before "once"/word-number checks; extracted `matchWordNumber`/`matchNumeric` helpers; removed `toPhqMultiplier` (unused) |
| `scripts/sync_vegas_glide_to_supabase.py` | Mirrors the TS `serviceChangesPerWeek` logic exactly: same precedence order, same helpers, same month×0.25 formula |
| `scripts/fill_site_with_trusted_data.py` | Fixed oil-count regex: `'^[0-9]'` → `'^[0-9.]+$'` so decimal lbs values are counted |

These are clean logic fixes. Commit them, then deploy.

---

## Why the Site Won't Load Content

### Primary: Vercel is serving 16-day-old code

The current production URL is `https://zinc-fusion-v16.vercel.app`. It's built from commit `2f65de626` which predates the "Ground Vegas Intel in Glide signals" work. Any bugs fixed in the Jun 8 commits are live on GitHub but invisible to users.

### Secondary: Vegas Intel tables have no Glide data

The Vegas Intel page (`app/(protected)/vegas-intel/page.tsx`) fetches from `/api/vegas/intel`. That route calls `fetchVegasData()` which queries:

- `vegas.restaurants` — Glide restaurant rows
- `vegas.casinos` — Glide casino rows
- `vegas.fryers` — Glide fryer telemetry
- `vegas.events` — upcoming events
- `vegas.venues` — venue lookup

**CORRECTION (verified 2026-06-11):** this section was wrong. The core vegas tables (restaurants, casinos, fryers, events, venues) were created by migration `202603180009_ops_vegas.sql` in March; `202605210001` added the five Glide operational tables (export_list, scheduled_reports, shifts, shift_casinos, shift_restaurants) and `202605210002` only grants SELECT. The Glide sync **has run** — last on 2026-05-21 — and the tables are **populated**: 161 restaurants, 31 casinos, 160 fryers, 36 events, 3,176 export rows. Only `vegas.venues` is empty (it has no writer anywhere). The "empty tables" diagnosis was an artifact of querying the paused database. The data is three weeks stale, and rows lack the derived `changes_per_week`/`estimated_oil_lbs_per_week` values from the corrected cadence parser — that is why the sync should be re-run, not for an "initial load."

The Glide sync script is at `scripts/sync_vegas_glide_to_supabase.py`. It currently falls back to the V15 env file at `/Volumes/Satechi Hub/ZINC-FUSION-V15/frontend/.env.production` for the token (fallback scheduled for deletion — Phase 2 of the pivot plan moves the credential into V16). The required variable is **`GLIDE_BEARER_TOKEN`** (the original draft said `GLIDE_TOKEN`, which the script never reads). The Glide App ID is `6262JQJdNjhra79M25e4`. Scheduling is decision CP-4 in the pivot plan.

---

## Immediate Fix Sequence (What To Do First)

These three steps will restore the site to a working, data-filled state.

### Step 1 — Commit the 4 pending files

**CORRECTION:** the guard runs BEFORE the commit, with files staged (hard rule #10; the original draft had it backwards). Note: the guard's contract-sync rule fails any product-code commit that lacks a `docs/` change in the same commit — include the relevant doc updates.

```bash
git add lib/vegas/fetchVegasIntel.ts lib/vegas/normalizeVegasIntel.ts \
        scripts/sync_vegas_glide_to_supabase.py scripts/fill_site_with_trusted_data.py \
        docs/ops/2026-06-11-fable-turnover.md docs/plans/2026-06-11-data-source-pivot-and-stabilization-plan.md
npm run guard:pre-commit   # must report STATUS: PASS
git commit -m "fix: cadence parsing precedence and oil regex"
```

### Step 2 — Deploy to Vercel

```bash
vercel deploy --prod
```

Or push and restore the GitHub→Vercel integration webhook from the Vercel dashboard → Project Settings → Git.

### Step 3 — Run the Glide sync to populate vegas.* tables

```bash
cd /Volumes/Satechi\ Hub/ZINC-FUSION-V16
python scripts/sync_vegas_glide_to_supabase.py
```

Check the output for any errors. Confirm row counts land in Supabase. After the initial manual sync, wire the daily pg_cron (D4 in the dashboard work plan).

---

## Active Work Plan — Where We Are

**Source:** `docs/plans/2026-05-17-dashboard-revised-work-plan.md`  
**Architecture Decisions D1–D8 are LOCKED. Do not reopen them.**

### What's Wired and Working

- Candlestick chart with SMA-200 and Fibonacci overlays
- ProbabilitySurface (30d/90d/180d heat grid) from `forecasts.target_zones`
- RegimeAnalysisChart
- AI Market Intelligence row (model-driven snapshot JSON)
- Market Risk Factors (5 specialist cards)
- 24 Supabase migrations (+2 placeholders; count as of 2026-06-11 — see `supabase/migrations/`), all 9 schemas deployed
- Vegas Intel API route fully built, normalized, and scored

### Vegas Intel Body — Partially Done, Needs Completion

The page renders but is **not at V15 visual parity**. The turnover doc at `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md` is the exact implementation contract. Read it end-to-end before touching the Vegas page.

Current V16 components built:
- `VegasDemandPulse` — hero metric row
- `VegasEventSurge` — upcoming event timeline
- `VegasAiCards` — AI snapshot cards
- `VegasOpportunityGrid` — account opportunity rows
- `VegasCuisineSignals` — cuisine affinity signals
- `VegasCustomerMatrix` — customer bucket matrix
- `VegasOperationalAlerts` — fryer/risk alerts
- `VegasOutreachPanel` — draft intel slide-out
- `VegasSourceHealthFooter` — data freshness footer

What the turnover doc requires that may still be missing from the body:
- V15 segment filter tabs ("ALL / Casinos / Independent")
- Event countdown circles with days-until rings
- Glide field depth: `oil_type`, `service_frequency`, `contact_person`, `total_capacity_lbs`, shift schedule context
- Dense card row layout with Glide inline row data
- Phone breakpoint CSS rules for Vegas layout
- Color token parity (page bg `#0a0a0a` not `#05070b`)

### Dashboard Wave Plan Status

**CORRECTION:** the original table here misnumbered the waves. Per the actual plan (`docs/plans/2026-05-17-dashboard-revised-work-plan.md`): Wave 2 = AI Snapshot Refresh, Wave 3 = ProFarmer, Wave 4 = Data Plumbing, Wave 5 = Vegas Intel body, Wave 5B = Sentiment parity, Waves 6–8 = hardening/features/quality.

| Wave (per plan) | Focus | Status (2026-06-11) |
|------|-------|--------|
| Wave 1 | Firefighting & structural cleanup | In progress |
| Wave 2 | AI Snapshot Refresh | Superseded in part by the 2026-06-11 pivot plan (cards become data-driven, honest provenance) |
| Wave 3 | ProFarmer Playwright scraper | Not started (no scraper exists yet) |
| Wave 4 | Data Plumbing | Reframed by the pivot plan (financialdata.net + FRED + CFTC backbone) |
| Wave 5 / 5B | Vegas Intel body / Sentiment parity | Not blocked on Glide sync (tables populated); needs V15 visual parity work |
| Waves 6–8 | Hardening, features, quality | Not started |

---

## Hard Rules Cheatsheet (Never Violate)

1. **No mock/synthetic/placeholder data — ever.** Empty state until real data flows.
2. **No code copied from V15 baseline.** Every line is written fresh; V15 is visual reference only.
3. **No model training** without explicit user approval from Kirk.
4. **No Supabase `db push` or migrations** without explicit approval.
5. **No Inngest, no Vercel cron.** Scheduling = Supabase pg_cron + http extension.
6. **Vercel is frontend hosting only.** Python data work runs locally or via system schedule.
7. **Build-mode auth is OFF** (`AUTH_DISABLED_FOR_BUILD = true` in `lib/auth-mode.ts`). Do not add auth gates.
8. **Glide is read-only.** No writes to Glide. No browser-side Glide token. Server-side only.
9. **Vegas Intel is daily cadence only.** Max one published refresh per calendar day — not real-time.
10. **Run `npm run guard:pre-commit` before every commit.**

---

## Key File Locations

| What | Path |
|------|------|
| Vegas Intel page | `app/(protected)/vegas-intel/page.tsx` |
| Vegas Intel API route | `app/api/vegas/intel/route.ts` |
| Glide sync script | `scripts/sync_vegas_glide_to_supabase.py` |
| Vegas data fetch | `lib/vegas/fetchVegasIntel.ts` |
| Vegas normalization | `lib/vegas/normalizeVegasIntel.ts` |
| Vegas scoring | `lib/vegas/scoreVegasOpportunities.ts` |
| Vegas narrative (AI) | `lib/vegas/generateVegasNarrative.ts` |
| Vegas AI snapshot | `app/config/vegas-intel-ai.json` |
| Turnover contract | `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md` |
| Dashboard work plan | `docs/plans/2026-05-17-dashboard-revised-work-plan.md` |
| V15 reference (visual only) | `/Volumes/Satechi Hub/ZINC-FUSION-V15/` |
| DuckDB raw store | `data/duckdb/zinc_fusion_raw.duckdb` |

---

## Context: Who This Is For

- **Chris** (owner): buys raw soybean oil by the trainload. ZL going UP = bad for his costs. Strategy language = ACCUMULATE / WAIT.
- **Kevin** (sales): uses Vegas Intel to pitch restaurants and schedule service around events. He needs Glide data (fryer counts, oil type, service cadence, casino relationships) to work a sales territory.

Vegas Intel is Kevin's operational surface. Getting Glide synced and the body at V15 parity is the highest-priority remaining UI work.
