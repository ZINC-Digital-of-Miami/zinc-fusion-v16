# Agent Safety Gates

## Status Vocabulary

Use only these closure states:

| State | Meaning |
| --- | --- |
| `PASS` | The required command/check ran in this workspace and exited cleanly with no warning state. |
| `FAIL` | The required command/check ran and failed, timed out, or reported an unsafe state. |
| `NOT RUN` | The required check did not run because the runner, environment, credentials, or prerequisite was unavailable. |
| `INCOMPLETE` | Final task status when any required check is `FAIL` or `NOT RUN`. |

Do not use "complete" for work with `FAIL`, `NOT RUN`, warning-only gates, or
aborted generated-quality finalizers.

## Required Completion Gate

`STATUS: PASS` requires all of the following in the same verification window:

1. `npm run lint` passes.
2. `npm run build` passes.
3. Python test runner availability is proven and required tests run.
4. Quality Playbook doctor and smoke checks pass.
5. `quality/mechanical/verify.sh` passes when quality artifacts exist.
6. Installed Quality Playbook `quality_gate.py` passes with zero warnings.
7. Quality Playbook finalizer is not aborted.
8. Source edits and generated `quality/` artifacts are in sync.
9. Behavior, config, schema, gate, and operational-truth changes update docs or
   contracts in the same change.

If any item is missing, failed, timed out, unavailable, or warning-only, report:

`STATUS: INCOMPLETE`

## Source Lane vs Generated Lane

Treat these as separate lanes:

- Source lane: `app/`, `components/`, `lib/`, `python/`, `scripts/`,
  `supabase/`, package/config files, and authority docs.
- Generated lane: `quality/` artifacts and generated quality receipts.

Rules:

1. Source edits can invalidate generated quality artifacts.
2. Generated artifacts do not prove source quality unless they were regenerated
   after the source edits they describe.
3. Do not manually clean generated artifacts to make string scans pass. Regenerate
   artifacts or mark the quality lane stale.
4. Guard audit logs are written under `logs/fusion-guard/` and are local runtime
   evidence, not source-of-truth docs.

## Guard Commands

Use these commands:

```bash
npm run guard:pre-commit
npm run guard:pre-push
npm run guard:completion
```

`guard:pre-commit` checks staged file scope and contract synchronization.
`guard:pre-push` checks the upstream range and full gates.
`guard:completion` checks the current workspace and full gates.

The guard scripts are intentionally fail-closed. A nonzero guard exit means the
status is incomplete until the blocker is resolved and the guard is rerun.
