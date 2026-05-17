---
name: supabase-schema-audit
description: "Iterative schema audit skill for ZINC Fusion V16 Supabase cloud database. Use when: checking RLS on all tables, verifying constraint integrity, auditing indexes, reviewing migrations for drift, checking that all 9 schemas exist, or verifying schema before any phase gate. Runs pre-checks, per-schema loop, migration loop for failures, commit after each clean schema, and final re-audit. Never runs destructive SQL."
model: deepseek/deepseek-v4-pro
agent: plan
argument-hint: 'Allowed focus: mkt | econ | alt | supply | training | forecasts | analytics | ops | vegas | rls | constraints | indexes | full-audit'
---

# Supabase Schema Audit

Per-schema audit of the ZINC Fusion V16 Supabase cloud database.

**When to invoke:** checking RLS on all tables, verifying constraint integrity, auditing indexes, reviewing migrations for drift, checking that all 9 schemas exist, or verifying schema before any phase gate.

**Does NOT:** run destructive SQL. All DDL changes must go through Supabase CLI migrations. Requires double-confirmation before any `db push`.

---

Read the full skill file at `.kilo/skills/supabase-schema-audit/SKILL.md` and follow it exactly — including all loop structure, per-schema loop, migration loop for failures, commit after each clean schema, final re-audit, and Hard Rules. Do not skip or abbreviate any loop.

$ARGUMENTS
