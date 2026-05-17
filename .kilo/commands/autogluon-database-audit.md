---
name: autogluon-database-audit
description: "Audit the database-facing contract of the AutoGluon pipeline in ZINC Fusion V16. Use when: checking registry/OOF/forecast persistence, validating promotion gates, or tightening AutoGluon-to-Supabase database boundaries."
model: deepseek/deepseek-v4-pro
agent: plan
argument-hint: 'Allowed focus: registry | oof-outputs | forecast-persistence | promotion-gate | artifact-boundary | full-audit'
---

# AutoGluon Database Audit

Read the full skill file at `.kilo/skills/autogluon-database-audit/SKILL.md` and follow it exactly — including contract loop, artifact-boundary loop, promotion gate loop, approval gate, and re-audit. Do not start training.

$ARGUMENTS
