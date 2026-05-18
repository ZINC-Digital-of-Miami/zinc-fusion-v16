# ZINC Fusion V16 Master Plan

## Canonical Plan

The canonical build plan remains:

`docs/plans/2026-03-17-v16-migration-plan.md`

This file is the operational router. It does not replace the migration plan.

## Current Completion Rule

Completion is fail-closed:

- Any failed required check means `STATUS: INCOMPLETE`.
- Any required check recorded as `NOT RUN` means `STATUS: INCOMPLETE`.
- A standalone passing sub-gate does not override an incomplete full gate.

## Current Guard State

As of 2026-05-18, the Quality Playbook installation and generated workbook
artifacts are retired from this repository. `scripts/fusion_guard.py` owns the
active fail-closed checks: authority docs, changed-file contracts, runtime
vocabulary scan, lint, build, focused chart regression, fusion-guard unit tests,
and Python contract tests.

## Required Work Loop

1. Read authority docs from `docs/INDEX.md`.
2. Inspect `git status --short`.
3. Identify the active migration phase and gate from the canonical plan.
4. Declare source, docs/contracts, schema, and local-runtime artifact lanes separately.
5. Make the smallest scoped change.
6. Update docs/contracts in the same change when behavior, config, schema, gate,
   or operational truth changes.
7. Run the relevant guard:
   - `npm run guard:pre-commit`
   - `npm run guard:pre-push`
   - `npm run guard:completion`
8. Report `PASS`, `FAIL`, or `NOT RUN` per check. If any check is not `PASS`,
   report `STATUS: INCOMPLETE`.

## Non-Negotiable Boundaries

- Do not train models without explicit user approval.
- Do not run Supabase migrations or `db push` without explicit approval.
- Do not start local Supabase.
- Do not use synthetic, placeholder, demo, or guessed data.
- Do not copy legacy baseline code into V16.
