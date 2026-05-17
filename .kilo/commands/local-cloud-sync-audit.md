---
name: local-cloud-sync-audit
description: "Audit ZINC Fusion V16 local/cloud Supabase wiring and produce a bounded repair plan when needed. Use when reviewing env contracts, pooler vs direct connections, cloud-canonical sync boundaries, migration drift, linked-project assumptions, or Vault/pg_cron wiring. Never starts local Supabase in this repo."
model: deepseek/deepseek-v4-pro
agent: plan
argument-hint: 'Allowed focus: env-contract | connection-paths | migration-drift | vault-cron | full-audit'
---

# Local-Cloud Sync Audit

Read the full skill file at `.kilo/skills/local-cloud-sync-audit/SKILL.md` and follow it exactly — including pre-flight, environment loop, connection-path loop, drift loop, Vault/pg_cron loop, approval gate, and re-audit. Do not introduce local Supabase or Docker-based database workflows.

$ARGUMENTS
