# Checkpoint 11 - Weekly Batch Pivot and Page Authority

Date: 2026-05-07
Status: Locked

## Decision

Adopt a simplified V16 operating model with reduced data scope, weekly batch ingestion and retraining cadence, locked page authority mapping, and exact full-width visual fidelity requirements across all pages.

## Options Evaluated

### Option A - Continue broad high-frequency ingestion and keep existing V16 page geometry
- Keep current source volume and frequent pulls.
- Keep current V16 width/layout system.
- Pros: lower immediate restructuring effort.
- Cons: preserves noise, higher operational cost, and misalignment with locked product direction.

### Option B - Move strategic work back to V15
- Implement new data and page strategy directly in V15.
- Pros: immediate proximity to existing V15 page designs.
- Cons: extends legacy debt and increases long-term migration risk.

### Option C - Recommended and locked
- Keep V15 as maintenance-only for production stability.
- Implement strategic changes in V16.
- Use weekly batch ingest and weekly retraining for reduced source set.
- Keep hourly chart freshness path.
- Enforce page source authority map and full-width pixel-fidelity contract.

## Reasoning

Option C best balances immediate production continuity and long-term architecture quality. It limits churn in legacy systems while preserving strategic progress in V16. The reduced-source weekly cadence aligns with the stated noise-reduction goal. The page authority lock prevents repeated design drift and rework by forcing explicit source ownership and exact parity criteria.

## Verification Checklist

- [ ] `docs/CODEX-TURNOVER.md` reflects locked 2026-05-07 decisions.
- [ ] `docs/contracts/page-surface.md` encodes page authority and full-width fidelity contract.
- [ ] `docs/contracts/data-contracts.md` encodes weekly batch and weekly retraining cadence.
- [ ] `AGENTS.md` includes the lock as hard rules for startup enforcement.
- [ ] No implementation code changes were required to lock this decision artifact.

## Implementation Implications

1. Rework execution sequencing around weekly batch windows and weekly retrain gates.
2. Keep chart price path at hourly freshness and daily rollup integrity.
3. Rebuild V15-authority pages in V16 for exact visual parity without code copying.
4. Preserve V16-authority pages while bringing them into full-width global layout contract.
5. Treat any visual token/state mismatch as a blocking defect.
6. Keep V15 changes constrained to critical maintenance and incident response.

## Sources

- User directives in active session (2026-05-07) locking:
  - page authority map
  - full-width all-page requirement
  - exact per-pixel/token/state fidelity requirement
  - weekly batch + weekly retrain pivot
- `docs/CODEX-TURNOVER.md`
- `docs/contracts/page-surface.md`
- `docs/contracts/data-contracts.md`
- `AGENTS.md`
