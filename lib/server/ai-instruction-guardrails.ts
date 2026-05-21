import type { StrategicSpecialInstructions } from "@/lib/contracts/ai-card";

const NO_SHORTHAND_CONSTRAINT =
  "Do not use ticker shorthand or unexplained acronyms in output text.";

const CHRIS_MEANING_REQUIREMENT =
  "Translate every metric into plain business meaning for Chris Stacy, tied to buying timing or cost risk.";

const KEVIN_MEANING_REQUIREMENT =
  "Translate every metric into plain business meaning for Kevin, tied to sales execution or service timing.";

const CHRIS_TONE_REQUIREMENT =
  "Keep tone calm, concise, procurement-first, and executive-readable in one quick scan.";

const KEVIN_TONE_REQUIREMENT =
  "Keep tone practical, concise, and sales-operations focused for field execution.";

function appendUnique(items: string[], value: string): string[] {
  const normalized = value.trim().toLowerCase();
  if (items.some((item) => item.trim().toLowerCase() === normalized)) {
    return items;
  }
  return [...items, value];
}

function translateShorthand(text: string): string {
  return text
    .replace(/\bVIX\b/g, "broad volatility gauge")
    .replace(/\bOVX\b/g, "oil-volatility gauge")
    .replace(/\bCNY\b/g, "Chinese-currency gauge")
    .replace(/\bCL\b/g, "crude-oil benchmark")
    .replace(/\bZL\b/g, "soybean-oil futures contract")
    .replace(/\bCoT\b/g, "managed-money positioning report");
}

function translateList(items: string[]): string[] {
  return items.map((item) => translateShorthand(item));
}

export function withAudienceInstructionGuardrails(
  instructions: StrategicSpecialInstructions,
  audience: "chris" | "kevin" = "chris",
): StrategicSpecialInstructions {
  const audienceMeaning =
    audience === "kevin" ? KEVIN_MEANING_REQUIREMENT : CHRIS_MEANING_REQUIREMENT;
  const audienceTone =
    audience === "kevin" ? KEVIN_TONE_REQUIREMENT : CHRIS_TONE_REQUIREMENT;

  return {
    cardTopic: translateShorthand(instructions.cardTopic),
    strategicObjective: translateShorthand(instructions.strategicObjective),
    neuralConnectionThesis: translateShorthand(instructions.neuralConnectionThesis),
    quantResearchProtocol: translateList(instructions.quantResearchProtocol ?? []),
    inferenceConstraints: appendUnique(
      translateList(instructions.inferenceConstraints ?? []),
      NO_SHORTHAND_CONSTRAINT,
    ),
    outputRequirements: appendUnique(
      appendUnique(translateList(instructions.outputRequirements ?? []), audienceMeaning),
      audienceTone,
    ),
  };
}
