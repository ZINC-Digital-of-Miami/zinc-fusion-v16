---
name: phase-status
description: "Assess the current execution phase of ZINC Fusion V16 by checking for concrete evidence of each phase's completion (Phases 0–5+). Checks health routes, migration files, page stubs, chart wiring, pg_cron functions, and Python pipeline files. Also verifies gate pass evidence and Checkpoint 10 pre-Phase 2 cleanup items. Outputs a phase table with DONE/PARTIAL/IN PROGRESS status and a single next action."
model: deepseek/deepseek-v4-pro
agent: plan
argument-hint: 'Allowed focus: full-status | phase-0 | phase-1 | phase-1.5 | phase-2 | gate-verification | cleanup-readiness'
---

# Phase Status

Assess the current execution phase of ZINC Fusion V16 by checking for concrete
evidence of each phase's completion.

## Required Inputs

Read these before assigning a phase status:

- `AGENTS.md`
- `docs/MASTER_PLAN.md`
- `docs/agent-safety-gates.md`
- `docs/plans/2026-03-17-v16-migration-plan.md`

## Evidence Checks

| Phase | Check for | Files/Paths |
|-------|-----------|-------------|
| 0 | Health route, Supabase clients, auth pages, shadcn/ui | `app/api/health/`, `lib/supabase/` |
| 1 | 9 schemas in migrations, RLS policies | `supabase/migrations/` |
| 1.5 | All 6 pages non-stub | `app/page.tsx`, `app/dashboard/`, `app/sentiment/`, `app/legislation/`, `app/strategy/`, `app/vegas-intel/` |
| 2 | Chart wired to real Supabase data | `components/chart/ZlCandlestickChart.tsx`, `app/api/zl/price-1d/route.ts` |
| 3 | Landing page complete | `app/page.tsx`, `components/landing/` |
| 4 | pg_cron+http functions written | `supabase/migrations/` (look for ingest functions) |
| 5 | Python pipeline produces real output | `python/fusion/*.py` (check for scaffold vs real) |

## Gate Evidence Checks

- `docs/verification/gate-*` files for gate pass evidence
- `scripts/verify/gate*.sh` existence and last run
- `docs/decisions/` checkpoint documents that define cleanup blockers or approvals
- Any required check listed in `docs/agent-safety-gates.md` that is `FAIL`, `NOT RUN`, warning-only, or stale

## Output Format

```
PHASE STATUS — ZINC Fusion V16
Date: [today]

PHASE   | STATUS    | EVIDENCE
0       | DONE      | [evidence]
1       | DONE      | [evidence]
1.5     | PARTIAL   | [what's done, what's missing]
2       | IN PROGRESS | [what's done, what's blocking]
...

GATE VERIFICATION:
  Gate 1: [PASSED date / NOT RUN]
  Gate 2: [PASSED date / NOT RUN]
  ...

OPEN CLEANUP / APPROVAL BLOCKERS:
  [ ] [blocker ID or document path] — [status + evidence]

CURRENT PHASE: Phase [N]
NEXT ACTION: [one sentence]
```

$ARGUMENTS
