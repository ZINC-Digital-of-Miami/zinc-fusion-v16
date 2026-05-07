import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, SentimentOverview } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

type SentimentCards = {
  narratives: [AiCardContent, AiCardContent, AiCardContent];
  positioningFlow: AiCardContent;
  headlineFlow: AiCardContent;
};

type SentimentAiSnapshot = {
  overview?: Partial<SentimentOverview>;
  cards?: SentimentCards;
} & AiSnapshotMeta;

const SENTIMENT_INSTRUCTIONS = {
  macroNarrative: {
    cardTopic: "Macro Policy Sentiment Transmission",
    strategicObjective:
      "Classify macro and policy narrative pressure regimes that can change soybean oil procurement timing risk before hard price confirmation.",
    neuralConnectionThesis:
      "Macro-policy narrative clusters alter risk-premium expectations and can accelerate commodity repricing when volatility and energy channels confirm.",
    quantResearchProtocol: [
      "Track macro-policy narrative density and persistence over rolling windows.",
      "Segment narrative shocks into transient versus regime-shift classes.",
      "Cross-check narrative regime against volatility and energy coherence.",
      "Translate narrative class into buyer-side procurement urgency levels.",
    ],
    inferenceConstraints: [
      "Do not classify regime shifts from isolated stories.",
      "Do not ignore conflicting channel evidence.",
      "Do not emit generic sentiment language without buyer impact.",
    ],
    outputRequirements: [
      "State macro sentiment regime and persistence horizon.",
      "Report risk implication for procurement timing.",
      "Provide confirm/deconfirm triggers for escalation.",
    ],
  } satisfies StrategicSpecialInstructions,
  flowNarrative: {
    cardTopic: "Positioning and Participation Flow Sentiment",
    strategicObjective:
      "Interpret whether current positioning flow supports stable price discovery or increases fragility for procurement execution windows.",
    neuralConnectionThesis:
      "When managed-money and participation flow become conditional, markets exhibit lower follow-through and higher reversal risk, increasing decision-latency cost for buyers.",
    quantResearchProtocol: [
      "Evaluate flow persistence versus burstiness in recent sessions.",
      "Map flow state to sentiment score drift and volatility context.",
      "Detect conviction fragility under mixed channel alignment.",
      "Express flow implications in buyer execution-risk language.",
    ],
    inferenceConstraints: [
      "Do not infer conviction from one-day flow bursts.",
      "Do not overfit flow to direction without regime context.",
      "Do not suppress uncertainty when flow signals conflict.",
    ],
    outputRequirements: [
      "Classify flow state with confidence qualifier.",
      "Explain likely impact on execution slippage risk.",
      "Provide near-term monitoring focus.",
    ],
  } satisfies StrategicSpecialInstructions,
  procurementNarrative: {
    cardTopic: "Buyer Procurement Psychology",
    strategicObjective:
      "Convert sentiment and flow conditions into buyer-ready pacing guidance that minimizes timing regret under uncertainty.",
    neuralConnectionThesis:
      "Procurement outcomes improve when psychological regime cues are converted into explicit pacing and reassessment cadence rules rather than ad-hoc reaction.",
    quantResearchProtocol: [
      "Combine sentiment score, flow state, and macro regime into a buyer posture.",
      "Score decision-latency risk versus over-hedge risk under current regime.",
      "Align guidance to staged-execution logic when channel correlation is high.",
      "State invalidation conditions for posture changes.",
    ],
    inferenceConstraints: [
      "Do not recommend static cadence in elevated mixed-risk states.",
      "Do not issue binary buy/wait calls without uncertainty framing.",
      "Do not ignore asymmetric downside scenarios.",
    ],
    outputRequirements: [
      "Provide concrete pacing guidance.",
      "State why buyer psychology risk is elevated or contained.",
      "Include explicit reassessment triggers.",
    ],
  } satisfies StrategicSpecialInstructions,
  positioningFlow: {
    cardTopic: "Managed Money Bias Regime",
    strategicObjective:
      "Determine whether managed-money bias contributes to stabilizing or destabilizing procurement-cost expectations.",
    neuralConnectionThesis:
      "Managed-money bias influences the persistence of commodity moves and can widen procurement timing error when conviction is fragile and volatility is elevated.",
    quantResearchProtocol: [
      "Read latest CoT-linked bias state and classify confidence.",
      "Cross-map bias state to sentiment score and volatility regime.",
      "Differentiate supportive participation from reflexive positioning risk.",
      "Translate bias regime into buyer-facing caution level.",
    ],
    inferenceConstraints: [
      "Do not equate position size with conviction durability.",
      "Do not treat stale CoT inputs as real-time certainty.",
      "Do not omit confidence caveats.",
    ],
    outputRequirements: [
      "State bias class and confidence.",
      "Explain procurement risk implication.",
      "Specify what would change the bias interpretation.",
    ],
  } satisfies StrategicSpecialInstructions,
  headlineFlow: {
    cardTopic: "Headline Velocity and Regime Coherence",
    strategicObjective:
      "Assess whether headline velocity is producing actionable regime signal or noisy churn for procurement decisions.",
    neuralConnectionThesis:
      "Headline velocity only becomes actionable when persistence and cross-channel coherence are present; otherwise it inflates noise and overreaction risk.",
    quantResearchProtocol: [
      "Measure 24h/7d headline velocity and cluster concentration.",
      "Classify cluster persistence by macro, policy, and energy channels.",
      "Validate coherence with sentiment score directionality.",
      "Link outcome to procurement monitoring frequency.",
    ],
    inferenceConstraints: [
      "Do not infer regime shifts from velocity alone.",
      "Do not ignore channel concentration effects.",
      "Do not provide cadence advice without coherence check.",
    ],
    outputRequirements: [
      "State whether velocity is signal or noise.",
      "Describe expected persistence horizon.",
      "Provide monitoring cadence recommendation.",
    ],
  } satisfies StrategicSpecialInstructions,
} as const;

function buildProvenance(
  generatedAt: string,
  updatedAt: string,
  cardKey: string,
): AiCardProvenance {
  return {
    asOf: updatedAt,
    generatedAt,
    method: "daily-ai-card-refresh",
    sourceFeeds: ["alt.news_events", "mkt.cftc_1w", "app/config/sentiment-overview-ai.json"],
    sourceRecords: [
      {
        source: "alt.news_events",
        table: "alt.news_events",
        recordHint: "last_7d_count",
        observedAt: updatedAt,
      },
      {
        source: "mkt.cftc_1w",
        table: "mkt.cftc_1w",
        recordHint: "symbol=ZL latest observation",
        observedAt: updatedAt,
      },
      {
        source: "ai-daily-refresh",
        table: "app/config/sentiment-overview-ai.json",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
    notes: [
      "Headline-count metrics are retained for model context but hidden from UI to reduce noise.",
      "Narrative output is buyer-facing procurement interpretation.",
    ],
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const aiSnapshot = await readAiSnapshot<SentimentAiSnapshot>(
      "app/config/sentiment-overview-ai.json",
    );

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { count: headlineCount, error: newsError } = await supabase
      .schema("alt")
      .from("news_events")
      .select("id", { count: "exact", head: true })
      .gte("published_at", sevenDaysAgo.toISOString());

    if (newsError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: newsError.message },
        { status: 500 },
      );
    }

    const { data: cftcRow } = await supabase
      .schema("mkt")
      .from("cftc_1w")
      .select("observation_date, payload")
      .eq("symbol", "ZL")
      .order("observation_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cotPayload = cftcRow?.payload as Record<string, unknown> | null;
    const cotBias = (cotPayload?.bias as string) ?? "neutral";

    const dbOverview: SentimentOverview = {
      headlineCount: headlineCount ?? 0,
      sentimentScore: 0,
      cotBias,
      updatedAt: new Date().toISOString(),
    };

    const overview: SentimentOverview = {
      headlineCount: aiSnapshot?.overview?.headlineCount ?? dbOverview.headlineCount,
      sentimentScore: aiSnapshot?.overview?.sentimentScore ?? dbOverview.sentimentScore,
      cotBias: aiSnapshot?.overview?.cotBias ?? dbOverview.cotBias,
      updatedAt: aiSnapshot?.overview?.updatedAt ?? dbOverview.updatedAt,
    };

    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const fallbackCards: SentimentCards = {
      narratives: [
        {
          title: "Macro Narrative",
          body: "Awaiting daily AI pull for macro and policy narrative classification.",
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.macroNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "macroNarrative"),
        },
        {
          title: "Flow Narrative",
          body: "Awaiting daily AI pull for positioning and participation flow interpretation.",
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.flowNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "flowNarrative"),
        },
        {
          title: "Procurement Narrative",
          body: "Awaiting daily AI pull for buyer-facing procurement interpretation.",
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.procurementNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "procurementNarrative"),
        },
      ],
      positioningFlow: {
        title: "Managed Money Positioning",
        body: "Awaiting daily AI pull for positioning-pressure interpretation.",
        strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.positioningFlow,
        provenance: buildProvenance(generatedAt, overview.updatedAt, "positioningFlow"),
      },
      headlineFlow: {
        title: "Headline Flow",
        body: "Awaiting daily AI pull for headline velocity interpretation.",
        strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.headlineFlow,
        provenance: buildProvenance(generatedAt, overview.updatedAt, "headlineFlow"),
      },
    };

    const rawCards = aiSnapshot?.cards ?? fallbackCards;
    const mergedNarratives = [0, 1, 2].map((idx) => {
      const fallback = fallbackCards.narratives[idx];
      const raw = rawCards.narratives?.[idx];
      return {
        ...fallback,
        ...raw,
        strategicSpecialInstructions:
          raw?.strategicSpecialInstructions ?? fallback.strategicSpecialInstructions,
        provenance: raw?.provenance ?? fallback.provenance,
      } as AiCardContent;
    }) as [AiCardContent, AiCardContent, AiCardContent];

    const cards: SentimentCards = {
      narratives: mergedNarratives,
      positioningFlow: {
        ...fallbackCards.positioningFlow,
        ...rawCards.positioningFlow,
        strategicSpecialInstructions:
          rawCards.positioningFlow?.strategicSpecialInstructions ??
          fallbackCards.positioningFlow.strategicSpecialInstructions,
        provenance:
          rawCards.positioningFlow?.provenance ?? fallbackCards.positioningFlow.provenance,
      },
      headlineFlow: {
        ...fallbackCards.headlineFlow,
        ...rawCards.headlineFlow,
        strategicSpecialInstructions:
          rawCards.headlineFlow?.strategicSpecialInstructions ??
          fallbackCards.headlineFlow.strategicSpecialInstructions,
        provenance: rawCards.headlineFlow?.provenance ?? fallbackCards.headlineFlow.provenance,
      },
    };

    const envelope: ApiEnvelope<SentimentOverview | null> = {
      ok: true,
      data: overview,
      asOf: new Date().toISOString(),
      source: "alt.news_events,mkt.cftc_1w",
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
