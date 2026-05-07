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
| `/sentiment` | V15 |
| `/vegas-intel` | V16 |

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
- Strategic pivot and source-lock decisions follow `docs/CODEX-TURNOVER.md` and `docs/decisions/checkpoint-11-weekly-batch-pivot-and-page-authority.md`.
