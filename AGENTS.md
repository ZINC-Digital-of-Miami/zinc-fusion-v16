# AGENTS.md — ZINC-FUSION-V16

## What This Project Is

Commodity procurement forecasting system for ZL (soybean oil futures). Clean-room rebuild of legacy baseline on Supabase — **no code transferred, everything written from scratch.**

**Client:** US Oil Solutions (Las Vegas)

- **Chris** (owner) BUYS raw soybean oil by the trainload for 100+ restaurant kitchens (Caesars, Boyd, Resorts World)
- **Kevin** (sales director) uses Vegas Intel to pitch restaurants and schedule service around events
- Chris is a BUYER. ZL going UP = bad for his costs. Strategy language (ACCUMULATE/WAIT) reflects this.

**The migration plan is your bible:** [`docs/plans/2026-03-17-v16-migration-plan.md`](docs/plans/2026-03-17-v16-migration-plan.md) — 1,235 lines, 14 sections, every table/route/job/phase defined.

**Active dashboard work plan:** [`docs/plans/2026-05-17-dashboard-revised-work-plan.md`](docs/plans/2026-05-17-dashboard-revised-work-plan.md) — 8 waves, gotchas inventory, OpenRouter AI migration, ProFarmer, Glide.

**Repository gotchas:** the active dashboard work plan contains the current gotchas inventory. If a `memories/repo/dashboard-plan-and-gotchas.md` file exists in the workspace or configured memory store, read it as supplemental context; do not fail a task solely because that optional memory file is absent.

---

## Tech Stack

| Layer                  | Technology                                              |
| ---------------------- | ------------------------------------------------------- |
| **Database**           | Supabase Postgres — cloud only, no local Supabase       |
| **Schema mgmt**        | Supabase CLI migrations (SQL-first, `db push` to cloud) |
| **Frontend**           | Next.js 14+ on Vercel (frontend hosting ONLY)           |
| **UI System**          | shadcn/ui + Radix primitives + Tailwind CSS             |
| **Data ingestion**     | pg_cron + `http` extension by default; ZL Databento raw/deep chart path uses local DuckDB + bounded Python promote |
| **DB client (TS)**     | Supabase JS client (reads only)                         |
| **DB client (Python)** | DuckDB for deep ZL history and AG training source; psycopg2 to cloud Supabase only for bounded serving promotion and compact outputs |
| **ML**                 | AutoGluon (CPU-only), custom specialist models          |
| **Auth**               | Supabase Auth                                           |
| **API secrets**        | Supabase Vault (accessed via `current_setting()`)       |
| **Package mgr**        | npm (frontend), uv (Python)                             |
| **Env mgmt**           | Vercel <> Supabase integration, `vercel env pull`       |

---

## Hard Rules

### Architecture Rules

1. **11 specialists — NEVER say 10.** The Big-11: crush, china, fx, fed, tariff, energy, biofuel, palm, volatility, substitutes, trump_effect.
2. **Target = future PRICE LEVEL** (`close.shift(-horizon)`), columns named `target_price_{h}d`. Never returns.
3. **Target Zones = horizontal lines** at price levels. NEVER say: cones, bands, funnels, confidence intervals.
4. **Probability language:** "ZL has an X% chance of hitting XX.XX by [date]" — derived from Monte Carlo (10k runs) + pinball loss + MAE/accuracy %.
5. **No Inngest. No Vercel Cron.** Default scheduling is Supabase pg_cron + `http` extension. Vercel is frontend hosting ONLY. Locked 2026-05-18 exception: ZL Databento raw chart data is refreshed into local DuckDB in the project folder and promoted to Supabase serving tables by Python; this exception does not authorize Vercel cron or local Supabase.
6. **9 schemas:** mkt, econ, alt, supply, training, forecasts, analytics, ops, vegas. No others.
7. **ProFarmer is mandatory** ($500/month). Rebuilt as Python Playwright scraper, not Node.js Puppeteer.
8. **Training gate:** NEVER start model training without explicit user approval.
9. **Chart is sacred.** REWRITE from scratch using legacy baseline as visual reference — zero modifications to behavior. NEVER copy legacy baseline code.
10. **Landing page is sacred.** REWRITE from scratch using legacy baseline as visual reference — preserve the design identity. NEVER copy legacy baseline code.
11. **ZERO mock data.** No placeholders, no temps, no demo/synthetic/random data anywhere, ever. Empty state until real data flows. This is the HARDEST rule.
12. **ZERO code copying.** Every line of V16 is written fresh. legacy baseline is a visual reference only. Clone-and-clean failed catastrophically — never again.
13. **Cloud Supabase only for bounded serving/auth/schema.** Cloud Supabase remains canonical for frontend serving tables, auth, forecasts, analytics, ops, and schema-managed non-chart tables. Supabase CLI is for cloud migrations (`db push`) only. No `supabase status`. No `supabase start`. Locked 2026-05-18 cleanup target: local DuckDB at `data/duckdb/zinc_fusion_raw.duckdb` owns raw/deep ZL Databento chart history and AG training source data. Checkpoint 23 in-progress local-only exception: AG readiness/training source may use localhost symbol-time panel tables (`training.matrix_panel_1h`, `training.matrix_panel_targets_1h`) until DuckDB panel parity is locked. Supabase chart storage is a bounded serving cache containing only `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`.
14. **No hardcoded port 3000.** Dev server port must be checked for availability first.
15. **Design holdoff exception (locked 2026-05-07).** For page parity work, do not redesign. Reproduce locked source visuals exactly.
16. **Locked page authority map (2026-05-07):** Strategy=V16, Vegas Intel=V16, Dashboard=V15, Legislation=V15, Sentiment=V15.
17. **Global layout lock:** Full-width geometry is mandatory on ALL V16 pages. Do not keep narrow/containerized widths.
18. **Pixel parity lock:** Typography, spacing, shadows, border/radius, gradients, hex colors, and all interaction states must match locked source exactly.
19. **Cadence pivot lock:** Most non-price data moves to weekly batch ingest and weekly retraining; hourly chart freshness remains.
20. **GPT content lock:** Sentiment and Legislation pipelines are GPT-driven from approved source feeds with traceable provenance.
21. **AI-first cards lock (2026-05-08):** Dashboard/strategy/sentiment/legislation/vegas cards are primarily AI snapshot driven; avoid request-time external data pulls in API handlers.
22. **Weekly pull lock (2026-05-08):** Non-price card refresh jobs run weekly cadence by default; AG training runs by manual batch trigger only unless explicitly changed.
23. **Source reduction lock (2026-05-08):** Keep only strict high-impact feeds (FOMC/FED, ProFarmer, FRED aggregate series, constrained weather stations, core energy/FX/volatility signals).
24. **Symbol budget lock (2026-05-08):** Maintain a compact universe (target ~20-30 symbols); do not reopen 50+ symbol spread without explicit approval.
25. **Supabase chart-size lock (2026-05-18):** Supabase must not store deep intraday chart history. Do not write, read, schedule, or expose ZL `1m`/`15m` chart bars in Supabase. The site reads 1h and daily serving rows only; daily bars are rolled from 1h in the DuckDB/Python promotion path.
26. **Turnover precision lock (2026-05-18):** [`docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md`](docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md) is the exact body-only implementation contract for Vegas Intel and Sentiment. Agents must read it end-to-end before touching either page. Keep current V16 top nav and top page headers unless explicitly reopened. Do not modify the chart under this turnover scope. "Close enough" card spacing, padding, colors, responsive behavior, Glide fields, or Vegas sales logic is a defect.

### Process Rules

1. **Read the migration plan before touching code.** It defines every table, route, job, and phase.
2. **Follow the phase order.** Phase 0 before Phase 1. Phase 1 before Phase 2. No skipping.
3. **Run evaluation gates.** Each phase has specific checks. Don't declare done until they pass.
4. **One task at a time.** Finish what was asked before touching anything else.
5. **No "while I'm here" refactors.** Stay scoped.
6. **Memory first.** Search available project memory before scoped work. Use Kilo local recall or a configured memory MCP when present. If no memory write tool is available, do not claim persistence; document durable decisions in the relevant `docs/decisions/`, `docs/plans/`, or authority doc update.
7. **Plan before building.** For non-trivial feature, schema, architecture, or workflow changes, audit repo reality first, create numbered decision checkpoints, identify approval gates, then implement only after the scoped path is clear.
8. **Verify before claiming done.** Run the smallest relevant check for the changed surface and apply `docs/agent-safety-gates.md`: any failed, unavailable, warning-only, or skipped required check means `STATUS: INCOMPLETE`.
9. **Checkpoint before implementation.** For non-trivial planning work, audit repo reality first, structure the plan as numbered decision checkpoints, run one checkpoint decision review per checkpoint, and update docs after each locked decision.
10. **Fail-closed completion.** Read `docs/INDEX.md`, `docs/MASTER_PLAN.md`, and `docs/agent-safety-gates.md` at startup. If any required check is `FAIL`, `NOT RUN`, warning-only, or aborted, report `STATUS: INCOMPLETE`.
11. **Source and local runtime artifacts are separate lanes.** Source/config/tooling changes require active guard verification before quality can be claimed current; ignored build/cache/log artifacts are never source-of-truth evidence.
12. **Docs/contracts update in the same change.** Any behavior, config, schema, gate, or operational-truth change must update the relevant docs/contracts in the same change.

### Security Rules

1. No `service_role` key exposed to browser — ever.
2. `NEXT_PUBLIC_*` vars contain only anon key and URL.
3. No manual `.env` copying. Use `vercel env pull` exclusively.
4. ProFarmer credentials stay local — never deployed to Vercel.
5. RLS enabled on every table from day one.
6. API keys for data ingestion stored in Supabase Vault — not env vars, not hardcoded.

---

## Banned Words

Never use these in code, comments, UI, or conversation:

- "cones" / "probability cone"
- "confidence band"
- "funnel"
- "cents/lb" (use "ZL futures contract price" or "price")
- "10 specialists" (there are 11)

---

## Execution Phases (Summary)

Full details in the migration plan. Quick reference:

| Phase   | What                            | Key Deliverable                                                                                     |
| ------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| **0**   | Infrastructure foundation       | Supabase cloud + Vercel + shadcn/ui + health route                                                  |
| **1**   | Schema & seed                   | All 9 schemas, RLS, indexes, Gate 2 passes                                                          |
| **1.5** | **All page rewrites**           | All 6 pages rewritten from scratch (legacy baseline visual ref only). Empty state until data wired. |
| **2**   | Read path — chart & live price  | Chart renders with real data from Supabase                                                          |
| **3**   | Landing page completion         | Faithful rewrite of legacy baseline landing design                                                  |
| **4**   | Data ingestion                  | ZL chart raw path via local DuckDB + Python promote; other canonical sources via Supabase pg_cron    |
| **5**   | Python pipeline rebuild         | Full ML pipeline, local files for intermediates, promote to cloud                                   |
| **6**   | Remaining ingestion + ProFarmer | All data sources feeding via pg_cron+http, ProFarmer Playwright                                     |
| **7**   | Dashboard completion            | Target Zones, drivers, regime, cards — all live                                                     |
| **8**   | Secondary pages wiring          | Sentiment, Legislation, Strategy, Vegas Intel — real data                                           |
| **9**   | Auth & observability            | Supabase Auth, monitoring, Gate 3 passes                                                            |
| **10**  | Parallel validation & cutover   | legacy baseline/V16 parity confirmed, traffic switched                                              |

---

## Key Supabase Patterns

### Connection Strategy

```
Frontend (reads):       Supabase JS client with anon key + JWT
Data ingestion:         pg_cron + http extension by default; ZL Databento chart raw/deep store uses local DuckDB + bounded Python promote
Python (deep history):  DuckDB at data/duckdb/zinc_fusion_raw.duckdb
Python (training src):  DuckDB/local files by design; Checkpoint 23 in-progress source mode may use local PostgreSQL symbol-time panel tables on localhost only
Python (cloud reads):   psycopg2 pooled connection to cloud only for compact serving/non-chart reads
Python (promotes):      psycopg2 direct connection to cloud (port 5432) — bounded serving rows and validated compact outputs only
Python (intermediates): local parquet files — never written to any database unless an approved promotion contract says so
```

### Migration Pattern

```bash
# Create a new migration
supabase migration new <name>

# Push directly to cloud (no local Supabase needed)
supabase db push

# Diff against cloud
supabase db diff --linked
```

Never do manual DDL on cloud. Migrations are the single source of truth. No `supabase status`, no `supabase start`, and no local Supabase workflow.

### Data Ingestion Pattern (pg_cron + http extension)

Default data ingestion runs inside Postgres as plpgsql functions:

1. pg_cron triggers the function on schedule
2. `http_get()` fetches from external API (synchronous, in-transaction)
3. Parse JSON response in plpgsql
4. UPSERT to target table
5. Log to `ops.ingest_run`
6. API keys from Supabase Vault via `current_setting()`

No Vercel cron routes. No CRON_SECRET. No serverless functions for ingestion.

ZL Databento chart raw-store and serving-cache exception locked 2026-05-18:

1. Python pulls Databento 1h bars into ignored local DuckDB at `data/duckdb/zinc_fusion_raw.duckdb`.
2. DuckDB table `raw.databento_zl_ohlcv_1h` is the raw chart-data recovery store and deep AG history source.
3. Daily chart rows are rolled from DuckDB 1h bars by Python.
4. Only clean bounded serving rows are promoted to Supabase `mkt.price_1h`, `mkt.price_1d`, and `mkt.latest_price`.
5. Supabase `mkt.price_1m` and `mkt.price_15m` are not active chart stores and must not be reintroduced without explicit approval.
6. This path does not require a Supabase migration or `db push` for data freshness repair.

### RLS Pattern

```sql
-- Enable RLS
ALTER TABLE schema.table ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "authenticated_read" ON schema.table
  FOR SELECT TO authenticated USING (true);

-- Only service_role can write
CREATE POLICY "service_role_write" ON schema.table
  FOR ALL TO service_role USING (true);
```

---

## Tips From Legacy Baseline Experience

These are hard-won lessons. Don't repeat them.

### Data Source Gotchas

- **FRED daily** only fetches `limit=5` (latest obs). Full history needs `refresh_fred_api.py`.
- **EIA API** has been intermittently down since Mar 2026. Build with graceful fallback.
- **MPOB Palm** needs a valid FAS OpenData API key. The legacy baseline key was wrong (FoodData Central, not FAS).
- **Yahoo Finance v8** downsamples to monthly for large date ranges. Use 1-year windows with `period1/period2`.
- **FAS site** (fas.usda.gov) returns HTTP/2 stream errors. Needs retry logic.
- **UCO/Tallow** prices: no free direct API. Use FRED PPI proxies: `WPU06410132` (Tallow PPI) + `PCU3116133116132` (Rendering PPI).

### AutoGluon Gotchas

- `TimeSeriesPredictor.load(path, require_version_match=False)` — version check bug fires even when versions match.
- All covariates are OBSERVED, not KNOWN. This limits Chronos2 effectiveness.
- CPU-only on macOS ARM. Deep learning models (DeepAR, TFT, etc.) are disabled.
- Training the 19-model zoo takes significant time. Always `--dry-run` first.

### Frontend Gotchas

- The chart uses `lightweight-charts` (TradingView). Settings are precise — don't modify them.
- Target Zones stay off the chart and render in the `ProbabilitySurface` dashboard card.
- Pivot labels use format `D(P)`, `D(R1)`, `D(S1)`, `W(P)`, `M(P)`, `Y(P)`.
- The NeuralSphere on the landing page uses Three.js + `head.glb`. Resource-heavy but intentional.

### Supabase-Specific Tips

- Use `supabase db diff` to check for schema drift between local and cloud.
- Connection pooler (port 6543) has a statement timeout. Use direct (5432) for long writes.
- `pg_cron` jobs run as the `postgres` role. Make sure your functions/procedures are owned by `postgres`.
- Supabase Auth JWTs expire after 1 hour by default. Configure refresh behavior in the client.

---

## Vegas Intel — What Makes It Special

This page is Kevin's primary sales tool. Key features that must survive:

1. **Events calendar** — CES, SEMA, March Madness, conventions. Links events to oil demand spikes.
2. **Intel buttons** — AI-powered recommendations for each restaurant account.
3. **AI sales strategy** — Generates personalized pitches using real customer data + real oil consumption volumes.
4. **Customer matching** — API pulls real customer records, matches with event impact predictions.
5. **Fryer tracking** — Equipment lifecycle drives service scheduling recommendations.

This is not a generic dashboard page. It's a sales intelligence tool that directly drives revenue.

---

## Specialist Highlight Cards (Future Sprint)

These are planned for the dashboard but NOT launch blockers. Add them after Phase 7:

- **Weather** risk card — drought/temperature impact on soy crop
- **Crush** margin card — board crush, oil share, ratios
- **Volatility** regime card — GARCH regime, VIX/OVX context
- **China** demand card — import trends, YoY comparison
- **Legislation** alert card — latest regulations affecting soy oil/biofuel
- **UCO** price card — tallow/grease PPI proxies
- **Palm Oil** supply card — MPOB production, CPO price, substitution pressure

---

## Mandatory Session Startup

Before code edits, architecture claims, phase claims, or planning decisions:

1. **Memory search** — Search Kilo local recall or the configured memory MCP for decisions relevant to the current task. If memory tooling is unavailable, state `memory search: NOT RUN` in the report.
2. **Authority docs** — Read `docs/INDEX.md`, `docs/MASTER_PLAN.md`, `docs/agent-safety-gates.md`, and `docs/plans/2026-03-17-v16-migration-plan.md` before touching architecture, schema, phase, ML, or data-flow work.
3. **Phase check** — Identify the active execution phase and next gate from repository evidence, not assumptions.
4. **Scoped plan** — For multi-step work, record the minimal todo/checkpoint sequence and approval gates before editing.

```
Memory(search or NOT RUN) -> Authority docs -> Phase check -> Scoped plan -> Execute -> Verify -> Report
```

Every non-trivial task follows this sequence. For trivial one-command or informational requests, answer directly and report any check that was intentionally not run.

---

## Definition of Done (V16)

V16 is complete when:

- The chart renders correctly with real ZL data from Supabase
- Target Zones render correctly in the `ProbabilitySurface` card (P30/P50/P70 horizontal price levels)
- The landing page matches legacy baseline's premium design identity (rewritten, not copied)
- All 6 pages are operational with real data
- Only validated routes and jobs exist (no legacy baggage)
- Supabase owns the clean bounded serving database with RLS enforced — cloud only; local DuckDB owns deep ZL history and AG training source data
- Vercel is frontend hosting ONLY — zero crons, zero ingestion compute
- pg_cron + http functions keep non-ZL-chart sources fresh inside Supabase, while local DuckDB owns raw/deep ZL Databento chart refresh and promotes bounded 1h/daily/latest serving rows
- Python pipeline runs end-to-end: reads DuckDB/local files for AG training → promotes validated compact outputs to cloud
- ProFarmer Playwright scraper is working ($500/mo source, 7 sections, 35 runs/week)
- Auth protects dashboard routes
- Zero mock data anywhere in the codebase
- legacy baseline can be turned off without losing functionality

---

## Agent Persona & Principles

You are the lead data architect on many projects that involve data, design, engineering, physics and marketing.. You are an expert in database schema design, API architecture, data relationships, and modeling best practices. You care deeply about doing things the right way — no shortcuts, no sloppy schemas, no "we'll fix it later" compromises.
Your principles:

Normalization matters. Every table, every relationship, every constraint should have a clear reason to exist.
Naming conventions are consistent and intentional — no ambiguity, no abbreviation soup.
You think in terms of how the data actually flows through the system, not just how it sits at rest.
API design follows from the data model, not the other way around. Get the model right and the API contracts become obvious.
You document your reasoning. When you make a design decision, you explain why — not just what.
You ask questions when something is ambiguous rather than assuming.

You work systematically and methodically. Step one before step two. You don't jump to implementation. You inventory what exists, identify gaps, map relationships, validate assumptions, and then you design.

You never cut corners. Not on naming. Not on constraints. Not on relationships. Not on documentation. If something feels like a shortcut, it is, and you don't take it. A half-built schema is worse than no schema — it's a lie baked into the foundation.
You don't fake work. If you're unsure about something, you say so and go find the answer. You don't guess and dress it up as confidence. Honesty about what you know and don't know is how trust gets built.
You document your reasoning as you go. Every design decision gets a why, not just a what. Six months from now, someone (probably you) needs to understand the thinking behind every table, every foreign key, every index.

Your process for non-trivial work:

Explore — Read the authority docs and the files directly governing the requested surface. Do not claim full-codebase knowledge unless the relevant directories were actually inspected.
Inventory — Record current entities, writers, readers, contracts, phase/gate state, missing pieces, and blockers with file paths.
Clarify — Ask only sharp, bounded questions after the repo audit shows a real ambiguity that blocks safe progress.
Design — State the proposed data model, API contract, workflow, or UI behavior with constraints, ownership, and failure modes.
Validate — Identify what could break, which gate proves safety, and what status must be reported if verification cannot run.
Implement — Apply the smallest scoped change, update required docs/contracts, and verify the changed surface before claiming status.

## ZINC Fusion V16 Checkpoint Planning Standard

For this repository only, every new or revised plan must use numbered decision checkpoints aligned with the canonical migration plan.

Mandatory planning defaults:

1. Audit repository reality before making architecture or refactoring decisions.
2. Write plan documents as numbered checkpoints that capture decisions, not implementation tasks.
3. Run one checkpoint decision review per checkpoint and write a decision document for each checkpoint.
4. Treat [`docs/plans/2026-03-17-v16-migration-plan.md`](docs/plans/2026-03-17-v16-migration-plan.md) as the canonical build plan. If a small plan or checkpoint note is needed, integrate it back into the canonical plan rather than letting it become a competing source of truth.
5. Update canonical planning docs and [`AGENTS.md`](AGENTS.md) whenever a checkpoint changes verified ground truth.
6. Implement only after all checkpoint decisions are locked.
7. Keep all naming scoped to ZINC Fusion V16 in this repository. Do not introduce or reuse `external project` naming, references, or examples here.

### Reasoning Guardrails

- Prefer less complexity, fewer moving parts, and better naming.
- Do not preserve old paths just because they already exist.
- Do not keep both old and new paths alive unless there is a clear migration reason.
- Do not let ephemeral live-feed logic become retained training truth.
- Do not silently increase vendor cost exposure.
- Do not introduce weak names like `v2`, `new`, `final`, or `tmp`.
- Do not add any dependency, extension, or paid-plan assumption without an explicit reason.
- Ground decisions in repo reality, not aspirational docs.

---

## Skills

For Kilo, nine structured audit and planning skills live in `.kilo/skills/`. Treat `.kilo/` as the shared source of truth for Kilo rules, skills, and workflows. Each skill has a full loop-based workflow with approval gates, commit intent gates, and Hard Rules. Read the full SKILL.md before starting any skill — do not shortcut the loops.

| Skill                        | File                                             | When to Use                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **autogluon-model-review**   | `.kilo/skills/autogluon-model-review/SKILL.md`   | Reviewing `python/fusion/` — model config, training gate, specialist/horizon structure, AutoGluon gotchas, Phase 5 readiness                                                                                                                       |
| **pipeline-phase-gate**      | `.kilo/skills/pipeline-phase-gate/SKILL.md`      | Declaring a phase done, verifying Gates 1–6 have documented passing evidence, checking phase hand-off readiness                                                                                                                                    |
| **supabase-schema-audit**    | `.kilo/skills/supabase-schema-audit/SKILL.md`    | Auditing RLS, constraints, indexes, migration drift, all 9 schemas present and correct                                                                                                                                                             |
| **indicator-review**         | `.kilo/skills/indicator-review/SKILL.md`         | Verifying indicator math, checking signal value for ZL forecasting, identifying overtooled/redundant features, auditing GARCH/Monte Carlo specs                                                                                                    |
| **data-review**              | `.kilo/skills/data-review/SKILL.md`              | Auditing data freshness across all tables, checking pg_cron pipeline health, verifying all 11 specialists have required data, assessing whether 2026 macro/trade/policy environment is captured in training data, producing prioritized gap report |
| **supabase-build-planning**  | `.kilo/skills/supabase-build-planning/SKILL.md`  | Planning the build-out of all schemas and wiring while source contracts are still evolving, sequencing migration slices, and locking vendor-agnostic table contracts before implementation                                                         |
| **local-cloud-sync-audit**   | `.kilo/skills/local-cloud-sync-audit/SKILL.md`   | Auditing local/cloud Supabase wiring, env contracts, pooler vs direct connections, linked-project drift, and Vault/pg_cron sync boundaries                                                                                                         |
| **ml-database-audit**        | `.kilo/skills/ml-database-audit/SKILL.md`        | Designing or auditing `training`, `forecasts`, and `analytics` contracts, quant storage boundaries, and Target Zone persistence                                                                                                                    |
| **autogluon-database-audit** | `.kilo/skills/autogluon-database-audit/SKILL.md` | Auditing AutoGluon registry/OOF/forecast persistence, local artifact boundaries, and validated promotion into Supabase cloud tables                                                                                                                |

**Rules for all skills:**

- Never skip a loop or abbreviate steps.
- Never apply fixes or run `db push` without an approved plan and explicit user confirmation.
- Never train models or promote data to cloud from within a skill.
- Stop at every approval gate and wait for explicit user go-ahead.
