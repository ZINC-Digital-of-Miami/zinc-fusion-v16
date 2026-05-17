---
name: autogluon-database-audit
description: "Audit the database-facing contract of the ZINC Fusion V16 AutoGluon pipeline. Use when: reviewing how AutoGluon outputs map into `training`, `forecasts`, and `analytics`; checking OOF/registry/feature-importance persistence; validating promotion gates; auditing local artifact vs cloud table boundaries; or verifying that AutoGluon database writes obey horizon, target, and approval rules. Runs pre-flight, contract loop, artifact-boundary loop, promotion gate loop, approval gate, and re-audit. Never starts training."
argument-hint: 'Allowed focus: registry | oof-outputs | forecast-persistence | promotion-gate | artifact-boundary | full-audit'
---

# AutoGluon Database Audit

## What This Skill Does

Audit and design workflow for the database contract around AutoGluon outputs. This skill sits between the local AutoGluon pipeline and the cloud schemas that serve validated ML artifacts.

Runs as loops: pre-flight → contract loop → artifact-boundary loop → promotion gate loop → approval gate → approved fixes only → re-audit.

**This skill never starts training and never approves cloud promotion implicitly.**

---

## Project Constants

| Constant        | Required Value                        |
| --------------- | ------------------------------------- |
| Horizons        | `30d`, `90d`, `180d` only             |
| Target naming   | `target_price_{h}d`                   |
| Predictor count | 3 instances, one per horizon          |
| Artifacts       | Local only                            |
| Promotion       | Explicit validated promotion to cloud |

---

## Loop 0 — Pre-Flight

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] Read AGENTS.md and .kilo/skills/autogluon-model-review/SKILL.md
[ ] Confirm the task is database-facing AutoGluon contract work, not model-quality review alone
[ ] Confirm no training approval has been granted for this invocation unless the user says so explicitly
[ ] Identify in-scope files/tables
─────────────────────────────────────────────────────────────
```

---

## Loop 1 — Contract Loop

- [ ] OOF outputs, model registry rows, feature importance, forward forecasts, and Target Zones each have a clear destination
- [ ] Destination schemas match intent: `training` for registry/artifact metadata, `forecasts` for published outputs, `analytics` for serving signals only
- [ ] No table stores return-based targets or non-approved horizons
- [ ] AutoGluon DB contracts are shaped for serving and auditability, not just raw dump convenience

---

## Loop 2 — Artifact Boundary Loop

- [ ] Model binaries remain local
- [ ] Large training intermediates remain local unless explicitly approved
- [ ] Cloud persistence is compact and explainable
- [ ] No partial scaffold output is treated as production truth
- [ ] The DB contract does not depend on unstated local filesystem assumptions

---

## Loop 3 — Promotion Gate Loop

- [ ] Promotion path is explicit (`promote_to_cloud.py` or approved equivalent)
- [ ] Validation includes schema compatibility, null checks, horizon coverage, and row count sanity
- [ ] Read and write connection paths are separated appropriately
- [ ] No direct cloud write bypasses the intended gate
- [ ] Missing promotion machinery is reported as a BLOCKER, not papered over

---

## Loop 4 — Approval Gate

Stop and present:

```
## Proposed Changes — AutoGluon Database Contract

### BLOCKERs:
1. [file/table] — [problem] — [one-line fix]

### Files/tables to modify:
- [path or schema.table] — [why]

### Risk:
- [LOW / MEDIUM / HIGH]

### Verification:
- [exact evidence to prove the contract is now safe]
```

Do not implement without explicit approval.

---

## Loop 5 — Approved Fixes Only

Apply only approved changes and re-check the failing section.

---

## Loop 6 — Final Re-Audit

- Re-check target/horizon contract
- Re-check artifact boundary
- Re-check promotion gate
- State any remaining residual risk clearly
