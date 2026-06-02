#!/usr/bin/env bash
# Operator completion lane — ZINC Fusion V16.
#
# Delegates to the repo's own fail-closed completion guard:
#   python3 scripts/fusion_guard.py completion
# which runs authority-doc + changed-file-contract + runtime-vocabulary + no-AI-gateway
# checks PLUS the full gate (npm run lint, npm run build, python checks). Self-contained,
# no network.
#
# On pass it writes a receipt to .git/operator-prechecks/<stamp>.log ending in the
# sentinel OPERATOR_PRECHECK_PASS — the Operator Stop-gate reads that as ground truth
# that the CURRENT tree was verified. Exit 0 on pass, 1 on any failure.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || { echo "operator-precheck: cannot cd to repo root" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || echo now)"
RDIR="$ROOT/.git/operator-prechecks"; mkdir -p "$RDIR" 2>/dev/null
LOG="$RDIR/${STAMP}.log"
record() { printf '%s\n' "$*" | tee -a "$LOG"; }

record "operator-precheck: ZINC Fusion V16"
record "root: $ROOT"
record "stamp: $STAMP"
record "lane: python3 scripts/fusion_guard.py completion"
record "----------------------------------------"

out="$(python3 scripts/fusion_guard.py completion 2>&1)"; rc=$?
printf '%s\n' "$out" | tee -a "$LOG"

record "----------------------------------------"
if [ "$rc" -eq 0 ]; then
  record "STATUS: PASS"
  record "OPERATOR_PRECHECK_PASS"
  exit 0
else
  record "STATUS: INCOMPLETE (fusion_guard exit $rc)"
  exit 1
fi
