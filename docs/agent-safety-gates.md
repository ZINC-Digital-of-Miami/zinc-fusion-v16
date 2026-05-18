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
unverified required checks.

## Required Completion Gate

`STATUS: PASS` requires all of the following in the same verification window:

1. `npm run lint` passes.
2. `npm run build` passes.
3. Python test runner availability is proven.
4. Required Python contract tests run.
5. Focused chart-overlay regression tests run when the chart surface changes.
6. Fusion guard unit tests run when guard behavior changes.
7. Behavior, config, schema, gate, and operational-truth changes update docs or
   contracts in the same change.

If any item is missing, failed, timed out, unavailable, or warning-only, report:

`STATUS: INCOMPLETE`

## Source Lane vs Local Runtime Lane

Treat these as separate lanes:

- Source lane: `app/`, `components/`, `lib/`, `python/`, `scripts/`,
  `supabase/`, package/config files, and authority docs.
- Local runtime lane: `.next/`, `logs/`, caches, local data, and other ignored
  machine-generated outputs.

Rules:

1. Source edits must be verified by the active guard checks for the changed
   surface.
2. Retired tooling artifacts do not prove current source quality.
3. Guard audit logs are written under `logs/fusion-guard/` and are local runtime
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
