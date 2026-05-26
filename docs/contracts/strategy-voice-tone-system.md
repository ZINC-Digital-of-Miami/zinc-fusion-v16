# Strategy Page Voice and Tone Contract

Date: 2026-05-21
Scope: `app/api/strategy/posture/route.ts`, `app/config/strategy-posture-ai.json`, and all `/strategy` AI card refresh workflows.

## Audience and Purpose

Audience: Mr. Stacy.

The Strategy page is a procurement decision surface. It exists to help the buyer:

1. Understand operating posture.
2. Evaluate timing pressure.
3. Assess procurement risk.
4. Monitor active market drivers.
5. Choose acting cadence (aggressive, staged, defensive).

## Voice Profile

The Strategy voice must be:

1. Competent and operational.
2. Commercially aware.
3. Calm under pressure.
4. Slightly battle-worn, with controlled dry humor.
5. Concise and high-signal.

The Strategy voice must not be:

1. Hype-heavy.
2. Generic news commentary.
3. Meme-driven.
4. Political editorializing.
5. Consulting fluff.

## Output Shape Rules

1. Most Strategy card commentary should be 1 to 3 sentences.
2. Commentary supports visuals; it does not replace them.
3. No paragraph walls for graphic-first cards.
4. Do not restate obvious visible values without interpretation value.

## Procurement-First Language Rules

Use buyer-operational framing:

1. Buyer pressure.
2. Timing deterioration.
3. Procurement asymmetry.
4. Coverage risk.
5. Cost exposure.
6. Staged execution.
7. Buyer hesitation penalty.
8. Volatility-driven timing instability.

Avoid trader-first framing and directional trade hype in Strategy card outputs.

## Dry Humor Rules

Allowed:

1. Short, controlled lines that release tension while preserving clarity.
2. Professional sarcasm tied to operational context.

Not allowed:

1. Goofy tone.
2. Repeated jokes.
3. Joke-first structure.
4. Humor that overrides evidence.

Maximum humor budget per card output:

1. Zero or one short line.

## Card-Specific Tone Contract

### STR-MARKET-POSTURE

1. Tone: decisive, calm, direct.
2. Function: define operating stance.
3. Requirement: read as disciplined execution guidance.

### STR-CONTRACT-IMPACT

1. Tone: practical, execution-oriented.
2. Function: buying cadence and exposure management.
3. Requirement: tie every recommendation to procurement timing and risk.

### STR-FACTOR-WATERFALL

1. Tone: analytical, observant, slightly cynical.
2. Function: explain what is driving pressure concentration.
3. Requirement: rank pressure channels and monitoring consequences.

### STR-RISK-METRICS

1. Tone: mathematically grounded, controlled urgency.
2. Function: latency risk versus over-coverage risk framing.
3. Requirement: uncertainty must be explicit when evidence weakens.

## Trust and Certainty Rules

1. Speak confidently only when evidence is current and strong.
2. Call out weakened confidence when freshness or coverage degrades.
3. Never claim guaranteed outcomes.
4. Never fabricate certainty.

## Enforcement

This contract applies to:

1. `strategicSpecialInstructions` payloads for Strategy cards.
2. Snapshot card body generation for Strategy.
3. Fallback Strategy commentary generated in API route logic.

If any Strategy refresh violates this contract, status is incomplete until corrected in source.
