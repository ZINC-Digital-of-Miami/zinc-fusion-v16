import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, StrategyPosture } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createServerDataClient } from "@/lib/server/server-data-client";
import {
  fetchTrustedMarketSnapshot,
  TRUSTED_MARKET_SOURCE_FEEDS,
  uniqueTrustedMarketUrls,
} from "@/lib/server/trusted-market-sources";

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
    const stagedExecutionBias =
      posture?.posture === "ACCUMULATE"
        ? "Staged accumulation remains favored."
        : posture?.posture === "WAIT"
          ? "Hold execution optionality and avoid urgency."
          : "Defer new exposure until risk compression is visible.";
    const volatilityLine =
      liveVix !== null && liveOvx !== null
        ? `VIX ${liveVix.toFixed(2)} and OVX ${liveOvx.toFixed(2)} remain active volatility constraints.`
        : "Hard stop: verified VIX/OVX volatility reads are unavailable.";
    const crudeLine =
      liveCl5d !== null
        ? `CL 5-day change is ${(liveCl5d * 100).toFixed(2)}%, informing near-term pass-through risk.`
        : "Hard stop: verified CL 5-day change is unavailable.";
    const topFactorLine =
      topFactors.length > 0
        ? `Latest verified attribution stack: ${topFactors.join(", ")}.`
        : "Hard stop: no verified attribution rows available in analytics.driver_attribution_1d.";
    const noTrustedFeeds =
      liveVix === null && liveOvx === null && liveCl5d === null;

    const fallbackCards: StrategyCards = {
      contractImpactCalculator: {
        title: "Contract Impact Calculator",
        body: noTrustedFeeds
          ? "Hard stop: trusted market evidence from Yahoo/FRED is unavailable, so contract-impact guidance is blocked."
          : `${stagedExecutionBias} ${volatilityLine} ${crudeLine}`,
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.contractImpactCalculator,
        provenance: buildProvenance(generatedAt, tradeDate, "contractImpactCalculator", trustedUrls),
      },
      factorWaterfall: {
        title: "Factor Waterfall",
        body: topFactorLine,
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.factorWaterfall,
        provenance: buildProvenance(generatedAt, tradeDate, "factorWaterfall", trustedUrls),
      },
      riskMetrics: {
        title: "Risk Metrics",
        body: noTrustedFeeds
          ? "Hard stop: trusted volatility and crude metrics are unavailable; buyer risk-math output is blocked until verified feeds recover."
          : `${volatilityLine} ${crudeLine} Decision-latency risk should be prioritized over single-window execution risk when these channels remain elevated.`,
        strategicSpecialInstructions: STRATEGY_INSTRUCTIONS.riskMetrics,
        provenance: buildProvenance(generatedAt, tradeDate, "riskMetrics", trustedUrls),
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
          buildProvenance(generatedAt, tradeDate, "contractImpactCalculator", trustedUrls),
      },
      factorWaterfall: {
        ...fallbackCards.factorWaterfall,
        ...rawCards.factorWaterfall,
        strategicSpecialInstructions:
          rawCards.factorWaterfall?.strategicSpecialInstructions ??
          STRATEGY_INSTRUCTIONS.factorWaterfall,
        provenance:
          rawCards.factorWaterfall?.provenance ??
          buildProvenance(generatedAt, tradeDate, "factorWaterfall", trustedUrls),
      },
      riskMetrics: {
        ...fallbackCards.riskMetrics,
        ...rawCards.riskMetrics,
        strategicSpecialInstructions:
          rawCards.riskMetrics?.strategicSpecialInstructions ??
          STRATEGY_INSTRUCTIONS.riskMetrics,
        provenance:
          rawCards.riskMetrics?.provenance ??
          buildProvenance(generatedAt, tradeDate, "riskMetrics", trustedUrls),
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
