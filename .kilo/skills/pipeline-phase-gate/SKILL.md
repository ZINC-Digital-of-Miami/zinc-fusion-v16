---
name: pipeline-phase-gate
description: "Sequential gate verification skill for ZINC Fusion V16 execution phases. Use when: declaring a phase done, verifying Gates 1-6 have passing evidence, auditing phase hand-off readiness, checking that evaluation criteria are met before starting the next phase. Runs pre-checks, per-gate sequential loop, commit after each gate passes, and a full re-run loop before final sign-off. Never skips gates or phases."
argument-hint: 'Allowed focus: gate-1 | gate-2 | gate-3 | gate-4 | gate-5 | gate-6 | phase-readiness | full-gate-audit'
---

# Pipeline Phase Gate

## What This Skill Does

Systematically verifies that each ZINC Fusion V16 evaluation gate has real, documented, passing evidence before declaring a phase complete. Designed to prevent the most common failure mode: declaring done without proof.

Runs as loops: pre-flight → gate loop (per-gate sequential) → commit artifacts → re-run confirmation.

---

## Gate Map (Canonical)

| Gate        | Phase | What It Guards                                                        | When Verifiable |
| ----------- | ----- | --------------------------------------------------------------------- | --------------- |
| **Gate 1**  | 0     | Supabase cloud connected + psycopg2 reaches DB                        | Now             |
| **Gate 2**  | 1     | Schema integrity: 9 schemas, all tables, PKs, FKs, RLS on every table | After Phase 1   |
| **Gate 3a** | 1     | Security: no service_role key exposed to browser or Vercel            | After Phase 1   |
| **Gate 4**  | 4     | Data flow: ingestion → cloud → API → chart renders with real data     | After Phase 4   |
| **Gate 5**  | 5     | Python pipeline: all 8 phases run to completion, no scaffold returns  | After Phase 5   |
| **Gate 3b** | 9     | Auth enforcement: RLS active + Vault secrets only, no hardcoded keys  | After Phase 9   |
| **Gate 6**  | 10    | Parity: legacy baseline vs V16 chart + data identical                 | Phase 10 final  |

**Phase order is enforced: Phase 0 before Phase 1. Phase 1 before Phase 2. No skipping.**

---

## Loop 0 — Pre-Flight (Run Before Any Gate Check)

STOP if any item fails. Report reason. Do not run gate loop.

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Read CLAUDE.md §Execution Phases — identify current phase
[ ] Read docs/plans/2026-03-17-v16-migration-plan.md §10 (evaluation gates)
[ ] Read docs/decisions/ — find any checkpoint decision for the target phase
[ ] git status — no uncommitted secrets or .env files
[ ] Confirm working branch is NOT main (unless user explicitly approved)
[ ] Identify which gates are in scope for this invocation
─────────────────────────────────────────────────────────────
STOP if any item FAILS. Ask user to resolve before proceeding.
```

---

## Loop 0.5 — Fix Plan + Approval Gate (MANDATORY Before Any Change)

This gate fires whenever a gate check returns FAIL and a fix would be required. **STOP before touching any file, migration, or configuration.**

Produce a written fix plan and present it to the user for explicit approval.

```
FIX PLAN FORMAT
─────────────────────────────────────────────────────────────
## Proposed Fixes — Gate [N]: [Gate Name]

### Failures found ([N] total):
1. [exact check that failed] — [what was found] — [proposed fix]
2. ...

### Files / migrations that will be created or changed:
- [filename or migration name] — [what changes]

### Files that will NOT be touched:
- [filename] — [why out of scope]

### Supabase operations required:
- [supabase db push / supabase migration new / none]

### Estimated risk:
- [LOW / MEDIUM / HIGH — security fixes are always HIGH]

### What re-verification looks like after fix:
- [exact check / command that confirms the fix worked]

─────────────────────────────────────────────────────────────
STOP HERE. Present this plan to the user.
Do NOT proceed until the user explicitly says one of:
  - "yes, proceed"
  - "proceed with item N only"
  - specific approval of the listed changes

Silence is NOT approval. Uncertainty is NOT approval.
A vague "ok" is NOT approval — ask for clarification.
─────────────────────────────────────────────────────────────
```

**If approved in full:** proceed with all listed fixes.
**If approved in part:** proceed only with approved items. Log deferred items in the final report.
**If declined:** emit the gate report with findings only. Mark gate as FAIL — UNRESOLVED.

---

## Loop 1 — Gate Loop (Sequential, One Gate at a Time)

Work through each in-scope gate in order. Do not skip a gate because a later gate looks clean. Each gate depends on prior gates being solid.

For each gate, run its verification checklist → determine PASS / FAIL → if FAIL: go to Loop 0.5 for approval before fixing → after approval + fix: loop back to gate from start → if PASS: commit.

---

### Gate 1 — Supabase Foundation

**Evidence required:**

- [ ] `python/test_connection.py` (or equivalent) runs without error
- [ ] Output shows: connected to cloud Supabase, NOT localhost
- [ ] Supabase project URL matches `.env.local` (or Vercel env)
- [ ] psycopg2 can execute `SELECT 1` against port 6543
- [ ] No local Supabase or Docker workflow is used; do not run local-stack health checks
- [ ] Any local PostgreSQL use is limited to the AG training-source staging database

**Pass criteria:** All checks pass with real output, not mocked.

**Action on PASS:**
→ Document evidence in `docs/verification/gate-1-[date].md`
→ Commit: `git commit -m "verify(gate-1): Supabase cloud connection confirmed"`
→ Push: `git push origin [branch]`

**Action on FAIL:**
→ Log specific failure: which check failed, what error
→ **Go to Loop 0.5 — write a fix plan and get explicit user approval before applying any fix**
→ After approval + fix applied: **loop back to Gate 1 from the start**

---

### Gate 2 — Schema Integrity

**Evidence required:**

- [ ] 9 schemas exist: mkt, econ, alt, supply, training, forecasts, analytics, ops, vegas
- [ ] Table count matches migration plan Section 4 (target: ~80 tables)
- [ ] Every table has a primary key
- [ ] No nullable FK columns that should be NOT NULL
- [ ] RLS is ENABLED on every table (zero exceptions)
- [ ] `supabase db diff --linked` returns no schema drift

**Pass criteria:** All checks pass. Zero RLS gaps. Zero drift.

**Action on PASS:**
→ Document evidence in `docs/verification/gate-2-[date].md`
→ Commit: `git commit -m "verify(gate-2): schema integrity — 9 schemas, RLS enforced, no drift"`
→ Push: `git push origin [branch]`

**Action on FAIL:**
→ Log all missing tables, missing RLS, or drift diffs
→ **Go to Loop 0.5 — write a fix plan (include exact SQL) and get explicit user approval before creating any migration**
→ After approval: create migration, `supabase db push`
→ After migration applied: **loop back to Gate 2 from the start**

---

### Gate 3a — Security (No Exposed Service Role)

**Evidence required:**

- [ ] `grep -r "service_role" app/ components/ lib/` returns zero results
- [ ] `grep -r "SUPABASE_SERVICE_ROLE" app/ components/ lib/` returns zero results
- [ ] Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are browser-accessible
- [ ] `vercel env ls` shows no `SERVICE_ROLE` key with `NEXT_PUBLIC_` prefix
- [ ] No `.env*` files committed (check `.gitignore`)

**Pass criteria:** All grep scans return zero results. Zero service_role exposure.

**Action on PASS:**
→ Document evidence in `docs/verification/gate-3a-[date].md`
→ Commit: `git commit -m "verify(gate-3a): zero service_role exposure confirmed"`
→ Push: `git push origin [branch]`

**Action on FAIL:**
→ STOP — this is a security blocker
→ Name every file and line where service_role is exposed
→ **Go to Loop 0.5 — write a fix plan and get explicit user approval before touching any file** (security fixes are always HIGH risk)
→ Do not commit the exposure — fix first, then commit the fix
→ After approval + fix applied: **loop back to Gate 3a from the start**

---

### Gate 4 — Data Flow (Ingestion → API → Chart)

**Evidence required:**

- [ ] At least one pg_cron job exists in `ops.ingest_run` with a recent successful timestamp
- [ ] `mkt.price_1d` has rows with `trade_date` within the last 5 business days
- [ ] `/api/zl/ohlcv` returns real data (not `[]`, not 500 error)
- [ ] Chart renders in browser with candles (not empty state, not loading spinner)
- [ ] `ops.ingest_run` shows no consecutive failure rows for the same source

**Pass criteria:** Real data in cloud + API returns it + chart renders it.

**Action on PASS:**
→ Document evidence in `docs/verification/gate-4-[date].md` with row counts and screenshot reference
→ Commit: `git commit -m "verify(gate-4): data flow end-to-end — ingestion live, chart renders"`
→ Push: `git push origin [branch]`

**Action on FAIL:**
→ Diagnose at which layer the break is (ingest / schema / API / chart)
→ **Go to Loop 0.5 — write a fix plan naming the exact layer and change, get explicit user approval before modifying anything**
→ After approval + fix applied: **loop back to Gate 4 from the start**

---

### Gate 5 — Python Pipeline Completion

**Evidence required:**

- [ ] All 8 pipeline phases run without error: build_matrix, specialist_features, specialist_signals, train_models (dry-run), generate_forecasts, run_garch, run_monte_carlo, generate_target_zones
- [ ] No phase returns `{"status": "scaffold"}` — all return real output
- [ ] `data/matrix_1d.parquet` exists and has rows
- [ ] `data/target_zones_staging.parquet` exists and has P30/P50/P70 rows
- [ ] `promote_to_cloud.py` exists and validation gate inside it is wired
- [ ] GARCH runs before Monte Carlo (Section B of autogluon-model-review passes)

**Note:** `train_models` can be verified with `--dry-run` only. Full training requires separate `--approve-training` authorization from user.

**Pass criteria:** All 8 phases produce real output. No scaffold placeholders.

**Action on PASS:**
→ Document evidence in `docs/verification/gate-5-[date].md`
→ Commit: `git commit -m "verify(gate-5): Python pipeline end-to-end — all 8 phases real output"`
→ Push: `git push origin [branch]`

**Action on FAIL:**
→ Log exactly which phase(s) failed and what they returned
→ Run the failing phase in isolation to confirm the error (read-only — no writes)
→ **Go to Loop 0.5 — write a fix plan for the failing phase(s), get explicit user approval before editing any pipeline file**
→ After approval + fix applied: **loop back to Gate 5 (just the failing phases) then full run**

---

### Gate 3b — Auth Enforcement (Deferred to Phase 9)

**Precondition:** Only run this gate after Phase 9 work is complete.

**Evidence required:**

- [ ] All dashboard routes redirect unauthenticated users to `/auth/login`
- [ ] RLS policies use `auth.uid()` — not `true` for read policies on sensitive tables
- [ ] No API routes return data without checking `supabase.auth.getUser()`
- [ ] Supabase Vault is used for all API keys — `current_setting('vault.key_name')` pattern
- [ ] No API key values in env vars, hardcoded strings, or Vercel env (only Vault)

**Action on PASS:**
→ Document evidence in `docs/verification/gate-3b-[date].md`
→ Commit: `git commit -m "verify(gate-3b): auth enforcement and Vault wiring confirmed"`
→ Push: `git push origin [branch]`

**Action on FAIL:**
→ Log all unprotected routes and exposed keys
→ **Go to Loop 0.5 — write a fix plan listing each unprotected route and proposed auth change, get explicit user approval before modifying any route or Vault config**
→ After approval + fix applied: **loop back to Gate 3b from the start**

---

### Gate 6 — Parity (Legacy Baseline vs V16)

**Precondition:** Only run after Phase 10 validation work is complete.

**Evidence required:**

- [ ] ZL OHLCV chart renders identically in legacy baseline and V16 (same candles, same date range)
- [ ] Target Zone lines appear at the same price levels in both
- [ ] Landing page visual matches legacy baseline design identity
- [ ] All 6 pages are operational in V16 with real data — no empty states
- [ ] Legacy baseline can be turned off without any V16 data loss

**Action on PASS:**
→ Document evidence in `docs/verification/gate-6-[date].md` with comparison screenshots
→ Commit: `git commit -m "verify(gate-6): V16 parity confirmed — legacy baseline can be retired"`
→ Push: `git push origin [branch]`
→ **Notify user — this is the cutover gate**

**Action on FAIL:**
→ Log specific parity failures (which chart, which page, which discrepancy)
→ **Go to Loop 0.5 — write a fix plan for each parity failure, get explicit user approval before modifying any component or data**
→ After approval + fix applied: **loop back to Gate 6 from the start**

---

## Loop 2 — Commit Loop (After Each Gate PASS)

Every gate that passes gets its own commit. Before committing, confirm the user is aware a commit is about to happen.

```
COMMIT PATTERN (per gate)
─────────────────────────────────────────────────────────────
0. STATE INTENT: "Gate [N] passed. About to commit verification
   evidence as: verify(gate-[N]): [one-line summary]. Proceed?"
   STOP until user confirms.
1. git diff --stat              (confirm only docs/verification/ changed)
   STOP if unexpected files appear — report to user, do not commit.
2. git add docs/verification/gate-[N]-[date].md
3. git commit -m "verify(gate-[N]): [one-line evidence summary]"
4. git push origin [branch]
5. Confirm push succeeded
─────────────────────────────────────────────────────────────
NEVER: git add .
NEVER: git push --force
NEVER: batch two gate passes in one commit
NEVER: commit without stating intent and receiving confirmation first
```

---

## Loop 3 — Re-Run Loop (Full Gate Sequence Before Final Sign-Off)

After all in-scope gates show PASS:

1. Re-read CLAUDE.md Phase table
2. Re-run pre-flight checklist
3. Re-check the highest-risk gate for the current phase (Gate 2 for Phase 1, Gate 4 for Phase 4, etc.)
4. If any re-check fails → return to Loop 1 for that gate only
5. If all clean → emit final report

---

## Final Report Format

```
## Phase Gate Report — [YYYY-MM-DD]
## Phase: [N] | Gates verified: [list]

### Gates Passed (with commit hash)
- Gate [N]: [one-line evidence summary] — [commit hash]

### Gates Deferred (correct — wrong phase)
- Gate [N]: deferred to Phase [N] — expected

### Gates Failed (outstanding)
- Gate [N]: [specific failure] — [fix applied / still open]

### Phase Advancement
- Current phase: [N]
- Next phase: [N+1]
- Blocked by: [nothing / list gates]
- Recommendation: [ADVANCE / HOLD — one sentence reason]
```

---

## Hard Rules

- Never declare a phase complete without committed verification evidence in `docs/verification/`
- Never skip a gate because "it's probably fine"
- Never run Gate 6 before Gates 1-5 are all confirmed
- Gate 3a (security) failure is STOP-EVERYTHING — fix before any other work
- Phase order is enforced: 0 → 1 → 1.5 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
- All commits are small and scoped — one gate per commit
- **Never apply any fix without a written fix plan explicitly approved by the user first**
- **Never fix more than what was approved — no scope creep**
- **Never commit without stating intent and receiving explicit user confirmation**
- **Silence is not approval. Proceed only on explicit "yes, proceed" or equivalent**
