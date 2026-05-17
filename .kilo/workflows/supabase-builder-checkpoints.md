# Supabase Builder Checkpoints

## Purpose

Provide a stable checkpoint workflow for Supabase builder work in ZINC Fusion V16.

## Steps

1. Read `AGENTS.md`, `docs/MASTER_PLAN.md`, `docs/agent-safety-gates.md`, `docs/plans/2026-03-17-v16-migration-plan.md`, and any existing repo memory note under `memories/` that directly matches the task. If memory notes are absent, record `memory notes: MISSING` instead of assuming prior decisions.
2. Treat `docs/plans/2026-03-17-v16-migration-plan.md` as canonical. Do not let a checkpoint note become a parallel source of truth.
3. Classify the task: schema build planning, local/cloud sync, schema/RLS, pg_cron/Vault wiring, ML database design, or AutoGluon promotion contract.
4. State the business and product goal this task serves before locking any technical decision.
5. Lock Checkpoint 0: source volatility.
   Decide what source contracts are locked, semi-locked, or still unresolved.
6. Lock Checkpoint 1: canonical source of truth.
   Decide what is cloud canonical, what is local-only, and what is promoted.
7. Lock Checkpoint 2: connection and secret path.
   Decide who reads, who writes, which role is used, and how secrets are sourced.
8. Lock Checkpoint 3: schema ownership and exposure.
   Decide which schema owns the data, whether RLS applies, and whether any view/function exposure needs protection.
9. Lock Checkpoint 4: scheduling and sync.
   Decide whether the task belongs in `pg_cron` + `http`, a read-only route, or a gated promotion path.
10. Lock Checkpoint 5: validation evidence.
    Decide the smallest proof required before the task can be claimed complete.
11. If ambiguity remains after the repository audit, ask sharp questions and present 2-3 bounded options with one recommended path instead of guessing.
12. Update the canonical migration plan with any locked decision or explicitly confirm the existing section already captures it.
13. Only after all checkpoints are clear, implement the approved change and run the matching audit skill again.

## Output Format

1. Task Class
   Name the exact Supabase builder category.
2. Goal Alignment
   State the business and product goal this task supports.
3. Locked Checkpoints
   List Checkpoints 0-5 with the decision for each.
4. Blockers
   List any unresolved ambiguity or approval gate.
5. Open Questions and Options
   List the sharp questions, the bounded options, and the recommended option when something is not yet locked.
6. Canonical Plan Update
   State what was updated in `docs/plans/2026-03-17-v16-migration-plan.md` or what section was confirmed as still authoritative.
7. Next Action
   State the single next build or audit step.
