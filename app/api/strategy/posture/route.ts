import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, StrategyPosture } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

type StrategyCards = {
  contractImpactCalculator: AiCardContent;
  factorWaterfall: AiCardContent;
  riskMetrics: AiCardContent;
};

type StrategyAiSnapshot = {
  posture?: StrategyPosture;
  cards?: StrategyCards;
} & AiSnapshotMeta;

const STRATEGY_INSTRUCTIONS: Record<keyof StrategyCards, StrategicSpecialInstructions> = {
  contractImpactCalculator: {
    cardTopic: "Buyer-Side Contract Window Impact",
    strategicObjective:
      "Quantify staged-buy versus single-window contract execution under current volatility, crush, and macro tail conditions for soybean oil procurement.",
    neuralConnectionThesis:
      "Execution cost dispersion increases non-linearly when volatility transmission and macro-policy stress co-align; tranche-based timing reduces adverse selection probability for buyers.",
    quantResearchProtocol: [
      "Estimate scenario-weighted cost outcomes across staggered execution windows.",
      "Compare one-shot entry slippage risk versus staged entry variance reduction.",
      "Include downside tail amplification under volatility and macro co-escalation states.",
      "Frame recommendation as buyer-side cost-control, not directional speculation.",
    ],
    inferenceConstraints: [
      "Do not recommend one-shot execution when volatility and macro channels remain elevated.",
      "Do not present strategy guidance without explicit downside-tail treatment.",
      "Do not use generic timing language without quantified window tradeoffs.",
    ],
    outputRequirements: [
      "State preferred execution structure and why.",
      "Report cost-control logic in buyer terms.",
      "Include trigger conditions that would invalidate the recommendation.",
    ],
  },
  factorWaterfall: {
    cardTopic: "Cross-Driver Procurement Pressure Ranking",
    strategicObjective:
      "Rank the active drivers by marginal procurement impact and explain causal ordering so purchase cadence can prioritize the right risk channels.",
    neuralConnectionThesis:
      "Procurement risk emerges from driver ordering and interaction effects; ranking volatility, crush, macro, energy, and China channels clarifies which signals should drive immediate action.",
    quantResearchProtocol: [
      "Rank each driver by current pressure, persistence, and transmission intensity.",
      "Test interaction pairs for escalation pathways and conflict states.",
      "Separate dominant drivers from secondary contextual drivers.",
      "Preserve directional uncertainty labels when channels diverge.",
    ],
    inferenceConstraints: [
      "Do not collapse all drivers into a single undifferentiated summary.",
      "Do not hide conflict between top-ranked channels.",
      "Do not assign confidence without data freshness context.",
    ],
    outputRequirements: [
      "Provide ordered driver stack with concise rationale.",
      "Call out interaction risk explicitly.",
      "Translate ranking into procurement monitoring priorities.",
    ],
  },
  riskMetrics: {
    cardTopic: "Buyer Risk Math and Tail Exposure",
    strategicObjective:
      "Express near-term procurement risk using explicit asymmetry, latency risk, and exposure math so decision timing is grounded in quantified downside.",
    neuralConnectionThesis:
      "For buyers, decision latency under elevated risk networks is often more expensive than controlled over-hedging; quantified asymmetry clarifies when faster action is warranted.",
    quantResearchProtocol: [
      "Assess near-term tail asymmetry from active driver network state.",
      "Measure decision-latency risk versus controlled execution-risk tradeoff.",
      "Classify exposure state as contained, elevated, or escalation-prone.",
      "Tie risk statements to buyer-side cost outcomes and cadence impact.",
    ],
    inferenceConstraints: [
      "Do not report neutral risk when asymmetry is elevated.",
      "Do not describe risk posture without latency implications.",
      "Do not omit confidence qualifiers when metrics are stale or sparse.",
    ],
    outputRequirements: [
      "State risk regime and asymmetry in plain buyer terms.",
      "Explain latency risk versus hedge risk comparison.",
      "Provide specific cadence/monitoring recommendation.",
    ],
  },
};

function buildProvenance(
  generatedAt: string,
  tradeDate: string | null,
  cardKey: keyof StrategyCards,
): AiCardProvenance {
  return {
    asOf: tradeDate ?? generatedAt,
    generatedAt,
    method: "daily-ai-card-refresh",
    sourceFeeds: [
      "analytics.market_posture",
      "analytics.dashboard_metrics",
      "analytics.driver_attribution_1d",
      "app/config/dashboard-risk-factors-ai.json",
    ],
    sourceRecords: [
      {
        source: "analytics.market_posture",
        table: "analytics.market_posture",
        recordHint: tradeDate ? `trade_date=${tradeDate}` : "latest row",
        observedAt: tradeDate ?? undefined,
      },
      {
        source: "ai-daily-refresh",
        table: "app/config/strategy-posture-ai.json",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
    notes: [
      "Buyer posture is interpreted for procurement cost control.",
      "Card output is AI-authored with table-linked provenance hints.",
    ],
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const aiSnapshot = await readAiSnapshot<StrategyAiSnapshot>(
      "app/config/strategy-posture-ai.json",
    );

    const { data: row, error } = await supabase
      .schema("analytics")
      .from("market_posture")
      .select("posture, rationale, trade_date")
      .order("trade_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    const dbPosture: StrategyPosture | null = row
      ? {
          posture: row.posture as StrategyPosture["posture"],
          rationale: row.rationale ?? "",
          updatedAt: row.trade_date,
        }
      : null;

    const posture: StrategyPosture | null = aiSnapshot?.posture ?? dbPosture;
    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const tradeDate = row?.trade_date ?? posture?.updatedAt ?? null;

    const fallbackCards: StrategyCards = {
      contractImpactCalculator: {
        title: "Contract Impact Calculator",
        body: "Awaiting daily AI pull for buyer-side contract impact math.",
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.contractImpactCalculator,
        provenance: buildProvenance(generatedAt, tradeDate, "contractImpactCalculator"),
      },
      factorWaterfall: {
        title: "Factor Waterfall",
        body: "Awaiting daily AI pull for ranked factor contribution and causal chain.",
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.factorWaterfall,
        provenance: buildProvenance(generatedAt, tradeDate, "factorWaterfall"),
      },
      riskMetrics: {
        title: "Risk Metrics",
        body: "Awaiting daily AI pull for quantified probability, drawdown, and exposure math.",
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.riskMetrics,
        provenance: buildProvenance(generatedAt, tradeDate, "riskMetrics"),
      },
    };

    const rawCards = aiSnapshot?.cards ?? fallbackCards;
    const cards: StrategyCards = {
      contractImpactCalculator: {
        ...fallbackCards.contractImpactCalculator,
        ...rawCards.contractImpactCalculator,
        strategicSpecialInstructions:
          rawCards.contractImpactCalculator?.strategicSpecialInstructions ??
          STRATEGY_INSTRUCTIONS.contractImpactCalculator,
        provenance:
          rawCards.contractImpactCalculator?.provenance ??
          buildProvenance(generatedAt, tradeDate, "contractImpactCalculator"),
      },
      factorWaterfall: {
        ...fallbackCards.factorWaterfall,
        ...rawCards.factorWaterfall,
        strategicSpecialInstructions:
          rawCards.factorWaterfall?.strategicSpecialInstructions ??
          STRATEGY_INSTRUCTIONS.factorWaterfall,
        provenance:
          rawCards.factorWaterfall?.provenance ??
          buildProvenance(generatedAt, tradeDate, "factorWaterfall"),
      },
      riskMetrics: {
        ...fallbackCards.riskMetrics,
        ...rawCards.riskMetrics,
        strategicSpecialInstructions:
          rawCards.riskMetrics?.strategicSpecialInstructions ??
          STRATEGY_INSTRUCTIONS.riskMetrics,
        provenance:
          rawCards.riskMetrics?.provenance ??
          buildProvenance(generatedAt, tradeDate, "riskMetrics"),
      },
    };

    const envelope: ApiEnvelope<StrategyPosture | null> = {
      ok: true,
      data: posture,
      asOf: new Date().toISOString(),
      source: "analytics.market_posture",
    };

    return NextResponse.json({
      ...envelope,
      cards,
      ai: toAiEnvelopeMeta(aiSnapshot),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
