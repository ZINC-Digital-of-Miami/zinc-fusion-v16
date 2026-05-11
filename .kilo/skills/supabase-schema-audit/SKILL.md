---
name: supabase-schema-audit
description: "Iterative schema audit skill for ZINC Fusion V16 Supabase cloud database. Use when: checking RLS on all tables, verifying constraint integrity, auditing indexes, reviewing migrations for drift, checking that all 9 schemas exist, or verifying schema before any phase gate. Runs pre-checks, per-schema loop, migration loop for failures, commit after each clean schema, and final re-audit. Never runs destructive SQL."
argument-hint: 'Schema or focus, e.g. "mkt schema" or "RLS audit" or "check indexes" or "all schemas"'
---

# Supabase Schema Audit

## What This Skill Does

Systematic per-schema audit of the ZINC Fusion V16 Supabase cloud database. Checks RLS, primary keys, foreign keys, indexes, naming conventions, and migration drift for each of the 9 canonical schemas.

Runs as loops: pre-flight → per-schema loop → migration fix loop (on failures) → commit migrations → re-audit → final sign-off.

**This skill never runs destructive SQL. All DDL changes go through Supabase CLI migrations.**

---

## The 9 Canonical Schemas (No Others Permitted)

| Schema      | Purpose                                                            |
| ----------- | ------------------------------------------------------------------ |
| `mkt`       | Market data — OHLCV, futures contracts, intraday prices            |
| `econ`      | Economic indicators — FRED series, Fed policy data                 |
| `alt`       | Alternative data — sentiment proxies, tallow/UCO PPI               |
| `supply`    | Supply chain — USDA crush, MPOB palm, biofuel production           |
| `training`  | ML artifacts — OOF predictions, model registry, feature importance |
| `forecasts` | Forecast outputs — target zones, forward forecasts, GARCH output   |
| `analytics` | Aggregated signals — specialist signals, regime classification     |
| `ops`       | Operational — ingest_run logs, job schedules, error tracking       |
| `vegas`     | Vegas Intel — events, customer accounts, sales intel               |

**Any schema outside this list is unauthorized and must be flagged.**

---

## Loop 0 — Pre-Flight (Run Before Any Schema Check)

STOP if any item fails. Report reason. Do not begin schema loop.

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Confirm no local Supabase or Docker command is being used for this audit
[ ] Cloud DB read-only probe succeeds against the Supabase cloud URL (`SELECT current_database(), current_user, now()`)
[ ] `supabase db diff --linked` — run and capture output if project ref is linked (used in Section G)
[ ] git status — no uncommitted migration files in supabase/migrations/
[ ] Confirm working branch is NOT main (unless user approved main-only work)
[ ] Read docs/plans/2026-03-17-v16-migration-plan.md §4 — schema definitions
[ ] Confirm target schema(s) for this invocation (all 9 or specific subset)
─────────────────────────────────────────────────────────────
STOP if the cloud DB probe fails, or if migration drift is in scope and
`supabase db diff --linked` cannot run because the project ref is not linked.
Do not run `supabase status` or `supabase start`; those inspect/start a local
Supabase stack and are banned in this repo.
```

---

## Loop 1 — Per-Schema Loop (Sequential, One Schema at a Time)

Audit each schema in this order: mkt → econ → alt → supply → training → forecasts → analytics → ops → vegas.

For each schema: run all 6 sections (A–F) → log all issues → after schema completes, determine PASS / FAIL → if PASS, commit → advance to next schema.

Do not skip schemas. An issue in `econ` does not block auditing `alt`.

---

### For Each Schema — Section A: Table Existence

- [ ] All tables defined in migration plan §4 for this schema are present
- [ ] No extra tables exist that are not in the migration plan
- [ ] No table is named with weak suffixes: `_v2`, `_new`, `_tmp`, `_old`, `_backup`
- [ ] Schema itself exists (not accidentally under `public`)

**How to check:** `SELECT tablename FROM pg_tables WHERE schemaname = '[schema]' ORDER BY tablename;`

### For Each Schema — Section B: Primary Keys

- [ ] Every table has exactly one primary key
- [ ] PKs use `id uuid DEFAULT gen_random_uuid()` or `id bigint GENERATED ALWAYS AS IDENTITY` — never serial, never integer without identity
- [ ] No composite PKs unless explicitly defined in migration plan (log if found)

**How to check:** Query `information_schema.table_constraints WHERE constraint_type = 'PRIMARY KEY' AND table_schema = '[schema]'`

### For Each Schema — Section C: Foreign Keys

- [ ] All FK columns reference a table that exists
- [ ] FK columns are NOT NULL where the relationship is mandatory
- [ ] FK columns have a corresponding index (FK without index = slow joins)
- [ ] No circular FK dependencies (log if found — may be intentional, needs confirmation)

**How to check:** Query `information_schema.referential_constraints` joined with `key_column_usage`

### For Each Schema — Section D: RLS (Row-Level Security)

**This is the most critical section. Zero exceptions.**

- [ ] RLS is ENABLED on every table in this schema
- [ ] At least one policy exists on every table
- [ ] `authenticated_read` policy: `FOR SELECT TO authenticated USING (true)`
- [ ] `service_role_write` policy: `FOR ALL TO service_role USING (true)`
- [ ] No policy uses `USING (true)` for `authenticated` write access (that would be a security hole)
- [ ] `public` role has NO policies (anonymous access disabled by default)

**Special schemas:**

- `ops` tables: only `service_role` should have any access (no `authenticated_read`)
- `vegas` tables: `authenticated_read` is acceptable for display data

**How to check:** `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = '[schema]'` + `SELECT * FROM pg_policies WHERE schemaname = '[schema]'`

### For Each Schema — Section E: Indexes

- [ ] Every FK column has an index (critical for join performance)
- [ ] `trade_date` / `created_at` / `fetched_at` columns have btree indexes where applicable
- [ ] `mkt.price_1d`: indexes on `(symbol, trade_date)` composite
- [ ] `ops.ingest_run`: index on `(source_key, started_at)` for monitoring queries
- [ ] `forecasts.*`: index on `(horizon_days, generated_at)` for serving queries
- [ ] No duplicate indexes (same columns, same order — log as WARNING)

**How to check:** `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = '[schema]'`

### For Each Schema — Section F: Naming Conventions

- [ ] All table names are `snake_case` plural nouns
- [ ] All column names are `snake_case`
- [ ] Timestamp columns use `_at` suffix (`created_at`, `updated_at`, `fetched_at`)
- [ ] Date-only columns use `_date` suffix (`trade_date`, `event_date`)
- [ ] No columns named `data`, `info`, `stuff`, `misc`, `extra`
- [ ] No ambiguous abbreviations (e.g. `dt` instead of `trade_date`)

---

## Loop 1.5 — Change Plan + Approval Gate (MANDATORY Before Any Migration)

After the per-schema loop completes, **STOP. Do not create any migration file yet.**

Produce a written change plan and present it to the user for explicit approval.

```
CHANGE PLAN FORMAT
─────────────────────────────────────────────────────────────
## Proposed Schema Changes — [YYYY-MM-DD]

### BLOCKERs requiring migration ([N] total):
1. [schema].[table] — [exact problem] — proposed SQL: [one-line]
2. ...

### Migration files that will be created:
- supabase/migrations/[timestamp]_fix-[schema]-[problem].sql
  SQL:
  [exact DDL to be written]

### Schemas/tables that will NOT be touched:
- [schema].[table] — [why out of scope]

### Cloud database operations:
- supabase db push (applies migrations to CLOUD — irreversible without rollback migration)

### Estimated risk:
- [LOW / MEDIUM / HIGH]
  - RLS changes: HIGH (security impact)
  - Index additions: LOW (non-destructive)
  - Schema creation: MEDIUM

### Re-verification after fix:
- [exact query that confirms each fix worked]

─────────────────────────────────────────────────────────────
STOP HERE. Present this plan to the user.
Do NOT create any migration file until the user explicitly says:
  - "yes, proceed"
  - "proceed with items N and M only"
  - specific approval of the listed SQL changes

Silence is NOT approval. Uncertainty is NOT approval.
A vague "ok" is NOT approval — confirm the specific SQL with the user.
─────────────────────────────────────────────────────────────
```

**If approved in full:** proceed to Loop 2 with all listed migrations.
**If approved in part:** proceed with only approved migrations. Log deferred items.
**If declined:** emit the schema audit report with findings only. No migrations created.

---

## Loop 2 — Migration Fix Loop (For Each Approved BLOCKER Only)

Only create and push migrations that were explicitly approved in Loop 1.5.

```
FOR EACH APPROVED BLOCKER:
  1. State the schema, table, column, and exact problem — confirm it matches approval
  2. Write the exact migration SQL (ALTER TABLE, CREATE INDEX, ALTER POLICY, etc.)
  3. Create migration file: `supabase migration new fix-[schema]-[description]`
  4. Show the SQL content to the user before writing it into the file
  5. Write the SQL into the migration file
  6. Run: `supabase db push` — state "About to push to CLOUD Supabase. Confirm?"
     STOP until user confirms the push specifically.
  7. After push: re-run Section D (RLS) or Section B (PKs) for the affected table
  8. If section passes → mark BLOCKER resolved
  9. If section still fails → STOP, report to user — do not loop more than 2× on same issue
  CONTINUE until all APPROVED BLOCKERs resolved
```

Do not create migrations for issues outside the approved change plan. If a new issue is found during fixing, add it to the report — start a new approval cycle.

**Migration SQL patterns for common issues:**

```sql
-- Enable RLS (if missing)
ALTER TABLE [schema].[table] ENABLE ROW LEVEL SECURITY;

-- Add authenticated read policy
CREATE POLICY "authenticated_read" ON [schema].[table]
  FOR SELECT TO authenticated USING (true);

-- Add service_role write policy
CREATE POLICY "service_role_write" ON [schema].[table]
  FOR ALL TO service_role USING (true);

-- Add FK index (if missing)
CREATE INDEX IF NOT EXISTS idx_[table]_[col]
  ON [schema].[table] ([col]);

-- Add composite index
CREATE INDEX IF NOT EXISTS idx_[table]_[col1]_[col2]
  ON [schema].[table] ([col1], [col2]);
```

**NEVER run raw `ALTER TABLE` directly on cloud — always via migration file.**

---

## Loop 3 — Commit Loop (After Each Schema PASS)

Each schema that passes gets its own commit. Before every commit, state intent and wait for confirmation.

```
COMMIT PATTERN (per schema)
─────────────────────────────────────────────────────────────
0. STATE INTENT: "[schema] audit complete. About to commit as:
   fix(schema/[schema]): [one-line description]. Proceed?"
   STOP until user confirms.
1. git diff --stat              (confirm only supabase/migrations/ or docs/verification/ changed)
   STOP if unexpected files appear — report to user, do not commit.
2. git add supabase/migrations/[timestamp]_fix-[schema]-[description].sql
3. git commit -m "fix(schema/[schema]): [one-line description of what was fixed]"
4. git push origin [branch]
5. Confirm push succeeded
─────────────────────────────────────────────────────────────
NEVER: git add .
NEVER: git push --force
NEVER: run supabase db push without per-operation user confirmation
NEVER: write DDL directly in the cloud SQL editor — use migrations
NEVER: commit without stating intent and receiving explicit confirmation
```

If no migrations were needed for a schema (it was already clean), still commit a verification note after user confirms:

```
git add docs/verification/schema-[schema]-[date].md
git commit -m "verify(schema/[schema]): audit clean — RLS, PKs, FKs, indexes all pass"
git push origin [branch]
```

---

## Loop 4 — Drift Check Loop (After All Schemas Pass)

After all 9 schemas pass:

1. Run `supabase db diff --linked` one final time
2. If diff is empty → schema is in sync → proceed to final report
3. If diff is non-empty → review each diff item:
   - If diff matches a committed migration → investigate why it didn't apply
   - If diff is something new → create migration, push, commit
4. After diff is clean → **loop back to Loop 1 for the affected schemas only**

---

## Loop 5 — Final Re-Audit (After Drift Check Clean)

Run a condensed re-audit:

- Re-read migration plan §4
- Re-run Section D (RLS) for all 9 schemas (highest risk)
- Re-run `supabase db diff --linked` for zero-drift confirmation
- If any RLS gap found → return to Loop 2
- If clean → emit final report

---

## Issue Severity Reference

| Severity    | Definition                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| **BLOCKER** | Table missing, RLS disabled on any table, missing PK, FK references missing table, security hole in policy |
| **WARNING** | Missing FK index (performance), ambiguous naming, missing composite index on high-query column             |
| **NOTE**    | Style inconsistency, minor naming deviation, documented acceptable divergence from migration plan          |

---

## Final Report Format

```
## Schema Audit Report — [YYYY-MM-DD]
## Schemas audited: [list] | Migrations applied: [N] | Drift: [clean / N items]

### Schemas Passing Clean
- [schema]: Tables [N], RLS ✓, PKs ✓, Indexes ✓ — commit [hash]

### Schemas With Fixed Issues
- [schema]: [issue fixed] — migration [filename] — commit [hash]

### Outstanding Warnings (non-blocking)
- [schema].[table].[column]: [description] — acceptable / fix next sprint

### Drift Status
- `supabase db diff --linked`: [clean / items listed]

### Gate 2 Status
- RLS enforced on all tables: [yes/no]
- Zero FK constraint gaps: [yes/no]
- All migrations applied without drift: [yes/no]
- Recommendation: [GATE 2 PASS / GATE 2 FAIL — reason]
```

---

## Hard Rules

- Never run destructive SQL: no DROP TABLE, DROP SCHEMA, TRUNCATE, DELETE without explicit user approval
- Never write DDL directly in cloud SQL editor — always use `supabase migration new`
- Never push a migration without showing the SQL to the user first
- Never mark Gate 2 as passed with any RLS gap — even one table without RLS is a FAIL
- Never run `supabase db push` on main without user approval
- Schema names are fixed: mkt, econ, alt, supply, training, forecasts, analytics, ops, vegas — no new schemas
- All migration commits are small and scoped — one schema per commit where possible
- **Never create any migration file without a written change plan explicitly approved by the user first**
- **Never run `supabase db push` without explicit per-push user confirmation — not just plan approval**
- **Never fix more than what was approved in the change plan — no scope creep**
- **Silence is not approval. Proceed only on explicit "yes, proceed" or equivalent**
