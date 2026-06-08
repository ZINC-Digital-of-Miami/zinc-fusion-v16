---
name: session-start
description: "Read-only project orientation for ZINC Fusion V16. Use at session start to produce a briefing with memory status, authority-doc status, current phase, recent git activity, open decisions, risk flags, and one recommended next action. Never edits, creates, or deletes files."
model: openrouter/deepseek/deepseek-v4-flash:free
agent: plan
argument-hint: 'Allowed focus: full-briefing | phase-status | risk-flags | git-activity | decisions'
---

# Session Start

Read-only project orientation for ZINC Fusion V16. Produces a structured status
briefing so work can start immediately without confusion.

## Hard Rules

- DO NOT edit, create, or delete any file.
- DO NOT run any command other than read-only git commands (`git log`, `git status`, `git diff --stat`, `git branch`, `git rev-parse`).
- DO NOT suggest implementation. Output is a briefing, not a plan.
- DO NOT guess. If something is unclear, say so explicitly.
- If memory tooling or a referenced file is unavailable, mark that item `NOT RUN` or `MISSING` with the exact path/tool.

## Orientation Sequence

Run every step in order.

### Step 1 — Memory Status

Search Kilo local recall or the configured memory MCP for decisions relevant to `$ARGUMENTS` and the current repo. If no memory tool is available, report `memory search: NOT RUN`.

### Step 2 — Read Authority Docs

Read in parallel:
- `AGENTS.md` — project hard rules, phase order, skills, and safety constraints
- `docs/INDEX.md` — authority document order
- `docs/MASTER_PLAN.md` — operational truth and completion rule
- `docs/agent-safety-gates.md` — fail-closed verification contract
- `docs/plans/2026-03-17-v16-migration-plan.md` — canonical build plan
- `docs/plans/2026-05-17-dashboard-revised-work-plan.md` when `$ARGUMENTS` touches dashboard, page wiring, AI snapshots, OpenRouter, ProFarmer, or Glide

### Step 3 — Scan Recent Activity

Run read-only:
```
git log --oneline -25
git status --short --branch
git diff --stat HEAD~5 HEAD
git branch -v
```

### Step 4 — Identify Current Execution Phase

Cross-reference `AGENTS.md`, `docs/MASTER_PLAN.md`, and the migration plan phase table with codebase evidence:
- Phase 0: health route exists, Supabase clients configured
- Phase 1: 9 schemas in `supabase/migrations/`, RLS policies present
- Phase 1.5: All 6 pages exist in `app/` and are non-stub
- Phase 2: `ZlCandlestickChart.tsx` wired to real Supabase data
- Phase 4+: pg_cron functions in migrations, Python pipeline files

### Step 5 — Check Open Decision Documents

- Search `docs/decisions/` for checkpoint documents that are not locked or complete.
- Search `docs/plans/` for plan documents modified recently or contradicting the canonical migration plan.

### Step 6 — Check Risk Items

Scan for:
- `TODO`, `FIXME`, `MOCK` comments in `app/`, `components/`, `lib/`, `python/`
- Hardcoded mock data or placeholder values
- `.env` files committed (security check)
- Browser exposure of `service_role`
- Vercel cron, Inngest, or local Supabase references in active implementation paths

## Output Format

```
### ZINC Fusion V16 — Session Briefing

**Date:** [today]
**Branch:** [current branch]
**Memory Search:** PASS / NOT RUN — [tool/path]
**Authority Docs:** PASS / MISSING — [list]
**Working Tree:** [clean / dirty with intentional exclusions]

#### Current Phase
**Active phase:** Phase X — [name]
**Evidence:** [what confirms this]
**Last completed gate:** [gate + evidence path or NOT RUN]
**Next gate:** [what must pass]

#### Recent Activity (last 25 commits)
[5-10 most relevant commits]

#### Open Items
[Open decision docs, in-progress checkpoints]

#### Risk Flags
[TODOs, mock data, security issues — with file:line]

#### Recommended Next Action
[Single most important thing to work on next]
```

$ARGUMENTS
