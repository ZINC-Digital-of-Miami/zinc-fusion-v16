---
name: ml-database-audit
description: "Audit or design the ML database contract for ZINC Fusion V16. Use when: reviewing `training`, `forecasts`, or `analytics` schemas; checking writer/reader boundaries; validating Target Zone storage; reviewing quant feature persistence; deciding what stays local versus what is promoted to cloud; or assessing whether ML table design matches the migration plan and phase gates. Runs pre-flight, schema-intent loop, table-contract loop, target/zone loop, persistence-boundary loop, approval gate, and re-audit. Never trains models or promotes data."
argument-hint: 'Allowed focus: training | forecasts | analytics | target-zones | persistence-boundary | full-audit'
---

# ML Database Audit

## What This Skill Does

Structured audit and design workflow for the ML-facing database surface of ZINC Fusion V16. This skill focuses on `training`, `forecasts`, and `analytics` plus their contract with the local compute pipeline.

Runs as loops: pre-flight → schema-intent loop → table-contract loop → target/zone semantics loop → persistence-boundary loop → approval gate → approved fixes only → re-audit.

**This skill never trains models, never fabricates data, and never promotes cloud writes without explicit approval.**

---

## Project Constants

| Constant           | Required Value                           |
| ------------------ | ---------------------------------------- |
| Specialists        | 11 total, including `trump_effect`       |
| Horizons           | `30d`, `90d`, `180d`                     |
| Target naming      | `target_price_{h}d`                      |
| Zone language      | P30 / P50 / P70 horizontal Target Zones  |
| Canonical database | Cloud Supabase                           |
| Wide intermediates | Local parquet unless explicitly approved |

---

## Loop 0 — Pre-Flight

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Read AGENTS.md and migration plan sections on schemas, pipeline, and gates
[ ] Confirm which ML surface is in scope: training / forecasts / analytics / all
[ ] Identify current phase so you do not design beyond the allowed phase gate
[ ] Confirm whether the task is read-only audit or approved implementation
[ ] Note unrelated dirty files before editing
─────────────────────────────────────────────────────────────
```

---

## Loop 1 — Schema Intent Loop

For each in-scope schema:

- [ ] The schema purpose matches the migration plan
- [ ] Tables are not leaking across schema boundaries without reason
- [ ] There is no ad hoc ML schema outside `training`, `forecasts`, `analytics`
- [ ] Each table has a credible reader and writer

---

## Loop 2 — Table Contract Loop

For each in-scope table or planned table:

- [ ] Writer is explicit
- [ ] Reader is explicit
- [ ] Grain is explicit
- [ ] Primary lookup keys are explicit
- [ ] Retention expectations are explicit
- [ ] Index expectations are explicit for serving paths
- [ ] Table is not storing duplicate copies of the same truth for convenience

Any table without both a writer and a reader is a BLOCKER.

---

## Loop 3 — Target / Zone Semantics Loop

- [ ] Targets are future price levels, not returns
- [ ] Horizon columns and row semantics align to `30d`, `90d`, `180d`
- [ ] Published chart zone outputs are P30 / P50 / P70 horizontal levels
- [ ] No cones, bands, funnels, or confidence-interval language leaks into schema or API contracts
- [ ] Forecast-serving tables are shaped for chart consumption rather than local modeling convenience

---

## Loop 4 — Persistence Boundary Loop

- [ ] Local parquet intermediates are not being silently promoted to canonical truth without a gate
- [ ] Large feature matrices and model binaries stay local unless explicitly approved otherwise
- [ ] Compact validated outputs are the only things promoted to cloud tables
- [ ] Live dashboard tables do not become backdoor training truth
- [ ] Quant/feature tables do not retain ephemeral or duplicated feed artifacts just because they were easy to write

---

## Loop 5 — Approval Gate

Produce a change plan before any edit:

```
## Proposed Changes — ML Database

### BLOCKERs to fix:
1. [schema.table] — [problem] — [one-line fix]

### Tables/files to change:
- [path or schema.table] — [why]

### Out of scope:
- [path or schema.table] — [why]

### Risk:
- [LOW / MEDIUM / HIGH]

### Verification:
- [query / file proof / route proof]
```

Do not implement without explicit user approval.

---

## Loop 6 — Approved Fixes Only

Fix only the approved items, then re-run the affected loop section.

---

## Loop 7 — Final Re-Audit

- Re-check schema intent
- Re-check table contracts
- Re-check target and zone semantics
- State residual risk if any ML persistence boundary is still unsettled
