# 2026-05-16 Quality Playbook Upstream Install

Status: tooling install record; Phase 1 run executed after explicit user request

## Decision

ZINC Fusion V16 installs Quality Playbook from Andrew Stellman's upstream
repository. The original install was pinned to
`fd8a861fd7c4e8349a987ebe1f9c84143bf96e09` (`v1.5.6`).

On 2026-05-17 the install was upgraded to
`ce3a90b14631ccea2c790945e4f6dc9717f6a444` (`v1.5.7`) after comparing the
V16 install, Warbird V9, and upstream source. The critical upstream delta is
bundle completeness: v1.5.7 installs Phase 1 support modules
`bin/reference_docs_ingest.py` and `bin/benchmark_lib.py`, externalized phase
guide references, and stronger bundle-presence smoke checks.

Warbird V9 and ZINC Digital Agency are reference surfaces only. Their
repo-local bundles and generated `quality/` workbook artifacts are not sources
for V16. Warbird V9 currently carries an older repo-local Quality Playbook
skill (`v1.2.0`) plus project-specific guard lanes; those are not copied into
V16.

## Installed Surfaces

- Upstream checkout: `/Users/zincdigital/.codex/tool-sources/quality-playbook`
- Claude bundle: `.claude/skills/quality-playbook`
- GitHub/Copilot bundle: `.github/skills/quality-playbook`
- V16 wrapper: `scripts/qplaybook.py`
- V16 config: `docs/runbooks/qplaybook_config.json`
- Stable wrapper config: `docs/runbooks/qplaybook_config.json`
- Runbook: `docs/runbooks/qplaybook.md`
- Reference-doc sentinels: `reference_docs/.gitkeep` and
  `reference_docs/cite/.gitkeep`

## Guardrails

- The install is tooling-only by default; Quality Playbook phases require an
  explicit wrapper command and `--allow-quality-artifacts`.
- Phase 1 was run on 2026-05-16 after explicit user approval and generated
  V16-local `quality/` workbook artifacts.
- The wrapper resolves `codex` from PATH and rejects the quarantined
  `/Applications/Codex.app/Contents/Resources/codex` path.
- This tooling does not change V16 migration phase status and does not permit
  model training, Supabase migrations, or local Supabase.
