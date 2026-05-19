# V16 Page Surface Contract

## Required Pages
- `/` Landing page.
- `/dashboard` Chart, live status, target zones, key dashboard cards.
- `/strategy` Posture and contract-impact view.
- `/legislation` Policy and regulation feed.
- `/sentiment` Sentiment and positioning intelligence.
- `/vegas-intel` Vegas operations intelligence.

## Page Authority Lock (2026-05-07)

| Page | Visual Source of Truth |
|---|---|
| `/dashboard` | V15 |
| `/strategy` | V16 |
| `/legislation` | V15 |
| `/sentiment` | V16 top nav/header locked; body follows `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md` |
| `/vegas-intel` | V16 top nav/header locked; body and Glide behavior follow `docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md` |

## Turnover Precision Lock (2026-05-18)

The turnover document is an implementation contract, not a reference moodboard:

`docs/ops/2026-05-18-v15-vegas-sentiment-visual-and-glide-turnover.md`

Scope:

1. Applies to `/vegas-intel` and `/sentiment` body content below the current V16 header.
2. Excludes the dashboard chart and all chart behavior.
3. Keeps the current V16 `BackendShell`, top navigation, and top page header blocks locked unless the user explicitly reopens them.
4. Requires exact body spacing, padding, card treatment, color tokens, border/radius choices, phone behavior, and section order from the turnover.
5. Requires the Vegas behavior layer: segment filtering, event sorting, opportunity classification, ZFusion/event-pressure scoring, cuisine-aware pitch reasoning, AI-card provenance, and deliberate server-side draft intel behavior if Intel buttons are wired.
6. Requires the 8-table Glide source contract to be read-only and server-side. Browser Glide calls, public unauthenticated sync routes, Glide writes, and invented restaurant/fryer/oil/schedule/shift values are prohibited.

Implementation rule: an agent may not touch `/vegas-intel` or `/sentiment` body work until it has read the turnover document end-to-end and can map each changed section back to a named turnover section.

## Global Layout and Fidelity Contract

1. Full-width layout is mandatory on all V16 pages.
2. The current narrow/containerized V16 widths are not allowed.
3. Match source layout per pixel, including breakpoint behavior and card wrapping.
4. Match source visual tokens exactly:
   - font family, size, weight, line-height, letter spacing
   - exact color hex codes
   - border, radius, shadow, gradient
5. Match all interaction states exactly:
   - hover, active, focus, selected, disabled
6. Any drift from locked source geometry or tokens is a defect.

## Access Rules
- Auth requirements follow the active auth contract and phase gating decisions.
- Public landing remains reachable per active route policy.

## Source of Truth
- Product and route scope follows `docs/plans/2026-03-17-v16-migration-plan.md`.
- Strategic pivot and source-lock decisions follow `docs/CODEX-TURNOVER.md`, `docs/decisions/checkpoint-11-weekly-batch-pivot-and-page-authority.md`, and the 2026-05-18 Vegas/Sentiment turnover document named above.
