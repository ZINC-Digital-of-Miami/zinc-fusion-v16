---
name: autogluon-model-review
description: "Iterative audit skill for ZINC Fusion V16 AutoGluon training pipeline. Use when: reviewing model config, auditing pipeline scaffold, checking training gate enforcement, verifying specialist/horizon structure, diagnosing AutoGluon gotchas, assessing Phase 5 readiness, or validating python/fusion/. Runs pre-checks, sequential section loop, resolution loop, and commit/push gate. Never trains models or promotes data. For indicator math correctness and overtooling review, use indicator-review skill instead."
argument-hint: 'Allowed focus: training-gate | specialist-horizons | model-config | scaffold-audit | phase-5-readiness | full-audit'
---

# AutoGluon Model Review

## What This Skill Does

Iterative read-then-fix-then-verify audit of the ZINC Fusion V16 AutoGluon training pipeline (`python/fusion/`). Runs in loops: pre-flight → audit loop (sections A–H) → resolution loop (blockers only) → commit gate → final re-audit. Does not train models or promote data to cloud.

---

## Project Constants (Do Not Change Without Explicit Approval)

| Constant                 | Value                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **Specialists**          | crush, china, fx, fed, tariff, energy, biofuel, palm, volatility, substitutes, trump_effect — **11 total, NEVER 10** |
| **Horizons**             | 30d, 90d, 180d — **3 horizons, no 1w/5d/7d**                                                                        |
| **Target naming**        | `target_price_{h}d` — future PRICE LEVEL, not returns                                                                |
| **Model zoo**            | 19 models: LightGBM, XGBoost, Linear, ARIMA, AutoETS + ensemble                                                      |
| **AutoGluon predictor**  | `TimeSeriesPredictor` — 3 instances (one per horizon)                                                                 |
| **Compute**              | CPU-only on macOS ARM — no DeepAR, TFT, PatchTST                                                                     |
| **Covariate type**       | OBSERVED (lagged), not KNOWN                                                                                         |
| **Intermediate storage** | Local parquet in `data/` and `models/` — never in DB                                                                 |
| **Promotion**            | `promote_to_cloud.py` — port 5432 direct — gated + validated                                                         |

---

## Loop 0 — Pre-Flight (Run Before Anything Else)

Stop and report if any pre-flight check fails. Do not proceed to the audit loop.

```
PRE-FLIGHT CHECKLIST
─────────────────────────────────────────────────────────────
[ ] git status — no untracked secrets (.env files, credentials)
[ ] Confirm working branch is NOT main (unless explicitly approved)
[ ] python/fusion/ directory exists and is not empty
[ ] python/pyproject.toml is present
[ ] CLAUDE.md Phase table read — confirm current phase and whether Phase 4 is complete
[ ] No --approve-training flag is set in any active terminal session
─────────────────────────────────────────────────────────────
STOP if any item above FAILS. Report failure and reason. Do not audit.
```

---

## Loop 1 — Read Files (Sequential, Before Any Opinion)

Read these in order. Do not begin checklist until all are read.

1. `python/fusion/config.py` — specialists, horizons, target template
2. `python/fusion/pipeline.py` — phase order, CLI flags, PIPELINE_ORDER
3. `python/fusion/train_models.py` — gate logic, TrainingApprovalError
4. `python/pyproject.toml` — declared dependencies
5. `python/fusion/generate_specialist_signals.py` — NaN handling on first run
6. `python/fusion/run_garch.py` — GARCH model stub
7. `python/fusion/run_monte_carlo.py` — Monte Carlo stub
8. `.gitignore` (root) — confirm `data/` and `models/` are excluded

---

## Loop 2 — Audit Loop (Sections A–H, Sequential)

Work through each section in order. After each section, log all findings before moving to the next. Do not skip sections even if prior sections have blockers.

**After all sections complete:** compile the master issue list grouped by BLOCKER / WARNING / NOTE.

### Section A — Specialist + Horizon Structure

- [ ] Exactly 11 specialists: crush, china, fx, fed, tariff, energy, biofuel, palm, volatility, substitutes, trump_effect
- [ ] `trump_effect` is the 11th — present, not merged with another
- [ ] Horizons are `[30, 90, 180]` — no extras, no missing
- [ ] Target template resolves to `target_price_30d`, `target_price_90d`, `target_price_180d`
- [ ] No specialist has a weak name: "sentiment", "macro", "v2", "new", "tmp", "final"

### Section B — Pipeline Order (Critical Known Bug)

- [ ] `PIPELINE_ORDER` in `pipeline.py` runs GARCH **before** Monte Carlo
  - CORRECT order: build_matrix → specialist_features → specialist_signals → train_models → generate_forecasts → **run_garch** → run_monte_carlo → generate_target_zones
  - **WRONG:** Monte Carlo before GARCH = BLOCKER (corrupts MC volatility inputs)
- [ ] All 8 pipeline phase keys are present
- [ ] `promote_to_cloud` is present or explicitly marked as missing Phase 5 TODO

### Section C — Training Gate

- [ ] `TrainingApprovalError` is raised when `dry_run=False` AND `approved=False`
- [ ] Gate cannot be bypassed via env var, import, or default arg change
- [ ] `--dry-run` exists and is safe (no writes)
- [ ] `--approve-training` is required for live training
- [ ] No training logic auto-executes on module import or `config.py` load

### Section D — AutoGluon Gotchas

- [ ] `require_version_match=False` is documented or stubbed in load call
- [ ] Covariates typed as OBSERVED — no KNOWN covariates (Chronos2 limitation)
- [ ] No deep learning presets (DeepAR, TFT, PatchTST, Chronos2) in model config for ARM
- [ ] Estimated training time (2–6 hours) noted in comments or docs
- [ ] OOF output path set to `training.oof_core_1d`

### Section E — Dependencies (`pyproject.toml`)

| Package                | Required For        | Status                                     |
| ---------------------- | ------------------- | ------------------------------------------ |
| `autogluon.timeseries` | TimeSeriesPredictor | [ ] present / [ ] missing (OK pre-Phase 5) |
| `arch`                 | GJR-GARCH           | [ ] present / [ ] missing (OK pre-Phase 5) |
| `scipy`                | Monte Carlo         | [ ] present / [ ] missing (OK pre-Phase 5) |
| `numpy`                | Numerical           | [ ] present / [ ] missing                  |
| `scikit-learn`         | Preprocessing       | [ ] present / [ ] missing (OK pre-Phase 5) |
| `psycopg2-binary`      | Cloud reads/writes  | [ ] present / [ ] **BLOCKER if missing**   |
| `pandas`               | Feature matrix      | [ ] present / [ ] **BLOCKER if missing**   |
| `pyarrow`              | Parquet I/O         | [ ] present / [ ] **BLOCKER if missing**   |

### Section F — Data Flow Safety

- [ ] Reads use psycopg2 port **6543** (pooler)
- [ ] Promotions use psycopg2 port **5432** (direct)
- [ ] `data/` and `models/` are gitignored — never committed
- [ ] No mock DataFrames, no synthetic rows, no `pd.DataFrame({'close': [100, 101]})`-style stubs
- [ ] No hardcoded test credentials anywhere in `python/`

### Section G — Scaffold Integrity

- [ ] All 9 files exist: `__init__.py`, `config.py`, `pipeline.py`, `build_matrix.py`, `generate_specialist_features.py`, `generate_specialist_signals.py`, `train_models.py`, `generate_forward_forecasts.py`, `run_garch.py`, `run_monte_carlo.py`, `generate_target_zones.py`
- [ ] Each scaffold returns `{"status": "scaffold"}` or similar — acceptable pre-Phase 5
- [ ] `promote_to_cloud.py` is present OR missing and logged as BLOCKER for Phase 5

### Section H — Language / UI Contract

Check any docstrings, CLI output strings, or API response keys in the pipeline:

- [ ] Uses "Target Zones" — horizontal price lines at P30/P50/P70
- [ ] Uses "probability of this price area in N months"
- [ ] **NEVER:** "cones", "bands", "funnels", "confidence intervals", "confidence bands"

---

## Loop 3 — Change Plan + Approval Gate (MANDATORY — Before Any Edit)

After the audit loop completes, **STOP. Do not touch any file yet.**

Produce a written change plan and present it to the user for explicit approval before proceeding.

```
CHANGE PLAN FORMAT
─────────────────────────────────────────────────────────────
## Proposed Changes — AutoGluon Pipeline

### BLOCKERs to fix ([N] total):
1. [file path:line] — [exact problem] — [exact one-line fix]
2. ...

### Files that will be modified:
- [filename] — [what changes]

### Files that will NOT be touched:
- [filename] — [why out of scope]

### Estimated risk:
- [LOW / MEDIUM / HIGH] — [reason]

### What happens if we skip this:
- [consequence]

─────────────────────────────────────────────────────────────
STOP HERE. Present this plan to the user.
Do NOT proceed until the user explicitly says one of:
  - "yes, proceed"
  - "proceed with items 1 and 2 only"
  - specific approval of the listed changes

Silence is NOT approval. Uncertainty is NOT approval.
A vague "ok" is NOT approval — ask for clarification.
─────────────────────────────────────────────────────────────
```

**If user approves the full plan:** proceed to Loop 4.
**If user approves a subset:** proceed to Loop 4 with only the approved items. Log what was deferred.
**If user declines:** emit the audit report with no changes made. Surface the unresolved BLOCKERs for the user to assign separately.

---

## Loop 4 — Resolution Loop (For Each Approved BLOCKER Only)

Only run items that received explicit approval in Loop 3.

```
FOR EACH APPROVED BLOCKER:
  1. State the file, line, and exact problem — confirm it matches approval
  2. Apply the exact fix (no scope creep — do not fix adjacent issues)
  3. Re-read the specific file after the fix
  4. Re-run only the section that contained the BLOCKER
  5. If section now passes → mark BLOCKER resolved
  6. If section still fails → STOP, report to user, do not loop more than 2× on same issue
  CONTINUE until all APPROVED BLOCKERs are resolved
```

Do not fix anything outside the approved change plan. If a new issue is discovered during fixing, add it to the report — do not fix it without a new approval cycle.

---

## Loop 5 — Commit Gate (After All Approved BLOCKERs Resolved)

Only run this loop after Loop 4 exits clean. One fix = one commit.

```
COMMIT GATE
─────────────────────────────────────────────────────────────
0. STATE INTENT: "About to commit: fix(pipeline): [description].
   Proceed?"
   STOP until user confirms.
1. git diff --stat              (confirm only expected files changed)
   STOP if unexpected files appear — report to user, do not commit.
2. git diff                     (review exact changes — no surprises)
3. git add -p                   (stage selectively — never git add .)
4. git commit -m "fix(pipeline): [specific description of changes]"
5. git push origin [branch]
6. Confirm push succeeded (no rejected refs, no diverged branch)
─────────────────────────────────────────────────────────────
STOP if push is rejected. Do not force-push. Report and ask user.
NEVER: git add .
NEVER: git push --force
NEVER: commit without stating intent and receiving explicit confirmation
```

---

## Loop 6 — Final Re-Audit (After Commit)

After a successful commit and push, run a condensed re-audit:

- Re-read all 8 files from Loop 1
- Re-run Sections A, B, C only (the three highest-risk sections)
- If any new BLOCKER is found → return to Loop 3
- If clean → emit final report

---

## Issue Severity Reference

| Severity    | Definition                                                        |
| ----------- | ----------------------------------------------------------------- |
| **BLOCKER** | Prevents correct training, corrupts data, or violates a hard rule |
| **WARNING** | Will cause silent failure at Phase 5 start — fix before training  |
| **NOTE**    | Acceptable technical debt pre-Phase 5 — track but do not block    |

---

## Known Issues Tracker (Checkpoint 7 → Verify Still Present or Fixed)

| Issue                               | Severity | File                             | Check     |
| ----------------------------------- | -------- | -------------------------------- | --------- |
| GARCH before MC ordering bug        | BLOCKER  | `pipeline.py`                    | Section B |
| Missing `promote_to_cloud.py`       | BLOCKER  | `python/fusion/`                 | Section G |
| Missing autogluon/arch/scipy deps   | WARNING  | `pyproject.toml`                 | Section E |
| First-run NaN in specialist_signals | WARNING  | `generate_specialist_signals.py` | Section G |
| data/ models/ not in gitignore      | NOTE     | `.gitignore`                     | Section F |
| psycopg2 connection test missing    | NOTE     | `test_connection.py`             | Section F |

---

## Final Report Format

```
## AutoGluon Model Review — [YYYY-MM-DD]
## Loops completed: Pre-flight ✓, Read ✓, Audit ✓, Resolution [X BLOCKERs fixed], Commit [hash], Re-audit ✓

### BLOCKERs Resolved
- [file:line — description — fix applied]

### Warnings Remaining
- [file — description — acceptable until Phase 5 / fix before training]

### Notes
- [file — description]

### Phase 5 Readiness
- Gate 4 passed (data in cloud): [yes/no/unknown]
- All BLOCKERs resolved: [yes/no]
- Commit pushed: [yes — hash / no — reason]
- Recommendation: [READY / NOT READY — one sentence reason]
```

---

## Hard Rules (Never Violated)

- Never call `TimeSeriesPredictor.fit()` or any training function
- Never `git push --force`
- Never `git add .` — always stage selectively
- Never promote data to cloud (that is `promote_to_cloud.py`'s job, gated separately)
- Never modify `SPECIALISTS` list or `HORIZONS` without user confirmation
- **Never edit any file without a written change plan explicitly approved by the user first**
- **Never fix more than what was approved — no scope creep during fixing**
- **Silence is not approval. Proceed only on explicit "yes, proceed" or equivalent**
- Architecture decisions go through checkpoint decision docs — surface findings only
