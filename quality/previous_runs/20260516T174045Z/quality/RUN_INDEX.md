# QPB RUN_INDEX

Append-only index of every archived run under `quality/previous_runs/`. One row
per archived run. Maintained by `bin/migrate_v1_5_0_layout.py` at
migration time and by `bin/archive_lib.archive_run` at end of every
successful run. Rows are never rewritten; a run's `INDEX.md` is the
authoritative per-run record. The Role breakdown column summarises
the four shares from `quality/exploration_role_map.json` (skill /
code / tool / other) — `n/a` when Phase 1 produced no role map.

| Run | QPB version | Role breakdown | Gate verdict | Bug count | Per-run INDEX |
|-----|-------------|----------------|--------------|-----------|----------------|
| 20260516T151008Z | unknown | n/a | partial | 0 | [INDEX.md](quality/previous_runs/20260516T151008Z/INDEX.md) |
