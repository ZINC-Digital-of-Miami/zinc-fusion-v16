import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, SentimentOverview } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { withAudienceInstructionGuardrails } from "@/lib/server/ai-instruction-guardrails";
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
    cardTopic: "Macro Sentiment Regime",
    strategicObjective:
      "Classify macro sentiment pressure so buyers can judge timing risk before conviction appears in price structure.",
    neuralConnectionThesis:
      "Narrative pressure becomes operationally relevant when volatility and positioning align with it.",
    quantResearchProtocol: [
      "Track narrative persistence and pressure concentration across recent windows.",
      "Classify regime as stable, mixed, stretched, or unstable.",
      "Cross-check regime against volatility context and positioning state.",
      "Translate regime into buyer timing implications.",
    ],
    inferenceConstraints: [
      "Do not infer regime shifts from isolated stories.",
      "Do not use hype language or trader slang.",
      "Do not omit confidence caveats when evidence is thin.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "State sentiment regime and persistence horizon.",
      "Report procurement timing implication with uncertainty clarity.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  } satisfies StrategicSpecialInstructions,
  flowNarrative: {
    cardTopic: "Narrative Flow and Participation Pressure",
    strategicObjective:
      "Determine whether current participation flow is stable, crowded, or fragile for procurement timing decisions.",
    neuralConnectionThesis:
      "Crowded or unstable flow increases reversal risk and decision-latency cost for buyers.",
    quantResearchProtocol: [
      "Measure flow persistence versus burstiness in recent sessions.",
      "Map flow state to sentiment drift and volatility context.",
      "Flag conviction fragility when channels conflict.",
      "Express impact in buyer execution-risk language.",
    ],
    inferenceConstraints: [
      "Do not infer conviction from one-day flow bursts.",
      "Do not overfit flow to direction without regime context.",
      "Do not suppress uncertainty when flow signals conflict.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "Classify flow state with confidence qualifier.",
      "Explain likely impact on buyer timing and slippage risk.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  } satisfies StrategicSpecialInstructions,
  procurementNarrative: {
    cardTopic: "Buyer Procurement Psychology",
    strategicObjective:
      "Convert sentiment and positioning conditions into buyer-ready pacing guidance under uncertainty.",
    neuralConnectionThesis:
      "Explicit pacing rules reduce emotional overreaction and timing regret during unstable sentiment regimes.",
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
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "Provide concrete pacing guidance.",
      "Include explicit reassessment triggers.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  } satisfies StrategicSpecialInstructions,
  positioningFlow: {
    cardTopic: "Managed Money Bias Regime",
    strategicObjective:
      "Determine whether managed-money bias contributes to stabilizing or destabilizing procurement-cost expectations.",
    neuralConnectionThesis:
      "Managed-money bias influences the persistence of commodity moves and can widen procurement timing error when conviction is fragile and volatility is elevated.",
    quantResearchProtocol: [
      "Read the latest managed-money positioning report and classify confidence.",
      "Cross-map bias state to sentiment score and volatility regime.",
      "Differentiate supportive participation from reflexive positioning risk.",
      "Translate bias regime into buyer-facing caution level.",
    ],
    inferenceConstraints: [
      "Do not equate position size with conviction durability.",
      "Do not treat stale managed-money positioning data as real-time certainty.",
      "Do not omit confidence caveats.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "State bias class with confidence caveat.",
      "Explain procurement risk implication.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
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
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "State whether velocity is signal or noise.",
      "Provide monitoring cadence recommendation.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
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
        recordHint: "latest soybean-oil managed-money positioning observation",
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

function stacyMacroNarrativeBody(params: {
  macroTrustedMissing: boolean;
  sentimentScore: number;
  cotBiasLabel: string;
  vix: number | null;
  ovx: number | null;
  cl5dText: string;
}): string {
  if (params.macroTrustedMissing) {
    return "Hard stop: trusted market context is missing, so macro sentiment classification is blocked.";
  }
  const regime =
    params.sentimentScore <= -25 ? "defensive" : params.sentimentScore >= 25 ? "supportive" : "mixed";
  const extremeVol =
    (params.vix !== null && params.vix >= 35) || (params.ovx !== null && params.ovx >= 45);
  const dryLine = extremeVol
    ? "Volatility remains unstable enough to degrade conviction quality."
    : "";
  return `Macro regime is ${regime} with ${params.cotBiasLabel}. The broad volatility gauge is ${params.vix?.toFixed(2) ?? "n/a"}, the oil-volatility gauge is ${params.ovx?.toFixed(2) ?? "n/a"}, and crude oil moved ${params.cl5dText} over five days. ${dryLine}`.trim();
}

function stacyFlowNarrativeBody(params: {
  headlineCount: number;
  flowState: string;
  sourceCount: number;
  tagPhrase: string;
  pulseRatio: number;
}): string {
  if (params.headlineCount === 0) {
    return "Hard stop: no verified sentiment rows in the 7-day window, so flow read is blocked.";
  }
  const coherence =
    params.pulseRatio >= 1.5 ? "noisy and jumpy" : params.pulseRatio >= 1 ? "mixed but tradable" : "thin";
  return `Flow is ${params.flowState} with ${params.sourceCount} active sources; lead clusters: ${params.tagPhrase}. Tape coherence is ${coherence}, so keep execution cadence disciplined.`;
}

function stacyProcurementNarrativeBody(params: {
  macroTrustedMissing: boolean;
  hasCot: boolean;
  sentimentScore: number;
  cotBiasLabel: string;
  vix: number | null;
}): string {
  if (params.macroTrustedMissing || !params.hasCot) {
    return "Hard stop: missing managed-money positioning or trusted-market context blocks procurement pacing guidance.";
  }
  const posture =
    params.sentimentScore <= -25
      ? "defensive with short reassessment windows"
      : params.sentimentScore >= 25
        ? "staged accumulation with discipline"
        : "balanced pacing with coverage flexibility";
  const volState = params.vix !== null && params.vix >= 25 ? "elevated" : "contained";
  return `Buyer posture: ${posture}. Managed-money positioning is ${params.cotBiasLabel}, and volatility transmission is ${volState}. Timing discipline remains more important than reactive urgency.`;
}

function stacyPositioningBody(params: { hasCot: boolean; cotBiasLabel: string; observationDate: string | null }): string {
  if (!params.hasCot) return "Hard stop: no verified managed-money positioning observation is available.";
  return `Managed-money posture is ${params.cotBiasLabel} (observation ${params.observationDate ?? "missing"}). Treat this as context, not a solo trigger.`;
}

function stacyHeadlineFlowBody(params: {
  headlineCount: number;
  flowState: string;
  sourceCount: number;
  tagPhrase: string;
}): string {
  if (params.headlineCount === 0) {
    return "Hard stop: headline-flow guidance is blocked because the verified 7-day feed is empty.";
  }
  return `Headline velocity is ${params.flowState}; source breadth is ${params.sourceCount}; active clusters: ${params.tagPhrase}. Monitor persistence before changing pace.`;
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

    const [{ data: newsRows, error: newsError }, { data: cftcRow }, { data: metricRows }] = await Promise.all([
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
      supabase
        .schema("analytics")
        .from("dashboard_metrics")
        .select("trade_date, metric_key, metric_value")
        .order("trade_date", { ascending: false })
        .limit(300),
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

    const latestMetricDate = metricRows?.[0]?.trade_date ?? null;
    const latestMetrics = (metricRows ?? []).filter((row) => row.trade_date === latestMetricDate);
    const metricMap = new Map<string, number>();
    for (const metric of latestMetrics) {
      const parsed = Number(metric.metric_value);
      if (Number.isFinite(parsed)) {
        metricMap.set(String(metric.metric_key).toLowerCase(), parsed);
      }
    }

    const dbVix = metricMap.get("vix_value") ?? null;
    const dbOvx = metricMap.get("ovx_value") ?? null;
    const dbCl5d = metricMap.get("cl_change_5d") ?? metricMap.get("crude_oil_change_5d") ?? null;

    const vix = trustedMarket.vix.value ?? dbVix;
    const ovx = trustedMarket.ovx.value ?? dbOvx;
    const cl5d = trustedMarket.cl.change5d ?? dbCl5d;
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
          body: stacyMacroNarrativeBody({
            macroTrustedMissing,
            sentimentScore,
            cotBiasLabel,
            vix,
            ovx,
            cl5dText,
          }),
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.macroNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "macroNarrative", trustedUrls),
        },
        {
          title: "Flow Narrative",
          body: stacyFlowNarrativeBody({
            headlineCount,
            flowState,
            sourceCount: sourceSet.size,
            tagPhrase,
            pulseRatio,
          }),
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.flowNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "flowNarrative", trustedUrls),
        },
        {
          title: "Procurement Narrative",
          body: stacyProcurementNarrativeBody({
            macroTrustedMissing,
            hasCot: Boolean(cftcRow),
            sentimentScore,
            cotBiasLabel,
            vix,
          }),
          strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.procurementNarrative,
          provenance: buildProvenance(generatedAt, overview.updatedAt, "procurementNarrative", trustedUrls),
        },
      ],
      positioningFlow: {
        title: "Managed Money Positioning",
        body: stacyPositioningBody({
          hasCot: Boolean(cftcRow),
          cotBiasLabel,
          observationDate: cftcRow?.observation_date ?? null,
        }),
        strategicSpecialInstructions: SENTIMENT_INSTRUCTIONS.positioningFlow,
        provenance: buildProvenance(generatedAt, overview.updatedAt, "positioningFlow", trustedUrls),
      },
      headlineFlow: {
        title: "Headline Flow",
        body: stacyHeadlineFlowBody({
          headlineCount,
          flowState,
          sourceCount: sourceSet.size,
          tagPhrase,
        }),
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
          withAudienceInstructionGuardrails(
            raw?.strategicSpecialInstructions ?? fallback.strategicSpecialInstructions,
            "chris",
          ),
        provenance: raw?.provenance ?? fallback.provenance,
      } as AiCardContent;
    }) as [AiCardContent, AiCardContent, AiCardContent];

    const cards: SentimentCards = {
      narratives: mergedNarratives,
      positioningFlow: {
        ...fallbackCards.positioningFlow,
        ...rawCards.positioningFlow,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.positioningFlow?.strategicSpecialInstructions ??
              fallbackCards.positioningFlow.strategicSpecialInstructions,
            "chris",
          ),
        provenance:
          rawCards.positioningFlow?.provenance ?? fallbackCards.positioningFlow.provenance,
      },
      headlineFlow: {
        ...fallbackCards.headlineFlow,
        ...rawCards.headlineFlow,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.headlineFlow?.strategicSpecialInstructions ??
              fallbackCards.headlineFlow.strategicSpecialInstructions,
            "chris",
          ),
        provenance: rawCards.headlineFlow?.provenance ?? fallbackCards.headlineFlow.provenance,
      },
    };

    const voicedCards: SentimentCards = {
      ...cards,
      narratives: [
        {
          ...cards.narratives[0],
          body: stacyMacroNarrativeBody({
            macroTrustedMissing,
            sentimentScore,
            cotBiasLabel,
            vix,
            ovx,
            cl5dText,
          }),
        },
        {
          ...cards.narratives[1],
          body: stacyFlowNarrativeBody({
            headlineCount,
            flowState,
            sourceCount: sourceSet.size,
            tagPhrase,
            pulseRatio,
          }),
        },
        {
          ...cards.narratives[2],
          body: stacyProcurementNarrativeBody({
            macroTrustedMissing,
            hasCot: Boolean(cftcRow),
            sentimentScore,
            cotBiasLabel,
            vix,
          }),
        },
      ],
      positioningFlow: {
        ...cards.positioningFlow,
        body: stacyPositioningBody({
          hasCot: Boolean(cftcRow),
          cotBiasLabel,
          observationDate: cftcRow?.observation_date ?? null,
        }),
      },
      headlineFlow: {
        ...cards.headlineFlow,
        body: stacyHeadlineFlowBody({
          headlineCount,
          flowState,
          sourceCount: sourceSet.size,
          tagPhrase,
        }),
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
      cards: voicedCards,
      ai: toAiEnvelopeMeta(aiSnapshot),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
