# Brutally Honest Turnover - 2026-05-10

Repository: `/Volumes/Satechi Hub/ZINC-FUSION-V16`
Scope: AG data cleanup, validation, and training start attempt

## 1) What I Fucked Up

1. I ran `train-readiness` once without loading cloud DB env vars.
Action: ran `PYTHONPATH=python python3 -m fusion.pipeline --phase train-readiness`.
Result: false blocker (`Cloud DB URL is not configured`) because I forgot `source .env.local`.

2. I launched approved full-zoo training without a hard preflight on target dtype.
Action: ran `PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.pipeline --phase train --approve-training`.
Result: first approved run (`v16-scaffold-20260510T232703Z-60fbedb1`) failed in LightGBM with `target_price_30d: object` and FastAI decimal arithmetic errors.

3. I did not run a small approved smoke train after approval to catch runtime-only failures before full-zoo.
Decision error: I jumped straight to full-zoo approved run instead of a scoped include/exclude sanity pass.

4. I patched training code live in a dirty tree without first creating a narrow incident note/checkpoint update.
File changed: `python/fusion/train_models.py`.
Patch: numeric coercion for label in `_split_temporal`.

5. I retried approved training with the same full-zoo model family mix, including known fragile FastAI, after seeing model-family-specific runtime instability.
Action: reran `PYTHONPATH=python ./.venv-ag311/bin/python -m fusion.pipeline --phase train --approve-training`.
Result: second run (`v16-scaffold-20260510T233101Z-85cf0d13`) progressed further but stalled during `NeuralNetFastAI_BAG_L1`.

6. I did not set explicit timeout/kill criteria before long-running approved training.
Behavioral error: I monitored manually and reacted late instead of enforcing a deterministic timeout policy.

7. I had to manually terminate the stalled approved training process.
Action: sent interrupts, then `kill -TERM` to PID `38781`.
Result: training did not complete; run remains partial.

8. I left the evidence narrative stale after training attempts changed reality.
File now stale: `docs/ops/2026-05-10-checkpoint-19-ag-data-cleanup-validation-training-hold.md` states training remained unstarted; that was true when written, not true after approved training attempts.

## 2) What I Broke

1. End-to-end approved AG training completion.
Current status: broken/incomplete.
Evidence: two partial run directories exist, neither completed all horizons or wrote final run history metadata.
- `models/fusion/_failed_runs/2026-05-10/v16-scaffold-20260510T232703Z-60fbedb1/`
- `models/fusion/_failed_runs/2026-05-10/v16-scaffold-20260510T233101Z-85cf0d13/`
Blast radius: AG cannot treat this as a production-grade completed training run.

2. Training runtime consistency.
Current status: degraded.
Evidence: first run failed on label dtype; second run stalled in FastAI stage.
Blast radius: approved training is nondeterministic on current model mix unless scoped or hardened.

3. Documentation truth alignment.
Current status: stale.
Evidence: Checkpoint 19 document no longer reflects post-document approved training attempts/failures.
Blast radius: handoff/review readers can make wrong decisions from outdated evidence narrative.

4. Working tree cleanliness on AG path.
Current status: dirty.
Evidence: `python/fusion/train_models.py` is modified and not checkpointed/published; many unrelated dirty files also exist.
Blast radius: higher merge/review risk and unclear final source of truth for AG training behavior.

## 3) What I Forgot

1. I forgot to source `.env.local` before non-dry-run readiness execution.
2. I forgot to enforce a strict label-type preflight gate before approved training.
3. I forgot to account for FastAI instability observed in this environment and to exclude it on retry.
4. I forgot to set a hard runtime timeout policy before launching approved long-run training.
5. I forgot to immediately reconcile checkpoint docs after the approved training state changed.

## 4) Why I Forgot It

1. `.env.local` omission root cause:
I rushed command execution and relied on implicit shell state instead of explicit environment setup each time.

2. Label-type preflight omission root cause:
I over-trusted dry-run readiness as sufficient for runtime fit safety. I skipped a targeted runtime data-type gate.

3. FastAI exclusion omission root cause:
I tunneled on “rerun after patch” and did not re-evaluate model-family risk before retrying.

4. Timeout policy omission root cause:
I monitored interactively instead of defining stop conditions up front. That is process sloppiness, not technical complexity.

5. Doc reconciliation omission root cause:
I treated the earlier checkpoint doc as finished and did not update it after the state materially changed.

## 5) Implications

1. Wasted time and compute.
Two approved runs consumed time without producing a complete multi-horizon finished run.

2. Broken confidence in execution discipline.
I introduced avoidable incident handling steps (failure, hotfix, retry, stall, manual kill).

3. Stale operational truth.
Checkpoint docs now require correction before another person can trust them as current state.

4. Increased cleanup burden for AG.
AG now has to triage partial artifacts, stale docs, and an uncommitted training patch before safely retrying.

5. Delivery delay.
Model execution is still not at a clean completed state even after explicit approval.

## 6) What I Will Do Next Time To Not Make These Same Amateur Mistakes

1. Mandatory environment gate before every non-dry-run command.
Rule: always run `set -a; source .env.local; set +a` in the same command invocation.

2. Mandatory runtime preflight for labels/features before approved training.
Rule: fail fast if any target label dtype is non-numeric after frame assembly.

3. Mandatory staged launch strategy.
Rule: first approved run must use a conservative model family set; only widen after successful completion.

4. Mandatory timeout policy written before launch.
Rule: define max idle time and max wall-clock per stage, and auto-abort when exceeded.

5. Mandatory live-state documentation hygiene.
Rule: any approved training attempt that changes state requires immediate checkpoint doc delta update.

6. Mandatory dirty-tree containment for incident fixes.
Rule: isolate AG-runtime fixes in a clearly scoped branch/worktree or explicit checkpoint patch note before reruns.

## 7) What's Left To Get Done For AG

Priority 1 - Fix and validate training stability path.
Status: partially recovered; final approved training still open.
Dependencies: keep `python/fusion/train_models.py` label coercion and pre-fit dtype guard; use the locked neural-family exclusion retry scope.
Done looks like: one approved run completes all horizons and writes final run metadata with no manual kill.

Priority 2 - Decide retry strategy for model families.
Status: decided for next retry.
Dependencies: next approved retry excludes `FASTAI` and `NN_TORCH` with `AUTOGLUON_MODEL_SELECTION_MODE=exclude_only` and `AUTOGLUON_EXCLUDED_MODEL_TYPES=FASTAI,NN_TORCH`.
Done looks like: documented contract for retry model selection and command recorded; training still requires explicit approval before launch.

Priority 3 - Clean partial run artifact ambiguity.
Status: recovered.
Dependencies: decision to keep or archive/delete partial run dirs:
- `models/fusion/_failed_runs/2026-05-10/v16-scaffold-20260510T232703Z-60fbedb1/`
- `models/fusion/_failed_runs/2026-05-10/v16-scaffold-20260510T233101Z-85cf0d13/`
Done looks like: artifact policy applied and documented in `docs/ops/2026-05-11-checkpoint-20-ag-training-incident-recovery.md`.

Priority 4 - Update checkpoint evidence to current truth.
Status: recovered.
Dependencies: include training-attempt timeline and outcomes after Checkpoint 19.
Done looks like: checkpoint docs no longer imply "no approved training started" as final current truth.

Priority 5 - Commit or discard AG runtime patch intentionally.
Status: recovered pending final commit/push.
Dependencies: `python/fusion/train_models.py` label coercion is retained and hardened with a pre-fit dtype guard plus focused unit tests.
Done looks like: patch is committed with rationale/tests.

Priority 6 - Re-run final validation packet after successful training.
Status: blocked by Priority 1.
Dependencies: completed approved training run.
Done looks like: refreshed evidence doc with run ID, horizon outputs, and pass/fail summary for AG handoff.
