import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, StrategyPosture } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { withAudienceInstructionGuardrails } from "@/lib/server/ai-instruction-guardrails";
import { createServerDataClient } from "@/lib/server/server-data-client";
import {
  fetchTrustedMarketSnapshot,
  TRUSTED_MARKET_SOURCE_FEEDS,
  uniqueTrustedMarketUrls,
} from "@/lib/server/trusted-market-sources";

type StrategyCards = {
  marketPosture: AiCardContent;
  contractImpactCalculator: AiCardContent;
  factorWaterfall: AiCardContent;
  riskMetrics: AiCardContent;
};

type StrategyAiSnapshot = {
  posture?: StrategyPosture;
  cards?: StrategyCards;
} & AiSnapshotMeta;

const STRATEGY_INSTRUCTIONS: Record<keyof StrategyCards, StrategicSpecialInstructions> = {
  marketPosture: {
    cardTopic: "Buyer Operating Stance",
    strategicObjective:
      "State the current procurement stance decisively for Chris Stacy so buyer execution stays disciplined under volatility.",
    neuralConnectionThesis:
      "A clear operating stance reduces decision drift when market headlines and timing pressure become noisy.",
    quantResearchProtocol: [
      "Validate posture enum strictly as ACCUMULATE, WAIT, or DEFER.",
      "Anchor stance language to buyer-side timing and coverage risk.",
      "Keep the read short enough to scan in seconds.",
      "Use controlled dry humor only when it clarifies stress, never as filler.",
    ],
    inferenceConstraints: [
      "Do not use trader-centric language or directional trade framing.",
      "Do not output more than three sentences.",
      "Do not overstate certainty when evidence freshness is weak.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Provide one decisive stance sentence in procurement language.",
      "Add one evidence-linked sentence on timing pressure.",
      "Include at most one short dry-humor line when stress context warrants it.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  },
  contractImpactCalculator: {
    cardTopic: "Buyer-Side Contract Window Impact",
    strategicObjective:
      "Quantify staged-buy versus single-window contract execution for Chris Stacy under current volatility, crush, and macro tail conditions.",
    neuralConnectionThesis:
      "Execution cost dispersion increases non-linearly when volatility transmission and macro-policy stress co-align; tranche-based timing reduces adverse selection probability for buyers.",
    quantResearchProtocol: [
      "Estimate scenario-weighted cost outcomes across staggered execution windows.",
      "Compare one-shot entry slippage risk versus staged entry variance reduction.",
      "Include downside tail amplification under volatility and macro co-escalation states.",
      "Frame recommendation as buyer-side cost-control, not directional speculation.",
      "Keep output concise: one to three high-signal sentences.",
    ],
    inferenceConstraints: [
      "Do not recommend one-shot execution when volatility and macro channels remain elevated.",
      "Do not present strategy guidance without explicit downside-tail treatment.",
      "Do not use generic timing language without quantified window tradeoffs.",
      "Do not use trader slang, hype, or newsroom tone.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "State preferred execution structure and why.",
      "Report cost-control logic in buyer terms.",
      "Include trigger conditions that would invalidate the recommendation.",
      "Use dry humor sparingly and only to reduce tension without diluting clarity.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  },
  factorWaterfall: {
    cardTopic: "Cross-Driver Procurement Pressure Ranking",
    strategicObjective:
      "Rank the active drivers by marginal procurement impact for Chris Stacy and explain causal ordering so purchase cadence prioritizes the right channels.",
    neuralConnectionThesis:
      "Procurement risk emerges from driver ordering and interaction effects; ranking volatility, crush, macro, energy, and China channels clarifies which signals should drive immediate action.",
    quantResearchProtocol: [
      "Rank each driver by current pressure, persistence, and transmission intensity.",
      "Test interaction pairs for escalation pathways and conflict states.",
      "Separate dominant drivers from secondary contextual drivers.",
      "Preserve directional uncertainty labels when channels diverge.",
      "Keep the narrative compact and visually supportive.",
    ],
    inferenceConstraints: [
      "Do not collapse all drivers into a single undifferentiated summary.",
      "Do not hide conflict between top-ranked channels.",
      "Do not assign confidence without data freshness context.",
      "Do not restate obvious chart movement.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "Provide ordered driver stack with concise rationale.",
      "Call out interaction risk explicitly.",
      "Translate ranking into procurement monitoring priorities.",
      "Use one controlled cynical line at most when pressure concentration is elevated.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  },
  riskMetrics: {
    cardTopic: "Buyer Risk Math and Tail Exposure",
    strategicObjective:
      "Express near-term procurement risk for Chris Stacy using explicit asymmetry, latency risk, and exposure math so timing stays grounded in quantified downside.",
    neuralConnectionThesis:
      "For buyers, decision latency under elevated risk networks is often more expensive than controlled over-hedging; quantified asymmetry clarifies when faster action is warranted.",
    quantResearchProtocol: [
      "Assess near-term tail asymmetry from active driver network state.",
      "Measure decision-latency risk versus controlled execution-risk tradeoff.",
      "Classify exposure state as contained, elevated, or escalation-prone.",
      "Tie risk statements to buyer-side cost outcomes and cadence impact.",
      "Keep commentary concise and mathematically anchored.",
    ],
    inferenceConstraints: [
      "Do not report neutral risk when asymmetry is elevated.",
      "Do not describe risk posture without latency implications.",
      "Do not omit confidence qualifiers when metrics are stale or sparse.",
      "Do not imply guaranteed outcomes.",
      "Do not use technical or analyst jargon; write for a CEO audience.",
      "Do not use ticker symbols or unexplained acronyms in output text.",
    ],
    outputRequirements: [
      "State risk regime and asymmetry in plain buyer terms.",
      "Explain latency risk versus hedge risk comparison.",
      "Provide specific cadence/monitoring recommendation.",
      "Use one dry-humor line maximum and keep it operationally relevant.",
      "Use plain executive language that Chris Stacy can scan in seconds.",
    ],
  },
};

function stacyMarketPostureBody(params: {
  posture: StrategyPosture | null;
  volatilityLine: string;
}): string {
  if (!params.posture) return "Hard stop: no verified strategy posture data returned.";
  const stance =
    params.posture.posture === "ACCUMULATE"
      ? "ACCUMULATE remains active because delay risk is still more expensive than staged coverage."
      : params.posture.posture === "WAIT"
        ? "WAIT remains active because buyers are not being paid to chase unstable prints."
        : "DEFER remains active because timing instability still outweighs immediate coverage urgency.";
  return `${stance} ${params.volatilityLine}`;
}

function stacyContractImpactBody(params: {
  noTrustedFeeds: boolean;
  crudeLine: string;
  liveVix: number | null;
  liveOvx: number | null;
  liveCl5d: number | null;
}): string {
  if (params.noTrustedFeeds) {
    return "Hard stop: multi-source market evidence is unavailable, so contract-impact guidance is blocked.";
  }
  const extremeChaos =
    (params.liveVix !== null && params.liveVix >= 35) ||
    (params.liveOvx !== null && params.liveOvx >= 45) ||
    (params.liveCl5d !== null && Math.abs(params.liveCl5d) >= 0.06);
  const dryLine = extremeChaos
    ? "Volatility is still unruly enough to punish one-window execution."
    : "";
  return `Staged coverage remains preferred because single-window timing risk is still elevated. ${params.crudeLine} ${dryLine}`.trim();
}

function stacyFactorWaterfallBody(params: {
  topFactors: string[];
  topContribution: number | null;
  avgContribution: number | null;
}): string {
  if (params.topFactors.length === 0) {
    return "Hard stop: no verified attribution rows available in analytics.driver_attribution_1d.";
  }
  const concentration =
    params.topContribution !== null && params.avgContribution !== null && params.topContribution >= params.avgContribution * 1.5
      ? "concentrated"
      : "mixed";
  return `Verified pressure stack: ${params.topFactors.join(", ")}. Pressure concentration is ${concentration}, so monitoring priority should stay tight on the lead lanes.`;
}

function stacyRiskMetricsBody(params: {
  noTrustedFeeds: boolean;
  volatilityLine: string;
  crudeLine: string;
}): string {
  if (params.noTrustedFeeds) {
    return "Hard stop: trusted volatility and crude metrics are unavailable; buyer risk-math output is blocked until verified feeds recover.";
  }
  return `${params.volatilityLine} ${params.crudeLine} Waiting risk still outweighs over-coverage risk.`;
}

function buildProvenance(
  generatedAt: string,
  tradeDate: string | null,
  cardKey: keyof StrategyCards,
  trustedUrls: string[],
): AiCardProvenance {
  return {
    asOf: tradeDate ?? generatedAt,
    generatedAt,
    method: "verified-db-and-trusted-market-pull",
    sourceFeeds: [
      "analytics.market_posture",
      "analytics.dashboard_metrics",
      "analytics.driver_attribution_1d",
      ...trustedUrls,
    ],
    sourceRecords: [
      {
        source: "analytics.market_posture",
        table: "analytics.market_posture",
        recordHint: tradeDate ? `trade_date=${tradeDate}` : "latest row",
        observedAt: tradeDate ?? undefined,
      },
      {
        source: "analytics.driver_attribution_1d",
        table: "analytics.driver_attribution_1d",
        recordHint: `card=${cardKey}`,
        observedAt: tradeDate ?? generatedAt,
      },
    ],
    notes: [
      "Buyer posture is interpreted from verified table and market-source pulls.",
      "Hard stop is applied when required driver or market evidence is missing.",
    ],
  };
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();
    const aiSnapshot = await readAiSnapshot<StrategyAiSnapshot>(
      "app/config/strategy-posture-ai.json",
    );
    const trustedMarket = await fetchTrustedMarketSnapshot();
    const trustedUrls = uniqueTrustedMarketUrls(trustedMarket);

    const [{ data: row, error }, { data: attributionRows }, { data: metricRows }] = await Promise.all([
      supabase
        .schema("analytics")
        .from("market_posture")
        .select("posture, rationale, trade_date")
        .order("trade_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .schema("analytics")
        .from("driver_attribution_1d")
        .select("trade_date, rank, factor, contribution")
        .order("trade_date", { ascending: false })
        .order("rank", { ascending: true })
        .limit(40),
      supabase
        .schema("analytics")
        .from("dashboard_metrics")
        .select("trade_date, metric_key, metric_value")
        .order("trade_date", { ascending: false })
        .limit(300),
    ]);

    if (error) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    const latestAttrDate = attributionRows?.[0]?.trade_date ?? null;
    const latestAttr = (attributionRows ?? []).filter((r) => r.trade_date === latestAttrDate);
    const attrContributions = latestAttr.map((r) => Number(r.contribution)).filter((n) => Number.isFinite(n));
    const topContribution = attrContributions[0] ?? null;
    const avgContribution =
      attrContributions.length > 0
        ? attrContributions.reduce((sum, value) => sum + value, 0) / attrContributions.length
        : null;
    const topFactors = latestAttr
      .slice(0, 4)
      .map((r) => `${String(r.factor)} (${Number(r.contribution).toFixed(2)})`);

    const latestMetricDate = metricRows?.[0]?.trade_date ?? null;
    const latestMetrics = (metricRows ?? []).filter((r) => r.trade_date === latestMetricDate);
    const metricMap = new Map<string, number>();
    for (const rowMetric of latestMetrics) {
      const n = Number(rowMetric.metric_value);
      if (Number.isFinite(n)) {
        metricMap.set(String(rowMetric.metric_key).toLowerCase(), n);
      }
    }

    const dbVix = metricMap.get("vix_value") ?? null;
    const dbOvx = metricMap.get("ovx_value") ?? null;
    const dbCl5d = metricMap.get("cl_change_5d") ?? metricMap.get("crude_oil_change_5d") ?? null;
    const liveVix = trustedMarket.vix.value ?? dbVix;
    const liveOvx = trustedMarket.ovx.value ?? dbOvx;
    const liveCl5d = trustedMarket.cl.change5d ?? dbCl5d;

    const dbPosture: StrategyPosture | null = row
      ? {
          posture: row.posture as StrategyPosture["posture"],
          rationale: row.rationale ?? "",
          updatedAt: row.trade_date ?? new Date().toISOString(),
        }
      : null;

    const posture: StrategyPosture | null = aiSnapshot?.posture ?? dbPosture;
    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const tradeDate = row?.trade_date ?? posture?.updatedAt ?? null;
    const volatilityLine =
      liveVix !== null && liveOvx !== null
        ? `The broad volatility gauge is ${liveVix.toFixed(2)} and the oil-volatility gauge is ${liveOvx.toFixed(2)}, keeping timing instability elevated.`
        : "Hard stop: verified volatility readings are unavailable.";
    const crudeLine =
      liveCl5d !== null
        ? `Crude oil moved ${(liveCl5d * 100).toFixed(2)}% over five days, which keeps cost pass-through risk active.`
        : "Hard stop: verified crude oil five-day movement is unavailable.";
    const noTrustedFeeds =
      liveVix === null && liveOvx === null && liveCl5d === null;

    const fallbackCards: StrategyCards = {
      marketPosture: {
        title: "Market Posture",
        body: stacyMarketPostureBody({
          posture,
          volatilityLine,
        }),
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.marketPosture,
        provenance: buildProvenance(generatedAt, tradeDate, "marketPosture", trustedUrls),
      },
      contractImpactCalculator: {
        title: "Contract Impact Calculator",
        body: stacyContractImpactBody({
          noTrustedFeeds,
          crudeLine,
          liveVix,
          liveOvx,
          liveCl5d,
        }),
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.contractImpactCalculator,
        provenance: buildProvenance(generatedAt, tradeDate, "contractImpactCalculator", trustedUrls),
      },
      factorWaterfall: {
        title: "Factor Waterfall",
        body: stacyFactorWaterfallBody({
          topFactors,
          topContribution,
          avgContribution,
        }),
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.factorWaterfall,
        provenance: buildProvenance(generatedAt, tradeDate, "factorWaterfall", trustedUrls),
      },
      riskMetrics: {
        title: "Risk Metrics",
        body: stacyRiskMetricsBody({
          noTrustedFeeds,
          volatilityLine,
          crudeLine,
        }),
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.riskMetrics,
        provenance: buildProvenance(generatedAt, tradeDate, "riskMetrics", trustedUrls),
      },
    };

    const rawCards = aiSnapshot?.cards ?? fallbackCards;
    const cards: StrategyCards = {
      marketPosture: {
        ...fallbackCards.marketPosture,
        ...rawCards.marketPosture,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.marketPosture?.strategicSpecialInstructions ??
              STRATEGY_INSTRUCTIONS.marketPosture,
            "chris",
          ),
        provenance:
          rawCards.marketPosture?.provenance ??
          buildProvenance(generatedAt, tradeDate, "marketPosture", trustedUrls),
      },
      contractImpactCalculator: {
        ...fallbackCards.contractImpactCalculator,
        ...rawCards.contractImpactCalculator,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.contractImpactCalculator?.strategicSpecialInstructions ??
              STRATEGY_INSTRUCTIONS.contractImpactCalculator,
            "chris",
          ),
        provenance:
          rawCards.contractImpactCalculator?.provenance ??
          buildProvenance(generatedAt, tradeDate, "contractImpactCalculator", trustedUrls),
      },
      factorWaterfall: {
        ...fallbackCards.factorWaterfall,
        ...rawCards.factorWaterfall,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.factorWaterfall?.strategicSpecialInstructions ??
              STRATEGY_INSTRUCTIONS.factorWaterfall,
            "chris",
          ),
        provenance:
          rawCards.factorWaterfall?.provenance ??
          buildProvenance(generatedAt, tradeDate, "factorWaterfall", trustedUrls),
      },
      riskMetrics: {
        ...fallbackCards.riskMetrics,
        ...rawCards.riskMetrics,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.riskMetrics?.strategicSpecialInstructions ??
              STRATEGY_INSTRUCTIONS.riskMetrics,
            "chris",
          ),
        provenance:
          rawCards.riskMetrics?.provenance ??
          buildProvenance(generatedAt, tradeDate, "riskMetrics", trustedUrls),
      },
    };

    const voicedCards: StrategyCards = {
      marketPosture: {
        ...cards.marketPosture,
        body: stacyMarketPostureBody({
          posture,
          volatilityLine,
        }),
      },
      contractImpactCalculator: {
        ...cards.contractImpactCalculator,
        body: stacyContractImpactBody({
          noTrustedFeeds,
          crudeLine,
          liveVix,
          liveOvx,
          liveCl5d,
        }),
      },
      factorWaterfall: {
        ...cards.factorWaterfall,
        body: stacyFactorWaterfallBody({
          topFactors,
          topContribution,
          avgContribution,
        }),
      },
      riskMetrics: {
        ...cards.riskMetrics,
        body: stacyRiskMetricsBody({
          noTrustedFeeds,
          volatilityLine,
          crudeLine,
        }),
      },
    };

    const envelope: ApiEnvelope<StrategyPosture | null> = {
      ok: true,
      data: posture,
      asOf: new Date().toISOString(),
      source: ["analytics.market_posture", ...TRUSTED_MARKET_SOURCE_FEEDS].join(","),
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
