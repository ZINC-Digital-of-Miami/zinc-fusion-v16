---
name: indicator-review
description: "Math, logic, and signal-value audit for ZINC Fusion V16 indicators. Use when: verifying indicator math is correct, checking whether an indicator actually adds signal for ZL soybean oil forecasting, identifying overtooled or redundant features, auditing chart-side calculations, reviewing specialist feature logic, or assessing GARCH/Monte Carlo parameter choices. Runs pre-flight, per-layer math loop, usefulness/overtooling loop, and commit gate. Never trains models or modifies production data."
model: openrouter/deepseek/deepseek-v4-flash:free
agent: plan
argument-hint: 'Allowed focus: chart-indicators | specialist-features | garch | monte-carlo | overtooling | full-audit'
---

# Indicator Review

Math, logic, and signal-value audit for ZINC Fusion V16 indicators and specialist features.

**When to invoke:** verifying indicator math is correct, checking whether an indicator adds real signal for ZL soybean oil forecasting, identifying overtooled or redundant features, auditing chart-side calculations, reviewing specialist feature logic, or assessing GARCH/Monte Carlo parameter choices.

**Does NOT:** train models, modify production data, or apply changes without explicit approval.

---

Read the full skill file at `.kilo/skills/indicator-review/SKILL.md` and follow it exactly — including all loop structure, Loop 4.5 approval gate, risk-tiered change plan format, commit intent gate, and Hard Rules. Do not skip or abbreviate any loop.

$ARGUMENTS
