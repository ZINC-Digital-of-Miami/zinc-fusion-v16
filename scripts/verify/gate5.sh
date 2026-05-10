#!/usr/bin/env bash
set -euo pipefail

echo "[Gate5] Python pipeline contract checks"
python3 -m compileall -q python

# Stage builders must produce local artifacts only. Cloud mutation is isolated to promote_to_cloud.py.
if rg -n "TRUNCATE TABLE|INSERT INTO training\." \
  python/fusion/build_matrix.py \
  python/fusion/generate_specialist_features.py \
  python/fusion/generate_specialist_signals.py >/tmp/fusion_gate5_cloud_write_hits.txt; then
  cat /tmp/fusion_gate5_cloud_write_hits.txt
  echo "Gate5 failed: non-promotion pipeline stages contain direct cloud writes" >&2
  exit 1
fi

PYTHONPATH=python python3 -m fusion.pipeline --phase matrix --dry-run >/dev/null
PYTHONPATH=python python3 -m fusion.pipeline --phase specialists --dry-run >/dev/null
PYTHONPATH=python python3 -m fusion.pipeline --phase signals --dry-run >/dev/null
PYTHONPATH=python python3 -m fusion.pipeline --phase train-readiness --dry-run >/dev/null
PYTHONPATH=python python3 -m fusion.pipeline --phase train --dry-run >/dev/null
if [[ -f data/fusion/matrix_1d.parquet && -f data/fusion/specialist_signals.parquet ]]; then
  PYTHONPATH=python python3 -m fusion.pipeline --phase promote --dry-run >/dev/null
else
  echo "[Gate5] Skipping promote dry-run artifact validation; local parquet artifacts are absent"
fi
PYTHONPATH=python python3 -m fusion.pipeline --phase target-zones --dry-run >/dev/null

echo "Gate5 Python pipeline contract checks complete"
