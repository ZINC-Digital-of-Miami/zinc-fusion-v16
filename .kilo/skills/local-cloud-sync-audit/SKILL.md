---
name: local-cloud-sync-audit
description: "Audit and build the ZINC Fusion V16 local/cloud Supabase wiring. Use when: checking environment variable contracts, verifying cloud-canonical architecture, auditing pooler vs direct connection paths, reviewing migration drift, validating linked-project state, checking Vault/pg_cron wiring, or diagnosing sync ambiguity between local compute and cloud database state. Runs pre-flight, environment loop, connection-path loop, drift loop, secret/scheduling loop, approval gate, and re-verification. Never starts local Supabase or Docker in this repo."
argument-hint: 'Allowed focus: env-contract | connection-paths | migration-drift | vault-cron | linked-project | full-audit'
---

# Local-Cloud Sync Audit

## What This Skill Does

Systematic audit and fix workflow for ZINC Fusion V16 local/cloud Supabase wiring. This skill is for the boundary between local compute and cloud canonical state, not generic app coding.

Runs as loops: pre-flight → environment loop → connection-path loop → migration/drift loop → Vault/pg_cron loop → change plan → approved fixes only → re-audit.

**This skill never starts local Supabase, never uses Docker, and never normalizes drift by editing the cloud manually.**

---

## Project Constants

| Contract           | Required Posture                         |
| ------------------ | ---------------------------------------- |
| Canonical database | Cloud Supabase only                      |
| Local DB workflow  | Local PostgreSQL only for AG training source; no local Supabase/Docker |
| Frontend reads     | Supabase JS client + anon key + JWT      |
| Python reads       | Cloud Supabase pooler path for extraction; local PostgreSQL for AG training source |
| Python promotions  | Cloud Supabase direct write path         |
| Intermediates      | Local parquet only                       |
| Schema truth       | Supabase migrations + linked cloud state |
| Ingestion          | `pg_cron` + `http` inside Postgres       |

---

## Loop 0 — Pre-Flight

Stop if any item fails.

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Read AGENTS.md and the migration plan sections covering architecture and jobs
[ ] Search Kilo local recall or configured memory MCP for local/cloud Supabase decisions; if unavailable, record `memory search: NOT RUN`
[ ] If `memories/repo/local-cloud-architecture.md` or `memories/repo/supabase-state.md` exists in this workspace, read it; if absent, record `memory files: MISSING`
[ ] Confirm focus area for this invocation
[ ] git status reviewed — note unrelated dirty files before touching anything
[ ] Confirm user intent: audit only vs approved implementation
[ ] Confirm this repo still forbids local Supabase / Docker workflows
─────────────────────────────────────────────────────────────
```

---

## Loop 1 — Environment Contract Loop

Audit these items in order:

- [ ] Browser-facing env vars are limited to Supabase URL and anon key
- [ ] No browser path uses `service_role`
- [ ] Local env naming is internally consistent enough to tell which variable powers which path
- [ ] If `DATABASE_URL`, `POSTGRES_URL`, `SUPABASE_DB_URL`, or `SUPABASE_POOLER_URL` coexist, each one has a clearly bounded purpose
- [ ] No manual `.env` copying workflow is being introduced in place of `vercel env pull`

Log mismatches as BLOCKER / WARNING / NOTE.

---

## Loop 2 — Connection Path Loop

- [ ] Frontend reads are read-only and authenticated through Supabase Auth / JWT flow
- [ ] API routes do not create a shadow write path that bypasses intended RLS boundaries
- [ ] Python heavy reads use the pooler path where appropriate
- [ ] AG training reads from the bounded local PostgreSQL training source only after explicit local load
- [ ] Promotions use the direct write path where appropriate
- [ ] No local file or local DB path is treated as canonical serving state
- [ ] Pooler/direct split is explicit in docs or code where the task touches it

---

## Loop 3 — Migration / Drift Loop

- [ ] `supabase/config.toml` exists and matches cloud-only posture
- [ ] Migrations remain the source of truth
- [ ] No task encourages raw cloud DDL as a fix path
- [ ] Linked project status and `db diff --linked` expectations are explicit if migration work is involved
- [ ] Drift between docs, code, and live cloud assumptions is called out directly

If migration work is required, pair this skill with `.kilo/skills/supabase-schema-audit/SKILL.md`.

---

## Loop 4 — Vault / Scheduling Loop

- [ ] Secrets needed inside Postgres are sourced from Vault or an equally protected server-side mechanism
- [ ] No secret handling broadens access to decrypted secrets casually
- [ ] Scheduling remains inside Supabase via `pg_cron` + `http`
- [ ] No Vercel cron or Inngest path is introduced
- [ ] If views are exposed, RLS interaction is explicit (`security_invoker` or protected schema strategy)

---

## Loop 5 — Change Plan + Approval Gate

After the audit, stop and present a focused change plan.

```
CHANGE PLAN FORMAT
─────────────────────────────────────────────────────────────
## Proposed Changes — Local/Cloud Sync

### BLOCKERs to fix ([N] total):
1. [file/config/path] — [exact problem] — [one-line fix]

### Files/configs that will be modified:
- [path] — [why]

### What will NOT be touched:
- [path] — [why out of scope]

### Risk:
- [LOW / MEDIUM / HIGH] — [reason]

### Verification:
- [exact command / evidence that proves the fix]
─────────────────────────────────────────────────────────────
STOP. Do not implement until the user explicitly approves the listed fixes.
```

---

## Loop 6 — Approved Fixes Only

For each approved item:

1. State the exact contract being repaired.
2. Apply only the approved change.
3. Re-check the specific loop section that was failing.
4. Stop after 2 failed attempts on the same issue.

---

## Loop 7 — Final Re-Audit

- Re-run the failed sections only
- Confirm the cloud-canonical contract still holds
- Confirm no local Supabase or parallel sync path was introduced
- Emit remaining residual risk clearly
