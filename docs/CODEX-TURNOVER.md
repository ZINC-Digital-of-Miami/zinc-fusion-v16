# CODEX TURNOVER - ZINC-FUSION-V16

Date: 2026-05-07
Repository: /Volumes/Satechi Hub/ZINC-FUSION-V16
Branch: main

## Purpose

This document locks the current architectural pivot and UI fidelity decisions so future Codex sessions do not reopen settled direction.

## Locked Strategic Pivot

1. Reduce training/input scope to approximately 25% of prior volume.
2. Replace most high-frequency pull patterns with weekly batch downloads.
3. Retrain model forecasts weekly after batch ingest.
4. Keep chart updates hourly (1h updates supporting daily-bar view).
5. Use GPT-driven pipelines for Sentiment and Legislation content sourcing/summarization.

## Locked Page Source Decisions

1. Strategy: V16 design is source of truth.
2. Vegas Intel: V16 design is source of truth.
3. Dashboard: V15 design is source of truth.
4. Legislation: V15 design is source of truth.
5. Sentiment: V15 design is source of truth.

## Locked UI Fidelity Contract (Non-Negotiable)

1. All V16 pages must use full-width page geometry matching V15.
2. No retained narrow/containerized V16 page widths.
3. Pixel-perfect parity is required across all pages and breakpoints.
4. Exact parity required for:
   - card sizing and spacing
   - layout grids and wrapping
   - typography (family, size, weight, line-height, letter spacing)
   - colors (exact hex codes)
   - shadows, borders, radii, gradients
   - interaction states (hover, active, focus, selected, disabled)
5. "Close enough" is not acceptable. Any visual drift is a defect.

## Execution Note

This lock is architectural and design-direction authority. It does not itself implement UI/data changes; it defines required behavior for subsequent implementation work.
