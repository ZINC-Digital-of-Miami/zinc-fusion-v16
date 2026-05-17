# ZINC Fusion V16 Authority Index

Read these files in order at session startup:

1. `AGENTS.md` — hard project rules, phase order, and safety constraints.
2. `docs/MASTER_PLAN.md` — current operational truth and completion status.
3. `docs/plans/2026-03-17-v16-migration-plan.md` — canonical build plan.
4. `docs/agent-safety-gates.md` — fail-closed completion contract.
5. `docs/runbooks/session-startup.md` — startup review procedure.
6. `docs/runbooks/qplaybook.md` — Quality Playbook install and run procedure.
7. `docs/contracts/` — executable API, data, security, and quality contracts.
8. `docs/decisions/` and `docs/ops/` — checkpoint evidence and dated decisions.

If these files disagree, stop and reconcile before implementation. Do not treat
generated `quality/` artifacts as fresher than source edits unless the guard
scripts confirm the workbook was regenerated after the source change.
