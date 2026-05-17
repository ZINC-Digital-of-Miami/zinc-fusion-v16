# Release Checklist

## Purpose

Provide a consistent pre-release and pre-push procedure for ZINC Fusion V16 changes.

## Steps

1. Read `AGENTS.md`, `docs/MASTER_PLAN.md`, `docs/agent-safety-gates.md`, and the `.kilo/rules/` file that matches the changed surface.
2. Confirm branch, staged scope, and working tree status are intentional.
3. Check the change against hard rules: no mock data, no copied legacy code, no browser `service_role`, no Vercel cron, no local Supabase drift.
4. Verify the work matches the current execution phase and does not skip a gate or required approval.
5. Run the smallest relevant validation for the changed surface and capture the actual result. For source/config/tooling changes, prefer `npm run guard:pre-commit`; before pushing, use `npm run guard:pre-push`; for completion claims, use `npm run guard:completion`.
6. If architecture truth changed, confirm the canonical docs were updated in the same workstream.
7. Check for release blockers: missing evidence, unreviewed blast radius, security exposure, or unrelated dirty files.
8. Only commit or push after the user explicitly asks for that action, then report the release decision with residual risk.

## Output Format

1. Scope
   State what is being released and what is intentionally excluded.
2. Validation
   List the checks that ran and the result of each one.
3. Blockers
   List any issue that should stop release. If there are no blockers, say `None`; if a required check did not run, list it as `NOT RUN` and set the release decision to `HOLD`.
4. Release Decision
   State `GO` or `HOLD`, plus any residual risk that remains.
