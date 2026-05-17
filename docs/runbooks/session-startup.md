# Session Startup Runbook

Run this before implementation work.

## 1. Read Authority Docs

Read in order:

1. `AGENTS.md`
2. `docs/INDEX.md`
3. `docs/MASTER_PLAN.md`
4. `docs/plans/2026-03-17-v16-migration-plan.md`
5. `docs/agent-safety-gates.md`
6. Relevant runbook or contract for the task

## 2. Inspect Workspace State

Run:

```bash
git status --short
git branch --show-current
git log --oneline -10
```

Classify existing changes before editing:

- user/source edits to preserve
- generated `quality/` artifacts
- unrelated changes outside the requested scope

## 3. Identify Active Phase

Use the canonical migration plan phase table. Do not advance a phase unless its
documented gate evidence exists and is current.

## 4. Declare Write Scope

Before editing, state which files or directories will be touched. Do not add
unrelated refactors.

## 5. Apply Fail-Closed Completion

Use:

```bash
npm run guard:pre-commit
```

before preparing a commit, and:

```bash
npm run guard:completion
```

before claiming completion.

If any check is `FAIL` or `NOT RUN`, report `STATUS: INCOMPLETE` with blockers.
