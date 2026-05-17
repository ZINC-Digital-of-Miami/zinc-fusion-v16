---
name: autogluon-model-review
description: "Iterative audit skill for ZINC Fusion V16 AutoGluon training pipeline. Use when: reviewing model config, auditing pipeline scaffold, checking training gate enforcement, verifying specialist/horizon structure, diagnosing AutoGluon gotchas, assessing Phase 5 readiness, or validating python/fusion/. Runs pre-checks, sequential section loop, resolution loop, and commit/push gate. Never trains models or promotes data. For indicator math correctness and overtooling review, use indicator-review skill instead."
model: deepseek/deepseek-v4-pro
agent: plan
argument-hint: 'Allowed focus: training-gate | specialist-horizons | model-config | scaffold-audit | phase-5-readiness | full-audit'
---

# AutoGluon Model Review

Iterative audit of the ZINC Fusion V16 AutoGluon training pipeline (`python/fusion/`).

**When to invoke:** reviewing model config, auditing pipeline scaffold, checking training gate enforcement, verifying specialist/horizon structure, diagnosing AutoGluon gotchas, assessing Phase 5 readiness, or validating `python/fusion/`.

**Does NOT:** train models, promote data to cloud, or modify production Supabase tables.

---

Read the full skill file at `.kilo/skills/autogluon-model-review/SKILL.md` and follow it exactly — including all loop structure, approval gates, commit intent gates, Hard Rules, and project constants. Do not skip or abbreviate any loop.

$ARGUMENTS
