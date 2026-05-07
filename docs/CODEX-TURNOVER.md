# CODEX TURNOVER - ZINC-FUSION-V16

Date: 2026-05-07
Repository: /Volumes/Satechi Hub/ZINC-FUSION-V16
Branch: main

## Purpose

This document locks the active architecture and UI authority decisions so future sessions do not reopen settled direction.

## Locked Strategic Pivot (2026-05-07)

1. Reduce active training and ingestion scope to about 25% of prior volume.
2. Replace most high-frequency pulls with weekly batch downloads.
3. Retrain model forecasts weekly after batch ingest completes.
4. Keep hourly chart updates and daily-bar experience intact.
5. Keep the same page surface set.
6. Use GPT-driven pipelines for Sentiment and Legislation content.
7. Do not implement placeholder, synthetic, or guessed data to fill cards.

## Locked Page Authority Map

1. Strategy page visual source of truth: V16.
2. Vegas Intel page visual source of truth: V16.
3. Dashboard page visual source of truth: V15.
4. Legislation page visual source of truth: V15.
5. Sentiment page visual source of truth: V15.

## Locked Visual Fidelity Contract (All Pages)

1. Full-width geometry is mandatory on every V16 page.
2. Do not retain current narrow V16 page widths.
3. Match V15 per-pixel geometry where V15 is the source, and preserve locked V16 source pages exactly where V16 is the source.
4. Exact breakpoint behavior is required for desktop, tablet, and mobile.
5. Exact parity is required for fonts, sizing, spacing, shadows, borders, gradients, and all color hex values.
6. Exact interaction-state parity is required for hover, active, focus, selected, and disabled states.
7. Any visual drift is a defect.

## Execution Posture

1. V15 remains maintenance-only for critical production fixes.
2. Strategic architecture changes are implemented on V16.
3. For locked V15-source pages, implement rewrite-only parity in V16. No code copying from V15.
4. For locked V16-source pages, preserve V16 layout/behavior while adopting the global full-width and fidelity contract.

## Immediate Operational Priority

1. Ensure daily rollup path is healthy so chart freshness remains trustworthy.
2. Stabilize page parity and width contract.
3. Implement weekly batch architecture and weekly retraining contract.
4. Implement GPT pipelines for Sentiment and Legislation card population.

## Memory Ingest Payload

Use the payload below when saving to external memory systems.

- Project: ZINC-FUSION-V16
- Date locked: 2026-05-07
- Strategic pivot: weekly batch ingestion, weekly retraining, roughly 75% source reduction
- Chart contract: hourly updates retained with daily-bar experience
- Page authority: Strategy=V16, Vegas Intel=V16, Dashboard=V15, Legislation=V15, Sentiment=V15
- Global UI contract: full-width all pages, exact breakpoint behavior, exact token/state parity, zero visual drift tolerance
- Delivery posture: V15 maintenance only, strategic implementation on V16
