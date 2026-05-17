---
name: supabase-build-planning
description: "Plan and stage the build-out of ZINC Fusion V16 Supabase schemas when data sources and contracts are still evolving. Use when: building all schemas from scratch, deciding how to model uncertain source inputs, sequencing migrations across the 9 schemas, defining writer/reader boundaries, locking source-agnostic table contracts, or turning open-ended database ideas into a checkpointed build plan. Runs pre-flight, source-volatility loop, schema-ownership loop, table-contract loop, migration-slice loop, approval gate, and implementation handoff. Never invents fake data or treats uncertain inputs as settled fact."
argument-hint: 'Allowed focus: source-inventory | schema-ownership | mkt-econ | training-forecasts | migration-slices | full-plan'
---

# Supabase Build Planning

## What This Skill Does

Structured planning workflow for building ZINC Fusion V16 Supabase schemas and wiring when the data model is only partially locked. The goal is to move the build forward without baking unstable source assumptions into canonical tables.

Runs as loops: pre-flight → source-volatility loop → schema-ownership loop → table-contract loop → migration-slice loop → approval gate → implementation handoff.

**This skill never fabricates data, never treats provisional inputs as final truth, and never runs `db push` without explicit approval.**
**This skill treats `docs/plans/2026-03-17-v16-migration-plan.md` as the canonical plan. Any mini-plan, checkpoint note, or temporary planning artifact must feed back into that plan rather than becoming a competing source of truth.**
**This skill starts with holistic project understanding: business purpose, current phase, product surface, schema ownership, and local/cloud boundaries must be understood before any migration slice is proposed.**

## Guided Sources

Use repo truth first. If a platform or library detail is not reliably answered by repo reality, use the relevant official source and then fold any locked conclusion back into the canonical migration plan if it changes project truth.

- Supabase CLI: https://supabase.com/docs/guides/cli/getting-started
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- Supabase pg_cron: https://supabase.com/docs/guides/database/extensions/pg_cron
- AutoGluon docs: https://auto.gluon.ai/stable/index.html
- AutoGluon Time Series quick start: https://auto.gluon.ai/stable/tutorials/timeseries/forecasting-quick-start.html
- AutoGluon TimeSeriesPredictor API: https://auto.gluon.ai/stable/api/autogluon.timeseries.TimeSeriesPredictor.html

---

## Project Constants

| Contract       | Required Posture                      |
| -------------- | ------------------------------------- |
| Canonical DB   | Cloud Supabase                        |
| Schema count   | 9 canonical schemas only              |
| Ingestion path | `pg_cron` + `http` inside Postgres    |
| Frontend role  | Read-only through Supabase Auth / RLS |
| Python compute | Local compute, cloud canonical data   |
| ML outputs     | Validated compact promotion only      |
| Mock data      | Forbidden                             |

---

## Loop 0 — Pre-Flight

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Read AGENTS.md and the migration plan sections on architecture, schemas, jobs, and phases
[ ] Read .kilo/rules/architecture.md, .kilo/rules/local-cloud-sync.md, and .kilo/rules/source-contract-evolution.md
[ ] Confirm `docs/plans/2026-03-17-v16-migration-plan.md` is the canonical planning surface for this work
[ ] State the business and product goal this schema work serves before proposing any table or migration slice
[ ] Confirm whether this is planning only or approved schema implementation
[ ] Confirm which schema group is in scope: all 9 / specific subset
[ ] Confirm that source contracts are still evolving and note what is already locked
─────────────────────────────────────────────────────────────
```

---

## Loop 1 — Source Volatility Loop

For each in-scope domain, classify inputs as:

- [ ] Locked: source and field contract are stable enough to model now
- [ ] Semi-locked: domain is known but source/fields may still expand
- [ ] Unlocked: source contract is not stable enough for canonical table design yet

For each unlocked item:

- Record the unresolved decision
- State what schema should eventually own it
- State what NOT to freeze yet

If repo truth is insufficient to lock an item:

- consult the most relevant guided source
- summarize the relevant constraint briefly
- return with bounded options rather than a guess

---

## Loop 2 — Schema Ownership Loop

For each in-scope entity or planned table:

- [ ] Choose exactly one of the 9 canonical schemas
- [ ] State why that schema owns it
- [ ] State which other schemas consume it
- [ ] Reject duplicate cross-schema truth unless there is a serving reason

If ownership is unclear, stop and record it as a BLOCKER.

---

## Loop 3 — Table Contract Loop

For each planned table:

- [ ] Table purpose is explicit
- [ ] Writer is explicit
- [ ] Reader is explicit
- [ ] Grain is explicit
- [ ] Primary keys and natural keys are explicit
- [ ] Freshness expectation is explicit
- [ ] RLS expectation is explicit
- [ ] Provenance/source fields are explicit if needed for traceability
- [ ] The contract is vendor-agnostic where the business domain is stable but the source is not

Any table missing writer, reader, or grain is a BLOCKER.

---

## Loop 4 — Migration Slice Loop

Sequence work into safe slices:

1. Schema and extension prerequisites
2. Core canonical tables
3. Constraints and indexes
4. RLS and policies
5. Ops/source registry and observability tables
6. Ingestion functions and schedules
7. Read routes / serving layer wiring
8. ML promotion tables and contracts

For each slice:

- [ ] State which migrations would be created
- [ ] State what remains intentionally deferred
- [ ] State which dependent slices must wait
- [ ] State what must be updated in the canonical migration plan before the slice is considered locked

---

## Loop 5 — Approval Gate

Stop and present this plan before implementation:

```
## Proposed Build Plan — Supabase Database

### Locked decisions:
1. [domain/schema decision]

### Provisional decisions:
1. [domain] — [why provisional] — [safe temporary posture]

### Migration slices:
1. [slice name] — [what it creates]

### BLOCKERs:
1. [entity or table] — [missing contract or ownership problem]

### Files/docs to update:
- [path] — [why]

### Canonical plan integration:
- [exact section or subsection in `docs/plans/2026-03-17-v16-migration-plan.md` that will be updated or explicitly confirmed as still correct]

### Open Questions:
- [sharp question grounded in repo findings]

### Options:
1. [option] — [tradeoff]
2. [option] — [tradeoff]

### Recommended Option:
- [single recommendation and why]

### Validation:
- [query / route / migration evidence]
```

Do not implement until the user explicitly approves the listed plan or a subset of it.

---

## Loop 6 — Implementation Handoff

After approval:

- Hand off slice-by-slice implementation to the matching skill or migration workstream
- Use `.kilo/skills/supabase-schema-audit/SKILL.md` for schema/RLS verification
- Use `.kilo/skills/local-cloud-sync-audit/SKILL.md` for env and connection wiring
- Use `.kilo/skills/ml-database-audit/SKILL.md` and `.kilo/skills/autogluon-database-audit/SKILL.md` for ML-facing slices
- Update the canonical migration plan with any newly locked decision or contract clarification before calling the slice done

Do not collapse all slices into one big unreviewable migration batch.
