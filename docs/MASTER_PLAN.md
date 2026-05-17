# ZINC Fusion V16 Master Plan

## Canonical Plan

The canonical build plan remains:

`docs/plans/2026-03-17-v16-migration-plan.md`

This file is the operational router. It does not replace the migration plan.

## Current Completion Rule

Completion is fail-closed:

- Any failed required check means `STATUS: INCOMPLETE`.
- Any required check recorded as `NOT RUN` means `STATUS: INCOMPLETE`.
- Any aborted generated-quality finalizer means `STATUS: INCOMPLETE`.
- Any warning in a required quality gate means `STATUS: INCOMPLETE`.
- A standalone passing sub-gate does not override an incomplete full gate.

## Current Quality State

As of 2026-05-16, Quality Playbook artifacts exist and phases 1-6 were run.
The run must still be treated as incomplete until the full completion guard
passes with build, tests, quality gate, mechanical verification, source edit
state, and generated artifact freshness all clean in the same run.

## Required Work Loop

1. Read authority docs from `docs/INDEX.md`.
2. Inspect `git status --short`.
3. Identify the active migration phase and gate from the canonical plan.
4. Declare source lane and generated-artifact lane separately.
5. Make the smallest scoped change.
6. Update docs/contracts in the same change when behavior, config, schema, gate,
   or operational truth changes.
7. Regenerate quality artifacts after source/config/tooling changes that affect
   quality evidence.
8. Run the relevant guard:
   - `npm run guard:pre-commit`
   - `npm run guard:pre-push`
   - `npm run guard:completion`
9. Report `PASS`, `FAIL`, or `NOT RUN` per check. If any check is not `PASS`,
   report `STATUS: INCOMPLETE`.

## Non-Negotiable Boundaries

- Do not train models without explicit user approval.
- Do not run Supabase migrations or `db push` without explicit approval.
- Do not start local Supabase.
- Do not use synthetic, placeholder, demo, or guessed data.
- Do not copy legacy baseline code into V16.
