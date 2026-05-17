# ZINC Fusion V16 Quality Playbook Runbook

This repo installs Andrew Stellman's upstream Quality Playbook from:

`https://github.com/andrewstellman/quality-playbook`

Pinned upstream commit:

`ce3a90b14631ccea2c790945e4f6dc9717f6a444` (`v1.5.7`)

Local upstream checkout:

`/Users/zincdigital/.codex/tool-sources/quality-playbook`

Repo-local installed bundles:

- `.claude/skills/quality-playbook`
- `.github/skills/quality-playbook`

Do not copy Quality Playbook files or generated workbook artifacts from Warbird,
ZINC Digital Agency, or any other project. Refresh from the upstream checkout.

## Wrapper

Use the V16 wrapper:

```bash
python3 scripts/qplaybook.py doctor
python3 scripts/qplaybook.py smoke --profile code --no-llm
```

The wrapper resolves `codex` from PATH and rejects:

`/Applications/Codex.app/Contents/Resources/codex`

This avoids the macOS-quarantined Codex.app binary path.

The stable wrapper config is `docs/runbooks/qplaybook_config.json`. The wrapper
must not depend on a generated `quality/qplaybook_config.json` copy because
Quality Playbook phase runs may archive `quality/` artifacts before writing a
fresh run.

The installed bundle must include the v1.5.7 Phase 1 support modules:
`bin/reference_docs_ingest.py` and `bin/benchmark_lib.py`. It must also include
the externalized phase guide references added in v1.5.7. Missing bundle members
turn the doctor/smoke checks into failures.

The installed quality gate is also run through the wrapper. The wrapper treats
gate timeouts as failures instead of waiting indefinitely; the timeout is set by
`quality_gate_timeout_seconds` in `docs/runbooks/qplaybook_config.json`.

## Running Quality Playbook Phases

This install is tooling-only. Do not generate V16 `quality/` workbook artifacts
unless that work is explicitly requested.

When a run is approved, use the wrapper with an explicit artifact-generation
flag:

```bash
python3 scripts/qplaybook.py run --profile code --allow-quality-artifacts -- --phase 1
```

The wrapper validates the upstream checkout, installed bundles, and Codex CLI
before handing execution to the upstream runner.

## V16 Boundaries

- Quality Playbook does not advance or bypass any V16 migration phase gate.
- It must not run model training.
- It must not run Supabase migrations, `db push`, or local Supabase.
- Any future generated playbook content must be V16-specific and grounded in
  the canonical migration plan plus current repo reality.

## Completion Status

Quality Playbook output is not sufficient by itself to claim task completion.
Apply `docs/agent-safety-gates.md`:

- Any `NOT RUN` TDD/test evidence means `STATUS: INCOMPLETE`.
- Any `WARN` in the required quality gate means `STATUS: INCOMPLETE`.
- Any aborted Quality Playbook finalizer means `STATUS: INCOMPLETE`.
- Any source/config/tooling edit after artifact generation means quality
  artifacts are stale until regenerated and re-verified.

Run:

```bash
npm run guard:completion
```

before any completion claim.
