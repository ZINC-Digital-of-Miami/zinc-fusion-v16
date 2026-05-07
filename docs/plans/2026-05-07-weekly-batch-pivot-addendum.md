# 2026-05-07 Weekly Batch Pivot Addendum

Status: Locked direction
Applies to: ZINC-FUSION-V16 execution planning

## Intent

This addendum updates execution priorities for a simplified data/training architecture while preserving required page surface and chart freshness behavior.

## Locked Planning Changes

1. Reduce active source surface to roughly 25% of prior volume.
2. Move most non-price ingestion to weekly batch schedules.
3. Run retraining weekly after successful weekly batch completion.
4. Keep hourly chart update path and daily rollup integrity.
5. Use GPT-driven Sentiment and Legislation pipelines.

## Locked Page Authority and Fidelity Constraints

1. Strategy and Vegas Intel follow V16 visual source.
2. Dashboard, Legislation, and Sentiment follow V15 visual source.
3. All pages must use full-width geometry.
4. Visual and interaction parity must be exact to locked source references.

## Phase-Execution Impacts

1. Keep production stability fixes in V15 maintenance lane only.
2. Implement strategic rebuild and parity work in V16.
3. Block release of parity pages until exact token/state/breakpoint match is verified.
4. Treat chart freshness path as mandatory operational dependency.

## Authority References

- `docs/CODEX-TURNOVER.md`
- `docs/decisions/checkpoint-11-weekly-batch-pivot-and-page-authority.md`
- `docs/contracts/page-surface.md`
- `docs/contracts/data-contracts.md`
- `AGENTS.md`
