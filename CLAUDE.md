# CLAUDE.md — ZINC-FUSION-V16 Compatibility Stub

This repository is governed by Kilo configuration. `AGENTS.md` is the only project behavior authority.

## Required Reading Order

Before architecture, schema, phase, ML, data-flow, or non-trivial implementation work, read these files in order:

1. `AGENTS.md`
2. `docs/INDEX.md`
3. `docs/MASTER_PLAN.md`
4. `docs/agent-safety-gates.md`
5. `docs/plans/2026-03-17-v16-migration-plan.md`
6. `docs/plans/2026-05-17-dashboard-revised-work-plan.md` when the task touches dashboard, AI snapshots, OpenRouter migration, ProFarmer, Glide, or page wiring

## Kilo Operating Rules

- Use `.kilo/` as the source of truth for commands, rules, skills, workflows, and project Kilo settings.
- Do not install or reference Claude-only plugins as required workflow dependencies.
- Use Kilo local recall or the configured memory MCP for memory search. If neither is available, report `memory search: NOT RUN` instead of inventing persisted memory.
- Use the matching `.kilo/skills/*/SKILL.md` workflow for schema, data, ML, AutoGluon, phase-gate, local/cloud, and indicator audits.
- Follow `docs/agent-safety-gates.md` for completion status. Any failed, skipped, unavailable, warning-only, or aborted required check means `STATUS: INCOMPLETE`.

## Legacy Baseline Rule

The legacy baseline may be used only as a visual or behavioral reference. Never copy code, migrations, env files, Inngest jobs, or implementation details from it into V16.
