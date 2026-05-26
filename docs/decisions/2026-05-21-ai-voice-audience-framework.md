# Decision: AI Voice + Audience Framework (Card Surfaces)

Date: 2026-05-21  
Status: Locked for current build wave

## Scope Lock

- Strategy page is excluded from this change.
- Dashboard pressure bar, chart, and regime section are excluded.
- Dashboard scope starts at **AI Market Intelligence** and includes **Market Risk Factors** only.

## Audience Contract

- Default audience for in-scope AI cards: **Mr. Stacy**.
- Vegas Intel page audience: **Kevin** only.

## Voice Contract

- Concise, operational, commercially aware.
- Light dry humor and restrained sarcasm are allowed when they improve readability.
- No meme language, no fluff, no vague generic market commentary.
- Visual cards remain visual-first; AI text is support context, not long-form narrative.

## Implementation Surfaces

- `/app/api/dashboard/risk-factors/route.ts`
  - Enforces concise Mr. Stacy phrasing for:
    - market intelligence headline/summary/trading implication
    - driver headlines
    - `whatsHappening` drill-down fields
- `/app/api/sentiment/overview/route.ts`
  - Enforces concise Mr. Stacy sentiment narrative outputs regardless of snapshot verbosity.
- `/app/api/legislation/feed/route.ts`
  - Enforces concise Mr. Stacy policy commentary with practical procurement interpretation.
- `/app/api/vegas/intel/route.ts`
  - Enforces concise Kevin-facing sales/event/service commentary.
- `/app/api/vegas/intel/draft/route.ts`
  - Tightens Kevin-oriented pitch-angle defaults.
- `/lib/server/openrouter.ts`
  - Locks prompt style for concise, practical, professional Kevin-facing draft intel output.

## Guardrails

- No change to chart rendering or regime visualization logic.
- No change to dashboard pressure bar behavior.
- No auth-mode change (build-mode auth lock remains active).
- No Strategy page card AI modifications.

