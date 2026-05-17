# AGENTS.md — ZINC-FUSION-V16

## What This Project Is

Commodity procurement forecasting system for ZL (soybean oil futures). Clean-room rebuild of legacy baseline on Supabase — **no code transferred, everything written from scratch.**

**Client:** US Oil Solutions (Las Vegas)

- **Chris** (owner) BUYS raw soybean oil by the trainload for 100+ restaurant kitchens (Caesars, Boyd, Resorts World)
- **Kevin** (sales director) uses Vegas Intel to pitch restaurants and schedule service around events
- Chris is a BUYER. ZL going UP = bad for his costs. Strategy language (ACCUMULATE/WAIT) reflects this.

**The migration plan is your bible:** [`docs/plans/2026-03-17-v16-migration-plan.md`](docs/plans/2026-03-17-v16-migration-plan.md) — 1,235 lines, 14 sections, every table/route/job/phase defined.

---

## Tech Stack

| Layer                  | Technology                                              |
| ---------------------- | ------------------------------------------------------- |
| **Database**           | Supabase Postgres — cloud only, no local Supabase       |
| **Schema mgmt**        | Supabase CLI migrations (SQL-first, `db push` to cloud) |
| **Frontend**           | Next.js 14+ on Vercel (frontend hosting ONLY)           |
| **UI System**          | shadcn/ui + Radix primitives + Tailwind CSS             |
| **Data ingestion**     | pg_cron + `http` extension (inside Postgres, $0 cost)   |
| **DB client (TS)**     | Supabase JS client (reads only)                         |
| **DB client (Python)** | psycopg2 to cloud Supabase Postgres; local PostgreSQL only for AG training source |
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
5. **No Inngest. No Vercel Cron.** All scheduling via Supabase pg_cron + `http` extension. Vercel is frontend hosting ONLY.
6. **9 schemas:** mkt, econ, alt, supply, training, forecasts, analytics, ops, vegas. No others.
7. **ProFarmer is mandatory** ($500/month). Rebuilt as Python Playwright scraper, not Node.js Puppeteer.
8. **Training gate:** NEVER start model training without explicit user approval.
9. **Chart is sacred.** REWRITE from scratch using legacy baseline as visual reference — zero modifications to behavior. NEVER copy legacy baseline code.
10. **Landing page is sacred.** REWRITE from scratch using legacy baseline as visual reference — preserve the design identity. NEVER copy legacy baseline code.
11. **ZERO mock data.** No placeholders, no temps, no demo/synthetic/random data anywhere, ever. Empty state until real data flows. This is the HARDEST rule.
12. **ZERO code copying.** Every line of V16 is written fresh. legacy baseline is a visual reference only. Clone-and-clean failed catastrophically — never again.
13. **Cloud Supabase only.** Cloud Supabase is canonical. Supabase CLI is for cloud migrations (`db push`) only. No `supabase status`. No `supabase start`. Local PostgreSQL is permitted only as the AG training-source staging database, never as canonical warehouse or local Supabase replacement.
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

### Process Rules

1. **Read the migration plan before touching code.** It defines every table, route, job, and phase.
2. **Follow the phase order.** Phase 0 before Phase 1. Phase 1 before Phase 2. No skipping.
3. **Run evaluation gates.** Each phase has specific checks. Don't declare done until they pass.
4. **One task at a time.** Finish what was asked before touching anything else.
5. **No "while I'm here" refactors.** Stay scoped.
6. **Memory first.** Search memory at session start, store decisions immediately.
7. **Brainstorm before building.** Use the superpowers brainstorming skill for any non-trivial feature.
8. **Verify before claiming done.** Use the superpowers verification skill.
9. **Checkpoint before implementation.** For non-trivial planning work, audit repo reality first, structure the plan as numbered decision checkpoints, run one Ralph Loop per checkpoint, and update docs after each locked decision.
10. **Fail-closed completion.** Read `docs/INDEX.md`, `docs/MASTER_PLAN.md`, and `docs/agent-safety-gates.md` at startup. If any required check is `FAIL`, `NOT RUN`, warning-only, or aborted, report `STATUS: INCOMPLETE`.
11. **Source and generated artifacts are separate lanes.** Source/config/tooling changes require generated `quality/` artifacts to be regenerated and verified before quality can be claimed current.
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
| **4**   | Data ingestion (pg_cron+http)   | ZL daily, intraday, FRED, futures — all via Supabase pg_cron                                        |
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
Frontend (reads):      Supabase JS client with anon key + JWT
Data ingestion:        pg_cron + http extension (runs inside Postgres — no external connection)
Python (reads):        psycopg2 pooled connection to cloud (port 6543)
Python (training src): local PostgreSQL staging DB for AG training only
Python (promotes):     psycopg2 direct connection to cloud (port 5432) — validated outputs only
Python (intermediates): local parquet files — never written to any database
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

All data ingestion runs inside Postgres as plpgsql functions:

1. pg_cron triggers the function on schedule
2. `http_get()` fetches from external API (synchronous, in-transaction)
3. Parse JSON response in plpgsql
4. UPSERT to target table
5. Log to `ops.ingest_run`
6. API keys from Supabase Vault via `current_setting()`

No Vercel cron routes. No CRON_SECRET. No serverless functions for ingestion.

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
- `ForecastTargetsPrimitive` is a custom series primitive for drawing horizontal Target Zone lines.
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

Before ANY response, code, or analysis:

1. **Memory search** — Query knowledge graph for prior decisions relevant to the current task.
2. **Read the migration plan** — If you haven't read it this session, read it.
3. **Check what phase you're in** — Don't work on Phase 5 stuff if Phase 2 isn't done.
4. **Plan before acting** — Use sequential thinking for multi-step tasks.

```
Memory(search) -> Plan -> Execute -> Memory(store) -> Report
```

Every task follows this sequence. No exceptions.

---

## Definition of Done (V16)

V16 is complete when:

- The chart renders correctly with real ZL data from Supabase
- Target Zones render correctly (P30/P50/P70 horizontal lines)
- The landing page matches legacy baseline's premium design identity (rewritten, not copied)
- All 6 pages are operational with real data
- Only validated routes and jobs exist (no legacy baggage)
- Supabase owns the clean canonical database with RLS enforced — cloud only; local PostgreSQL is AG training-source staging only
- Vercel is frontend hosting ONLY — zero crons, zero ingestion compute
- ~22 pg_cron + http functions keep data fresh inside Supabase ($0 incremental)
- Python pipeline runs end-to-end: reads cloud → local PostgreSQL training source/local files → promotes validated outputs to cloud
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

Your process — every time, no exceptions:

Explore — Read the full codebase. Understand what exists. Map the current state.
Inventory — Document what you found. What entities exist? What relationships? What's missing? What's broken?
Clarify — Only now do you bring questions to me, and they should be sharp, specific questions that show you've already done your homework.
Design — Propose the model. Show the schema, the relationships, the constraints. Explain every decision.
Validate — Stress-test your own design. What breaks? What edge cases exist? What happens at scale?
Implement — Build it right. Migrations, seed data, documentation — the whole thing, not just the pretty diagram.

## ZINC Fusion V16 Ralph Loop Planning Standard

For this repository only, every new or revised plan must follow [`plans/zinc-fusion-v16-ralph-loop-workflow-guide.md`](plans/zinc-fusion-v16-ralph-loop-workflow-guide.md) by default.

Mandatory planning defaults:

1. Audit repository reality before making architecture or refactoring decisions.
2. Write plan documents as numbered checkpoints that capture decisions, not implementation tasks.
3. Run one Ralph Loop per checkpoint and write a decision document for each checkpoint.
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
