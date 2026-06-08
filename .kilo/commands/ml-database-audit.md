---
name: ml-database-audit
description: "Audit or design the ZINC Fusion V16 ML database surface. Use when: reviewing `training`, `forecasts`, or `analytics` contracts, validating Target Zone storage, checking local-vs-cloud ML persistence boundaries, or tightening quant database design."
model: openrouter/deepseek/deepseek-v4-flash:free
agent: plan
argument-hint: 'Allowed focus: training | forecasts | analytics | target-zones | persistence-boundary | full-audit'
---

# ML Database Audit

Read the full skill file at `.kilo/skills/ml-database-audit/SKILL.md` and follow it exactly — including schema-intent loop, table-contract loop, target/zone semantics loop, persistence-boundary loop, approval gate, and re-audit. Do not train models or promote cloud writes implicitly.

$ARGUMENTS
