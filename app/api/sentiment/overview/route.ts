import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, SentimentOverview } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createServerDataClient } from "@/lib/server/server-data-client";
import {
  fetchTrustedMarketSnapshot,
  TRUSTED_MARKET_SOURCE_FEEDS,
  uniqueTrustedMarketUrls,
} from "@/lib/server/trusted-market-sources";

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
  trustedUrls: string[],
): AiCardProvenance {
  return {
    asOf: updatedAt,
    generatedAt,
    method: "verified-db-and-trusted-market-pull",
    sourceFeeds: ["alt.news_events", "mkt.cftc_1w", ...trustedUrls],
    sourceRecords: [
      {
        source: "alt.news_events",
        table: "alt.news_events",
        recordHint: "latest 7-day sentiment rows",
        observedAt: updatedAt,
      },
      {
        source: "mkt.cftc_1w",
        table: "mkt.cftc_1w",
        recordHint: "symbol=ZL latest observation",
        observedAt: updatedAt,
      },
      {
        source: "trusted-market-pull",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
    notes: [
      "Narrative output is buyer-facing procurement interpretation from verified rows.",
      "Hard stop language is required when market or flow evidence is missing.",
    ],
  };
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();
    const aiSnapshot = await readAiSnapshot<SentimentAiSnapshot>(
      "app/config/sentiment-overview-ai.json",
    );
    const trustedMarket = await fetchTrustedMarketSnapshot();
    const trustedUrls = uniqueTrustedMarketUrls(trustedMarket);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [{ data: newsRows, error: newsError }, { data: cftcRow }] = await Promise.all([
      supabase
        .schema("alt")
        .from("news_events")
        .select("source, published_at, specialist_tags")
        .gte("published_at", sevenDaysAgo.toISOString())
        .order("published_at", { ascending: false })
        .limit(300),
      supabase
        .schema("mkt")
        .from("cftc_1w")
        .select("observation_date, payload")
        .eq("symbol", "ZL")
        .order("observation_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (newsError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: newsError.message },
        { status: 500 },
      );
    }

    const rows = newsRows ?? [];
    const headlineCount = rows.length;
    const last24h = rows.filter((row) => new Date(row.published_at).getTime() >= oneDayAgo.getTime()).length;
    const pulseRatio = headlineCount > 0 ? last24h / Math.max(1, headlineCount / 7) : 0;
    const flowState = pulseRatio >= 1.5 ? "elevated" : pulseRatio >= 1 ? "balanced" : "subdued";

    const sourceSet = new Set<string>();
    const tagCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.source) sourceSet.add(row.source);
      const tags = Array.isArray(row.specialist_tags) ? row.specialist_tags : [];
      for (const tag of tags) {
        const normalized = String(tag).trim();
        if (!normalized) continue;
        tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
      }
    }
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);
    const tagPhrase = topTags.length > 0 ? topTags.join(", ") : "no dominant specialist cluster";

    const cotPayload = cftcRow?.payload as Record<string, unknown> | null;
    const cotBias = (cotPayload?.bias as string) ?? "neutral";
    const cotBiasNorm = cotBias.trim().toLowerCase();
    const cotBiasLabel =
      cotBiasNorm.includes("bull") ? "bullish bias" : cotBiasNorm.includes("bear") ? "bearish bias" : "neutral bias";
    const cotBiasScore = cotBiasNorm.includes("bull") ? 20 : cotBiasNorm.includes("bear") ? -20 : 0;

    const vix = trustedMarket.vix.value;
    const ovx = trustedMarket.ovx.value;
    const cl5d = trustedMarket.cl.change5d;
    const cl5dText =
      cl5d === null ? "n/a" : `${cl5d * 100 >= 0 ? "+" : ""}${(cl5d * 100).toFixed(2)}%`;
    const macroTrustedMissing = vix === null && ovx === null && cl5d === null;
    const volatilityPenalty =
      (vix !== null && vix >= 25 ? -14 : vix !== null && vix < 18 ? 6 : 0) +
      (ovx !== null && ovx >= 35 ? -10 : ovx !== null && ovx < 26 ? 4 : 0) +
      (cl5d !== null && Math.abs(cl5d) >= 0.04 ? -8 : cl5d !== null && Math.abs(cl5d) <= 0.015 ? 4 : 0);
    const flowPenalty = pulseRatio >= 1.5 ? -12 : pulseRatio < 0.8 ? 5 : 0;
    const sentimentScore = Math.max(-100, Math.min(100, cotBiasScore + volatilityPenalty + flowPenalty));

    const dbOverview: SentimentOverview = {
      headlineCount: headlineCount ?? 0,
      sentimentScore,
      cotBias,
      updatedAt:
        rows[0]?.published_at ??
        (cftcRow?.observation_date ? `${cftcRow.observation_date}T00:00:00Z` : trustedMarket.fetchedAt),
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
          body: macroTrustedMissing
            ? "Hard stop: trusted Yahoo/FRED market context is unavailable; macro narrative classification is blocked."
            : `Macro pressure is ${sentimentScore <= -25 ? "defensive" : sentimentScore >= 25 ? "supportive" : "mixed"} with ${cotBiasLabel}. VIX ${vix?.toFixed(2) ?? "n/a"}, OVX ${ovx?.toFixed(2) ?? "n/a"}, and CL 5-day ${cl5dText} frame near-term narrative risk.`,
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.macroNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "macroNarrative", trustedUrls),
        },
        {
          title: "Flow Narrative",
          body: headlineCount === 0
            ? "Hard stop: no verified alt.news_events rows in the last 7 days; flow narrative is blocked."
            : `Flow regime is ${flowState} with ${sourceSet.size} active sources and dominant specialist cluster: ${tagPhrase}. Velocity coherence is ${pulseRatio >= 1.5 ? "high-risk noisy" : pulseRatio >= 1 ? "tradable but mixed" : "low-intensity"} for buyer timing decisions.`,
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.flowNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "flowNarrative", trustedUrls),
        },
        {
          title: "Procurement Narrative",
          body: macroTrustedMissing || !cftcRow
            ? "Hard stop: missing verified CoT or trusted market context prevents buyer-facing procurement narrative."
            : `Buyer pacing should remain ${sentimentScore <= -25 ? "defensive with tighter reassessment windows" : sentimentScore >= 25 ? "opportunistic staged accumulation" : "balanced with optionality preserved"}. CoT is ${cotBiasLabel} and volatility transmission remains ${vix !== null && vix >= 25 ? "elevated" : "contained"} at current read.`,
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.procurementNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "procurementNarrative", trustedUrls),
        },
      ],
      positioningFlow: {
        title: "Managed Money Positioning",
        body: !cftcRow
          ? "Hard stop: no verified mkt.cftc_1w observation for ZL is available."
          : `Latest CoT posture is ${cotBiasLabel} (observation ${cftcRow.observation_date}). Use this as directional conviction context, not a standalone execution trigger.`,
        strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.positioningFlow,
        provenance: buildProvenance(generatedAt, overview.updatedAt, "positioningFlow", trustedUrls),
      },
      headlineFlow: {
        title: "Headline Flow",
        body: headlineCount === 0
          ? "Hard stop: headline-flow narrative is blocked because no verified alt.news_events rows were found in the current 7-day window."
          : `Headline velocity is ${flowState}. Source breadth is ${sourceSet.size} and the dominant specialist cluster is ${tagPhrase}. Treat this as signal only when persistence remains coherent with volatility and CoT bias.`,
        strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.headlineFlow,
        provenance: buildProvenance(generatedAt, overview.updatedAt, "headlineFlow", trustedUrls),
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
      source: ["alt.news_events", "mkt.cftc_1w", ...TRUSTED_MARKET_SOURCE_FEEDS].join(","),
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
