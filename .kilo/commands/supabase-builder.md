---
name: supabase-builder
description: "Primary entry command for Supabase Builder work in ZINC Fusion V16. Use when: building out schemas, wiring local/cloud sync, planning migrations while source contracts are still evolving, tightening RLS/Vault/pg_cron discipline, or shaping ML and AutoGluon database contracts."
model: deepseek/deepseek-v4-pro
agent: build
argument-hint: 'Allowed focus: schema-buildout | local-cloud-wiring | training-forecasts | pg-cron-vault | rls-migrations'
---

# Supabase Builder

Read `.github/agents/supabase-builder.agent.md` and follow it as the primary control surface.

Then route by task type:

- If schemas or source contracts are still evolving, read `.kilo/skills/supabase-build-planning/SKILL.md` first.
- If the task is local/cloud env or connection wiring, read `.kilo/skills/local-cloud-sync-audit/SKILL.md`.
- If the task is schema integrity or RLS, read `.kilo/skills/supabase-schema-audit/SKILL.md`.
- If the task is ML-facing schema design, read `.kilo/skills/ml-database-audit/SKILL.md`.
- If the task is AutoGluon persistence/promotion, read `.kilo/skills/autogluon-database-audit/SKILL.md`.

Always use `.kilo/workflows/supabase-builder-checkpoints.md` to lock checkpoints before implementation.

Start with holistic project understanding, then use official Supabase or AutoGluon docs only when repo truth is insufficient, and ask sharp questions with bounded options instead of guessing when contracts are still unresolved.

$ARGUMENTS
