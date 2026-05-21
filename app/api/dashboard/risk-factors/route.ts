import { NextResponse } from "next/server";

import type { AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import { readAiSnapshot, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { withAudienceInstructionGuardrails } from "@/lib/server/ai-instruction-guardrails";
import { createServerDataClient } from "@/lib/server/server-data-client";

type DriverKey =
  | "vix_stress"
  | "crush_pressure"
  | "china_tension"
  | "tariff_threat"
  | "energy_stress";

type AiDriverContent = {
  score?: number | null;
  headline?: string;
  level?: string;
  components?: Record<string, number | null>;
  whatsHappening?: WhatsHappening;
  strategicSpecialInstructions?: StrategicSpecialInstructions;
  provenance?: AiCardProvenance;
};

type AiIntelligenceContent = {
  headline?: string;
  summary?: string;
  drivers?: { label: string; outlook: string; detail: string }[];
  zlOutlook?: "BULLISH" | "NEUTRAL" | "CAUTIOUS" | "BEARISH";
  zlColor?: string;
  tradingImplication?: string;
  strategicSpecialInstructions?: StrategicSpecialInstructions;
  provenance?: AiCardProvenance;
};

type AiRiskFactorsSnapshot = {
  drivers: Partial<Record<DriverKey, AiDriverContent>>;
  intelligence: AiIntelligenceContent;
} & AiSnapshotMeta;

type WhatsHappening = {
  whatsHappening: string;
  macroContext: string;
  supplyDemand: string;
  geopolitical: string;
  investorSentiment: string;
  nearTermOutlook: string;
  zlImplication: string;
};

type DriverData = {
  name: string;
  score: number | null;
  level: string;
  regime: string;
  headline: string;
  components: Record<string, number | null>;
  whatsHappening?: WhatsHappening;
  strategicSpecialInstructions?: StrategicSpecialInstructions;
  provenance?: AiCardProvenance;
  aiPowered: boolean;
  dataDate: string | null;
};

type MarketDriversResponse = {
  as_of_date: string | null;
  as_of_date_min?: string | null;
  as_of_date_max?: string | null;
  mixed_vintage?: boolean;
  drivers: Record<DriverKey, DriverData>;
  summary: {
    average_pressure: number;
    highest_pressure: { name: string; score: number };
    alert_count: number;
  };
  intelligence: {
    headline: string;
    summary: string;
    drivers: { label: string; outlook: string; detail: string }[];
    zlOutlook: "BULLISH" | "NEUTRAL" | "CAUTIOUS" | "BEARISH";
    zlColor: string;
    tradingImplication?: string;
    aiPowered?: boolean;
    strategicSpecialInstructions?: StrategicSpecialInstructions;
    provenance?: AiCardProvenance;
  };
  ai: {
    enabled: boolean;
    source: string;
    model: string | null;
    reasoningEffort: string | null;
    generatedAt: string | null;
    refreshScheduleEt: string | null;
  };
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMetricKey(key: string): string {
  return key.trim().toLowerCase();
}

function coerceScore(value: number | null): number | null {
  if (value === null) return null;
  const abs = Math.abs(value);
  if (abs <= 1) return Math.round(abs * 1000) / 10;
  if (abs <= 100) return Math.round(abs * 10) / 10;
  return 100;
}

function mapFactorToDriver(factor: string): DriverKey | null {
  const f = factor.toLowerCase();
  if (f.includes("vix") || f.includes("volatility")) return "vix_stress";
  if (f.includes("crush")) return "crush_pressure";
  if (f.includes("china") || f.includes("cny")) return "china_tension";
  if (f.includes("tariff") || f.includes("policy") || f.includes("tpu") || f.includes("emv")) return "tariff_threat";
  if (f.includes("energy") || f.includes("crude") || f.includes("oil") || f.includes("cl")) return "energy_stress";
  return null;
}

function levelFor(driver: DriverKey, score: number | null): string {
  if (score === null) return "No Data";

  if (driver === "vix_stress") {
    if (score >= 85) return "Gap Risk";
    if (score >= 65) return "Fund Exit";
    if (score >= 45) return "Elevated";
    return "Calm";
  }
  if (driver === "crush_pressure") {
    if (score >= 85) return "Plant Idling";
    if (score >= 65) return "Margin Squeeze";
    if (score >= 45) return "Breakeven Risk";
    return "Strong";
  }
  if (driver === "china_tension") {
    if (score >= 80) return "Active Conflict";
    if (score >= 60) return "Trade Diversion";
    if (score >= 40) return "Monitor Flows";
    return "Brazil Favored";
  }
  if (driver === "tariff_threat") {
    if (score >= 85) return "Systemic Shock";
    if (score >= 65) return "Elevated Risk";
    if (score >= 45) return "Watch";
    return "Contained";
  }
  if (score >= 85) return "Crisis";
  if (score >= 65) return "Supply Shock";
  if (score >= 45) return "Elevated";
  return "Low Risk";
}

function regimeFor(score: number | null): string {
  if (score === null) return "NO_DATA";
  if (score >= 70) return "PRESSURE";
  if (score >= 45) return "WATCH";
  return "CALM";
}

function outlookFromScore(score: number): "BULLISH" | "NEUTRAL" | "CAUTIOUS" | "BEARISH" {
  if (score >= 70) return "BEARISH";
  if (score >= 55) return "CAUTIOUS";
  if (score >= 35) return "NEUTRAL";
  return "BULLISH";
}

function colorFromScore(score: number): string {
  if (score >= 70) return "#EF4444";
  if (score >= 55) return "#EF7300";
  if (score >= 35) return "#EAB308";
  return "#22C55E";
}

function headlineFor(driverName: string, score: number | null): string {
  if (score === null) return `Hard stop: ${driverName} lacks verified promoted data`;
  if (score >= 70) return `${driverName}: pressure elevated`;
  if (score >= 45) return `${driverName}: watch the tape`;
  return `${driverName}: stable read`;
}

function getMetric(metrics: Map<string, number | null>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metrics.get(normalizeMetricKey(key));
    if (value !== undefined) return value;
  }
  return null;
}

const DRIVER_STRATEGIC_SPECIAL_INSTRUCTIONS: Record<DriverKey, StrategicSpecialInstructions> = {
  vix_stress: {
    cardTopic: "Volatility Transmission",
    strategicObjective:
      "Identify whether implied volatility is transitioning from noise to procurement-disruptive stress before price shocks fully print into soybean-oil costs.",
    neuralConnectionThesis:
      "Co-expansion of the broad volatility gauge and oil-volatility gauge, combined with unstable correlation regimes, precedes defensive positioning, liquidity withdrawal, and wider execution slippage in procurement windows.",
    quantResearchProtocol: [
      "Track broad-volatility-gauge level, five-day acceleration, and percentile regime versus recent history.",
      "Measure the spread between oil-volatility and broad-volatility gauges to separate broad risk-off from energy-led volatility.",
      "Validate implied-realized divergence before assigning persistent stress classification.",
      "Require cross-check against correlation persistence between the volatility complex and soybean-oil directionality.",
    ],
    inferenceConstraints: [
      "Do not call this a fear regime without citing at least two confirming volatility metrics.",
      "Do not issue directional procurement urgency from a single-day volatility spike.",
      "Treat contradictory signals as mixed regime until two consecutive confirmations.",
    ],
    outputRequirements: [
      "Quote concrete metric values and near-term delta context.",
      "State regime class and confidence rationale explicitly.",
      "Tie conclusion to execution-risk timing, not generic market mood.",
    ],
  },
  crush_pressure: {
    cardTopic: "Crush Economics",
    strategicObjective:
      "Determine whether processor margin structure is signaling demand pull-forward, refinery stress, or neutral throughput for soybean oil procurement.",
    neuralConnectionThesis:
      "Board crush margin and oil-share shifts propagate through processor behavior, altering near-term oil availability and repricing procurement urgency ahead of spot dislocations.",
    quantResearchProtocol: [
      "Monitor board crush margin level and 5-day momentum for margin compression/expansion transitions.",
      "Track oil value share and change-rate to detect oil-led versus meal-led margin dynamics.",
      "Differentiate structural margin stress from transient basis noise using multi-day persistence.",
      "Cross-reference with headline intensity only as secondary confirmation, never as primary driver.",
    ],
    inferenceConstraints: [
      "Do not classify processor stress unless margin level and momentum agree.",
      "Do not infer supply tightness from headlines when crush economics remain stable.",
      "Avoid symmetric conclusions; upside and downside margin asymmetry must be explicit.",
    ],
    outputRequirements: [
      "Report margin, oil share, and short-window change metrics together.",
      "Specify whether the signal implies scarcity risk or normalization risk.",
      "Convert finding into concrete procurement pacing guidance.",
    ],
  },
  china_tension: {
    cardTopic: "China Demand and Flow Risk",
    strategicObjective:
      "Detect demand-flow rerouting or escalation risk from China-linked macro channels before it manifests as persistent ZL repricing.",
    neuralConnectionThesis:
      "Chinese-currency stress, shipping/trade-flow narrative pressure, and China-soy headline clustering can alter marginal demand assumptions and induce asymmetric price response in oil contracts.",
    quantResearchProtocol: [
      "Track Chinese-currency level and directional pressure relative to recent trade windows.",
      "Measure China/soy headline density and persistence, not one-off spikes.",
      "Evaluate whether flow-tension signals align with broader risk complex or remain isolated.",
      "Classify regime only after confirming currency and narrative channels are directionally coherent.",
    ],
    inferenceConstraints: [
      "Do not conclude demand shock from headline count alone.",
      "Do not treat currency wobble as structural without multi-session follow-through.",
      "When channels diverge, report mixed state and defer hard directional posture.",
    ],
    outputRequirements: [
      "State explicit flow-risk state: stable, watch, diversion, or conflict.",
      "Cite Chinese-currency and headline evidence with timing context.",
      "Translate into procurement decision latency guidance.",
    ],
  },
  tariff_threat: {
    cardTopic: "Macro and Geopolitical Policy Shock",
    strategicObjective:
      "Quantify whether policy uncertainty and geopolitical escalation are reaching a threshold where procurement execution must shift from schedule-based to contingency-aware.",
    neuralConnectionThesis:
      "Policy uncertainty, energy transmission, and conflict narrative density interact non-linearly; once co-aligned, they increase tail-risk probability and invalidate static buying cadence assumptions.",
    quantResearchProtocol: [
      "Track uncertainty index regime against short-window crude momentum for transmission confirmation.",
      "Measure Iran/war and macro headline densities for escalation persistence.",
      "Validate that policy and energy channels are directionally coherent before escalation call.",
      "Assess whether macro pressure is broadening across multiple risk factors or remaining isolated.",
    ],
    inferenceConstraints: [
      "Do not label systemic shock unless uncertainty and transmission metrics co-confirm.",
      "Avoid headline-only escalation calls without price-channel corroboration.",
      "Explicitly mark mixed regimes when macro and energy signals conflict.",
    ],
    outputRequirements: [
      "Provide shock class with concrete thresholds and evidence.",
      "State expected execution impact horizon (immediate, near-term, or deferred).",
      "Frame recommendation in procurement optionality terms.",
    ],
  },
  energy_stress: {
    cardTopic: "Energy Pass-Through Pressure",
    strategicObjective:
      "Identify when energy complex dynamics are likely to cascade into soybean oil procurement cost pressure beyond routine volatility.",
    neuralConnectionThesis:
      "Crude direction, velocity, and energy-volatility coupling drive pass-through pressure; persistent co-movement raises the probability of accelerated cost repricing in ZL-related procurement.",
    quantResearchProtocol: [
      "Track crude-oil benchmark level with five-day and twenty-day directional context.",
      "Measure oil-volatility-gauge alignment to distinguish stable trend from unstable stress expansion.",
      "Use energy-headline density as catalyst context rather than primary quantitative proof.",
      "Require multi-signal coherence before assigning crisis-class regime.",
    ],
    inferenceConstraints: [
      "Do not infer pass-through stress from crude alone without volatility context.",
      "Do not overstate risk on isolated headline spikes.",
      "When trend and volatility disagree, classify as transitional regime.",
    ],
    outputRequirements: [
      "Report crude, volatility, and headline context together.",
      "State whether signal implies transient pressure or persistent repricing risk.",
      "Tie conclusion directly to procurement timing and hedge posture.",
    ],
  },
};

const MARKET_INTELLIGENCE_STRATEGIC_SPECIAL_INSTRUCTIONS: StrategicSpecialInstructions = {
  cardTopic: "Cross-Driver Strategic Synthesis",
  strategicObjective:
    "Synthesize driver-level signals into an actionable procurement regime that prioritizes execution timing, optionality preservation, and risk-adjusted cost control.",
  neuralConnectionThesis:
    "Procurement risk is a network problem: volatility, crush economics, China flow tension, macro shock channels, and energy transmission interact with lag and feedback; robust decisions require weighted cross-signal coherence, not single-factor conviction.",
  quantResearchProtocol: [
    "Rank drivers by pressure score and persistence, then test for cross-driver agreement.",
    "Separate structural regime shifts from transient anomalies by requiring multi-session confirmation.",
    "Evaluate top driver interaction terms (volatility x macro, energy x macro, crush x china) before final posture.",
    "Force explicit confidence statement tied to data freshness and signal completeness.",
  ],
  inferenceConstraints: [
    "Do not issue high-conviction posture when top drivers conflict materially.",
    "Do not default to neutral language when one driver shows systemic-risk class pressure.",
    "Never summarize without an explicit execution implication for procurement.",
  ],
  outputRequirements: [
    "State the dominant risk network and its expected persistence horizon.",
    "Provide a concrete posture recommendation with monitoring triggers.",
    "Use metric-backed reasoning and avoid generic narrative filler.",
  ],
};

function formatMetric(value: number | null, mode: "fixed1" | "fixed2" | "int" | "pct" | "usd2"): string {
  if (value === null) return "unavailable";
  if (mode === "fixed1") return value.toFixed(1);
  if (mode === "fixed2") return value.toFixed(2);
  if (mode === "int") return value.toFixed(0);
  if (mode === "pct") return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  return `$${value.toFixed(2)}`;
}

function scoreState(score: number | null): string {
  if (score === null) return "data pending";
  if (score >= 70) return "elevated pressure";
  if (score >= 45) return "watch zone";
  return "calm zone";
}

function conciseIntelligenceHeadline(topName: string, topScore: number): string {
  if (topName === "No Data") return "Mr. Stacy: risk stack unavailable";
  if (topScore >= 70) return `Mr. Stacy: ${topName} is pressing costs`;
  if (topScore >= 55) return `Mr. Stacy: ${topName} is in watch mode`;
  return "Mr. Stacy: pressure stack is contained";
}

function conciseIntelligenceSummary(topName: string, topScore: number, averagePressure: number): string {
  if (topName === "No Data") {
    return "Hard stop: no verified driver rows, so procurement synthesis is blocked.";
  }
  if (topScore >= 70) {
    return `${topName} leads at ${Math.round(topScore)} with average pressure ${averagePressure.toFixed(1)}. Calm is currently theoretical.`;
  }
  if (topScore >= 55) {
    return `${topName} leads at ${Math.round(topScore)}; network average is ${averagePressure.toFixed(1)}. Keep cadence disciplined, not sleepy.`;
  }
  return `${topName} leads at ${Math.round(topScore)}; average pressure is ${averagePressure.toFixed(1)}. Schedule buys stay valid with active checks.`;
}

function conciseTradingImplication(topScore: number): string {
  if (topScore >= 70) {
    return "Tighten buying windows, stage contracts, and keep hedge optionality open.";
  }
  if (topScore >= 55) {
    return "Buy in tranches and re-check drivers before each commitment block.";
  }
  return "Stay schedule-based, but keep weekly refresh reviews hard-gated.";
}

function mergeDriverComponents(
  base: Record<string, number | null>,
  ai?: Record<string, number | null>,
): Record<string, number | null> {
  if (!ai) return base;
  const merged: Record<string, number | null> = { ...base };
  for (const [key, value] of Object.entries(ai)) {
    if (value === null || value === undefined) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    merged[key] = n;
  }
  return merged;
}

function summarizeDrivers(drivers: Record<DriverKey, DriverData>): {
  average: number;
  topName: string;
  topScore: number;
  alertCount: number;
} {
  const scoredEntries = (Object.values(drivers) as DriverData[]).filter(
    (d) => d.score !== null,
  ) as Array<DriverData & { score: number }>;

  const average =
    scoredEntries.length > 0
      ? Math.round(
          (scoredEntries.reduce((acc, d) => acc + d.score, 0) / scoredEntries.length) * 10,
        ) / 10
      : 0;

  const highest =
    scoredEntries.length > 0
      ? scoredEntries.slice().sort((a, b) => b.score - a.score)[0]
      : null;

  const topScore = highest?.score ?? 0;
  const topName = highest?.name ?? "No Data";
  const alertCount = scoredEntries.filter((d) => d.score >= 65).length;

  return { average, topName, topScore, alertCount };
}

async function readAiRiskFactorsSnapshot(): Promise<AiRiskFactorsSnapshot | null> {
  const snapshot = await readAiSnapshot<AiRiskFactorsSnapshot>("app/config/dashboard-risk-factors-ai.json");
  if (!snapshot) return null;
  if (!snapshot.drivers || !snapshot.intelligence) return null;
  return snapshot;
}

function driverFocus(driver: DriverKey): string {
  if (driver === "vix_stress") return "volatility transmission into procurement timing";
  if (driver === "crush_pressure") return "processor margin pressure and oil-share economics";
  if (driver === "china_tension") return "China demand and trade-flow displacement";
  if (driver === "tariff_threat") return "policy shocks and geopolitical tariff channels";
  return "energy complex pass-through into soybean-oil procurement cost";
}

function conciseDriverHeadline(driver: DriverKey, payload: DriverData): string {
  const c = payload.components;
  if (driver === "vix_stress") {
    return `Broad volatility gauge ${formatMetric(c.vix_value ?? null, "fixed1")} and oil-volatility gauge ${formatMetric(c.ovx_value ?? null, "fixed1")} keep execution risk ${scoreState(payload.score)}.`;
  }
  if (driver === "crush_pressure") {
    return `Crush ${formatMetric(c.board_crush_value ?? null, "usd2")} with oil share ${formatMetric(c.oil_share_value ?? null, "fixed1")} keeps processor pressure ${scoreState(payload.score)}.`;
  }
  if (driver === "china_tension") {
    return `Chinese-currency level ${formatMetric(c.cny_rate ?? null, "fixed2")} plus ${formatMetric(c.soy_china_news_count ?? null, "int")} China-trade headlines keeps this lane ${scoreState(payload.score)}.`;
  }
  if (driver === "tariff_threat") {
    return `Uncertainty ${formatMetric(c.uncertainty_value ?? null, "int")} with crude 5D ${formatMetric(c.oil_change_5d ?? null, "pct")} leaves policy risk ${scoreState(payload.score)}.`;
  }
  return `Crude-oil benchmark ${formatMetric(c.cl_price ?? null, "usd2")} and oil-volatility gauge ${formatMetric(c.ovx_value ?? null, "fixed1")} keep energy pass-through ${scoreState(payload.score)}.`;
}

function buildDriverProvenance(
  key: DriverKey,
  dataDate: string | null,
  generatedAt: string | null,
): AiCardProvenance {
  const asOf = dataDate ?? generatedAt ?? new Date().toISOString();
  return {
    asOf,
    generatedAt: generatedAt ?? asOf,
    method: "verified-db-weekly-ingest-plus-ai-snapshot",
    sourceFeeds: [
      "analytics.dashboard_metrics",
      "analytics.driver_attribution_1d",
    ],
    sourceRecords: [
      {
        source: "analytics.dashboard_metrics",
        table: "analytics.dashboard_metrics",
        recordHint: `driver=${key}`,
        observedAt: dataDate ?? undefined,
      },
      {
        source: "analytics.driver_attribution_1d",
        table: "analytics.driver_attribution_1d",
        recordHint: `mapped_driver=${key}`,
        observedAt: dataDate ?? undefined,
      },
    ],
  };
}

function buildIntelligenceProvenance(
  asOf: string | null,
  generatedAt: string | null,
): AiCardProvenance {
  const resolvedAsOf = asOf ?? generatedAt ?? new Date().toISOString();
  return {
    asOf: resolvedAsOf,
    generatedAt: generatedAt ?? resolvedAsOf,
    method: "verified-db-weekly-ingest-plus-ai-snapshot",
    sourceFeeds: [
      "analytics.dashboard_metrics",
      "analytics.driver_attribution_1d",
    ],
    sourceRecords: [
      {
        source: "analytics.dashboard_metrics",
        table: "analytics.dashboard_metrics",
        recordHint: "latest driver metric set",
        observedAt: resolvedAsOf,
      },
      {
        source: "analytics.driver_attribution_1d",
        table: "analytics.driver_attribution_1d",
        recordHint: "latest factor attribution set",
        observedAt: resolvedAsOf,
      },
    ],
  };
}

function buildDriverWhatsHappening(
  driver: DriverKey,
  payload: DriverData,
  aggregateSummary: string,
  topDriverName: string,
  averagePressure: number,
): WhatsHappening {
  const scoreText = payload.score === null ? "No scored signal yet" : `Score ${Math.round(payload.score)}`;
  const commonState = scoreState(payload.score);
  const focus = driverFocus(driver);

  const c = payload.components;
  let supplyDemand = "Supply signal is waiting on the next promoted dataset.";
  let geopolitical = "No dominant geopolitical pulse is confirmed in this lane.";
  let sentiment = `Market posture is ${commonState}; regime is ${payload.regime}.`;

  if (driver === "vix_stress") {
    supplyDemand = `Broad volatility gauge ${formatMetric(c.vix_value ?? null, "fixed1")} and oil-volatility gauge ${formatMetric(c.ovx_value ?? null, "fixed1")} set the volatility lane.`;
    geopolitical = "Cross-asset stress can still spill into soybean-oil timing without warning.";
    sentiment = `Volatility is ${commonState}; calm behavior is still optional.`;
  } else if (driver === "crush_pressure") {
    supplyDemand = `Crush margin ${formatMetric(c.board_crush_value ?? null, "usd2")} and oil share ${formatMetric(c.oil_share_value ?? null, "fixed1")} anchor processor economics.`;
    geopolitical = "Macro shocks can still flip this lane faster than fundamentals prefer.";
    sentiment = `Crush pressure is ${commonState}; watch spread drift before pacing buys.`;
  } else if (driver === "china_tension") {
    supplyDemand = `Chinese-currency level ${formatMetric(c.cny_rate ?? null, "fixed2")} with ${formatMetric(c.soy_china_news_count ?? null, "int")} China/soy headlines tracks flow tension.`;
    geopolitical = "Trade friction remains the amplifier when this lane wakes up.";
    sentiment = `China-linked risk is ${commonState}; headlines can move faster than logic.`;
  } else if (driver === "tariff_threat") {
    supplyDemand = `Uncertainty ${formatMetric(c.uncertainty_value ?? null, "int")} and crude 5D ${formatMetric(c.oil_change_5d ?? null, "pct")} frame policy transmission.`;
    geopolitical = `${formatMetric(c.iran_war_news_count ?? null, "int")} Iran/war and ${formatMetric(c.macro_news_count ?? null, "int")} macro headlines are feeding this lane.`;
    sentiment = `Policy risk is ${commonState}; this is where schedules usually lose arguments.`;
  } else {
    supplyDemand = `Crude-oil benchmark ${formatMetric(c.cl_price ?? null, "usd2")}, five-day move ${formatMetric(c.cl_change_5d ?? null, "pct")}, and oil-volatility gauge ${formatMetric(c.ovx_value ?? null, "fixed1")} define energy stress.`;
    geopolitical = `Energy headlines: ${formatMetric(c.energy_news_count ?? null, "int")}; supply-shock sensitivity is still live.`;
    sentiment = `Energy pass-through is ${commonState}; freight rarely sends thank-you notes.`;
  }

  const zlImplication =
    payload.score === null
      ? "Keep standard cadence until verified data returns."
      : payload.score >= 70
        ? "Shorten decision windows and keep optionality; this lane can tax complacency quickly."
        : payload.score >= 45
          ? "Maintain normal execution with tighter refresh checks."
          : "Pressure is contained; schedule buying stays valid unless another lane escalates.";

  return {
    whatsHappening: `${payload.name} is ${commonState}. ${scoreText}. Focus: ${focus}.`,
    macroContext: `${aggregateSummary} Top pressure: ${topDriverName}. Average: ${averagePressure.toFixed(1)}.`,
    supplyDemand,
    geopolitical,
    investorSentiment: sentiment,
    nearTermOutlook:
      payload.score === null
        ? "Hard stop: near-term outlook blocked until verified fields populate."
        : payload.score >= 70
          ? "High-risk posture likely to persist near term."
          : payload.score >= 45
            ? "Mixed posture with event-driven volatility risk."
            : "Low-pressure posture unless headline regime changes.",
    zlImplication,
  };
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();
    const aiSnapshot = await readAiRiskFactorsSnapshot();
    const responseGeneratedAt = new Date().toISOString();

    const [{ data: metricRows, error: metricError }, { data: attributionRows, error: attributionError }] = await Promise.all([
      supabase
        .schema("analytics")
        .from("dashboard_metrics")
        .select("trade_date, metric_key, metric_value")
        .order("trade_date", { ascending: false })
        .limit(500),
      supabase
        .schema("analytics")
        .from("driver_attribution_1d")
        .select("trade_date, rank, factor, contribution, confidence")
        .order("trade_date", { ascending: false })
        .order("rank", { ascending: true })
        .limit(100),
    ]);

    if (metricError || attributionError) {
      return NextResponse.json(
        {
          error: metricError?.message ?? attributionError?.message ?? "Failed to load market drivers",
        },
        { status: 500 },
      );
    }

    const latestMetricDate = metricRows?.[0]?.trade_date ?? null;
    const latestMetrics = (metricRows ?? []).filter((r) => r.trade_date === latestMetricDate);
    const metricMap = new Map<string, number | null>();
    for (const row of latestMetrics) {
      metricMap.set(normalizeMetricKey(row.metric_key), toNumber(row.metric_value));
    }

    const latestAttributionDate = attributionRows?.[0]?.trade_date ?? null;
    const latestAttribution = (attributionRows ?? []).filter((r) => r.trade_date === latestAttributionDate);
    const attributionByDriver = new Map<DriverKey, { trade_date: string; factor: string; contribution: number | null }>();
    for (const row of latestAttribution) {
      const driverKey = mapFactorToDriver(String(row.factor));
      if (!driverKey) continue;
      const contribution = toNumber(row.contribution);
      const existing = attributionByDriver.get(driverKey);
      const existingAbs = existing?.contribution === null || existing?.contribution === undefined ? -1 : Math.abs(existing.contribution);
      const currentAbs = contribution === null ? -1 : Math.abs(contribution);
      if (!existing || currentAbs > existingAbs) {
        attributionByDriver.set(driverKey, {
          trade_date: String(row.trade_date),
          factor: String(row.factor),
          contribution,
        });
      }
    }

    const scoreCandidates = {
      vix_stress: coerceScore(getMetric(metricMap, ["vix_stress_score", "vix_score", "market_volatility_score", "driver_vix_score"])),
      crush_pressure: coerceScore(getMetric(metricMap, ["crush_pressure_score", "crush_score", "driver_crush_score"])),
      china_tension: coerceScore(getMetric(metricMap, ["china_tension_score", "china_score", "driver_china_score"])),
      tariff_threat: coerceScore(getMetric(metricMap, ["tariff_threat_score", "tariff_score", "policy_risk_score", "driver_tariff_score"])),
      energy_stress: coerceScore(getMetric(metricMap, ["energy_stress_score", "energy_score", "driver_energy_score"])),
    };

    for (const key of Object.keys(scoreCandidates) as DriverKey[]) {
      if (scoreCandidates[key] === null) {
        scoreCandidates[key] = coerceScore(attributionByDriver.get(key)?.contribution ?? null);
      }
    }

    const normalized = (value: number, floor: number, ceil: number): number =>
      Math.max(0, Math.min(100, ((value - floor) / (ceil - floor)) * 100));

    if (scoreCandidates.vix_stress === null) {
      const vix = getMetric(metricMap, ["vix_value"]);
      const ovx = getMetric(metricMap, ["ovx_value"]);
      if (vix !== null || ovx !== null) {
        const vixScore = vix === null ? 0 : normalized(vix, 14, 40);
        const ovxScore = ovx === null ? 0 : normalized(ovx, 20, 60);
        scoreCandidates.vix_stress = Math.round((vixScore * 0.55 + ovxScore * 0.45) * 10) / 10;
      }
    }

    if (scoreCandidates.energy_stress === null) {
      const cl5d = getMetric(metricMap, ["cl_change_5d", "crude_oil_change_5d"]);
      const ovx = getMetric(metricMap, ["ovx_value"]);
      if (cl5d !== null || ovx !== null) {
        const clScore = cl5d === null ? 0 : normalized(Math.abs(cl5d * 100), 0.5, 8);
        const ovxScore = ovx === null ? 0 : normalized(ovx, 20, 60);
        scoreCandidates.energy_stress = Math.round((clScore * 0.5 + ovxScore * 0.5) * 10) / 10;
      }
    }

    if (scoreCandidates.china_tension === null) {
      const cny = getMetric(metricMap, ["cny_rate"]);
      if (cny !== null) {
        scoreCandidates.china_tension = Math.round(normalized(Math.abs(cny - 7.0), 0.03, 0.35) * 10) / 10;
      }
    }

    const metricDate = latestMetricDate ? String(latestMetricDate) : null;
    const dateFor = (key: DriverKey): string | null =>
      attributionByDriver.get(key)?.trade_date ?? metricDate;

    const drivers: Record<DriverKey, DriverData> = {
      vix_stress: {
        name: "Volatility Stress",
        score: scoreCandidates.vix_stress,
        level: levelFor("vix_stress", scoreCandidates.vix_stress),
        regime: regimeFor(scoreCandidates.vix_stress),
        headline: headlineFor("Market volatility", scoreCandidates.vix_stress),
        components: {
          vix_value: getMetric(metricMap, ["vix_value"]),
          ovx_value: getMetric(metricMap, ["ovx_value"]),
        },
        aiPowered: false,
        dataDate: dateFor("vix_stress"),
      },
      crush_pressure: {
        name: "Crush Pressure",
        score: scoreCandidates.crush_pressure,
        level: levelFor("crush_pressure", scoreCandidates.crush_pressure),
        regime: regimeFor(scoreCandidates.crush_pressure),
        headline: headlineFor("Crush margins", scoreCandidates.crush_pressure),
        components: {
          board_crush_value: getMetric(metricMap, ["board_crush_value", "crush_margin"]),
          oil_share_value: getMetric(metricMap, ["oil_share_value", "soy_oil_share"]),
          oil_share_5d_change: getMetric(metricMap, ["oil_share_5d_change"]),
        },
        aiPowered: false,
        dataDate: dateFor("crush_pressure"),
      },
      china_tension: {
        name: "China Tension",
        score: scoreCandidates.china_tension,
        level: levelFor("china_tension", scoreCandidates.china_tension),
        regime: regimeFor(scoreCandidates.china_tension),
        headline: headlineFor("China demand/trade", scoreCandidates.china_tension),
        components: {
          cny_rate: getMetric(metricMap, ["cny_rate"]),
          soy_china_news_count: getMetric(metricMap, ["soy_china_news_count", "china_soy_news_count"]),
        },
        aiPowered: false,
        dataDate: dateFor("china_tension"),
      },
      tariff_threat: {
        name: "Macro Threat",
        score: scoreCandidates.tariff_threat,
        level: levelFor("tariff_threat", scoreCandidates.tariff_threat),
        regime: regimeFor(scoreCandidates.tariff_threat),
        headline: headlineFor("Macro/geopolitical", scoreCandidates.tariff_threat),
        components: {
          tpu_value: getMetric(metricMap, ["tpu_value", "trade_policy_uncertainty"]),
          uncertainty_value: getMetric(metricMap, ["uncertainty_value", "tpu_value", "trade_policy_uncertainty"]),
          emv_value: getMetric(metricMap, ["emv_value", "trade_policy_index"]),
          soy_tariff_news_count: getMetric(metricMap, ["soy_tariff_news_count", "tariff_news_count"]),
          oil_change_5d: getMetric(metricMap, ["oil_change_5d", "cl_change_5d", "crude_oil_change_5d"]),
          iran_war_news_count: getMetric(metricMap, ["iran_war_news_count", "soy_tariff_news_count", "tariff_news_count"]),
          macro_news_count: getMetric(metricMap, ["macro_news_count", "soy_tariff_news_count", "tariff_news_count"]),
        },
        aiPowered: false,
        dataDate: dateFor("tariff_threat"),
      },
      energy_stress: {
        name: "Energy Stress",
        score: scoreCandidates.energy_stress,
        level: levelFor("energy_stress", scoreCandidates.energy_stress),
        regime: regimeFor(scoreCandidates.energy_stress),
        headline: headlineFor("Energy complex", scoreCandidates.energy_stress),
        components: {
          cl_price: getMetric(metricMap, ["cl_price", "crude_oil_price"]),
          cl_change_5d: getMetric(metricMap, ["cl_change_5d", "crude_oil_change_5d"]),
          ovx_value: getMetric(metricMap, ["ovx_value"]),
          energy_news_count: getMetric(metricMap, ["energy_news_count"]),
        },
        aiPowered: false,
        dataDate: dateFor("energy_stress"),
      },
    };

    const allDates = (Object.values(drivers) as DriverData[])
      .map((d) => d.dataDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    const asOfDateMin = allDates[0] ?? null;
    const asOfDateMax = allDates[allDates.length - 1] ?? null;
    const asOfDate = asOfDateMin;
    const mixedVintage = Boolean(asOfDateMin && asOfDateMax && asOfDateMin !== asOfDateMax);

    const mergeDriver = (
      key: DriverKey,
      base: DriverData,
      defaultHeadlineName: string,
      defaultInstructions: StrategicSpecialInstructions,
    ): DriverData => {
      const ai = aiSnapshot?.drivers?.[key];
      const aiScoreRaw = ai?.score;
      const aiScore = aiScoreRaw === null || aiScoreRaw === undefined ? null : coerceScore(Number(aiScoreRaw));
      const mergedScore = aiScore ?? base.score;
      const mergedLevel = ai?.level ?? levelFor(key, mergedScore);
      const mergedComponents = mergeDriverComponents(base.components, ai?.components);

      const mergedPayload: DriverData = {
        ...base,
        score: mergedScore,
        level: mergedLevel,
        regime: regimeFor(mergedScore),
        headline: ai?.headline ?? headlineFor(defaultHeadlineName, mergedScore),
        components: mergedComponents,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            ai?.strategicSpecialInstructions ?? defaultInstructions,
            "chris",
          ),
        provenance:
          ai?.provenance ??
          buildDriverProvenance(
            key,
            base.dataDate,
            aiSnapshot?.generatedAt ?? responseGeneratedAt,
          ),
        aiPowered: Boolean(ai),
        dataDate: base.dataDate,
      };

      return {
        ...mergedPayload,
        whatsHappening: ai?.whatsHappening,
      };
    };

    const mergedDrivers: Record<DriverKey, DriverData> = {
      vix_stress: mergeDriver(
        "vix_stress",
        drivers.vix_stress,
        "Market volatility",
        DRIVER_STRATEGIC_SPECIAL_INSTRUCTIONS.vix_stress,
      ),
      crush_pressure: mergeDriver(
        "crush_pressure",
        drivers.crush_pressure,
        "Crush margins",
        DRIVER_STRATEGIC_SPECIAL_INSTRUCTIONS.crush_pressure,
      ),
      china_tension: mergeDriver(
        "china_tension",
        drivers.china_tension,
        "China demand/trade",
        DRIVER_STRATEGIC_SPECIAL_INSTRUCTIONS.china_tension,
      ),
      tariff_threat: mergeDriver(
        "tariff_threat",
        drivers.tariff_threat,
        "Macro/geopolitical",
        DRIVER_STRATEGIC_SPECIAL_INSTRUCTIONS.tariff_threat,
      ),
      energy_stress: mergeDriver(
        "energy_stress",
        drivers.energy_stress,
        "Energy complex",
        DRIVER_STRATEGIC_SPECIAL_INSTRUCTIONS.energy_stress,
      ),
    };

    const mergedSummary = summarizeDrivers(mergedDrivers);
    const mergedAverage = mergedSummary.average;
    const mergedTopName = mergedSummary.topName;
    const mergedTopScore = mergedSummary.topScore;
    const mergedAlertCount = mergedSummary.alertCount;

    for (const key of Object.keys(mergedDrivers) as DriverKey[]) {
      const driver = mergedDrivers[key];
      driver.headline = conciseDriverHeadline(key, driver);
      driver.whatsHappening = buildDriverWhatsHappening(
        key,
        driver,
        mergedTopScore === 0 && mergedTopName === "No Data"
          ? "Hard stop: promoted analytics rows are missing."
          : `Top concern is ${mergedTopName} at ${Math.round(mergedTopScore)}.`,
        mergedTopName,
        mergedAverage,
      );
    }

    const response: MarketDriversResponse = {
      as_of_date: asOfDate,
      as_of_date_min: asOfDateMin,
      as_of_date_max: asOfDateMax,
      mixed_vintage: mixedVintage,
      drivers: mergedDrivers,
      summary: {
        average_pressure: mergedAverage,
        highest_pressure: { name: mergedTopName, score: mergedTopScore },
        alert_count: mergedAlertCount,
      },
      intelligence: {
        headline: conciseIntelligenceHeadline(mergedTopName, mergedTopScore),
        summary: conciseIntelligenceSummary(mergedTopName, mergedTopScore, mergedAverage),
        drivers: (Object.values(mergedDrivers) as DriverData[])
          .filter((d) => d.score !== null)
          .map((d) => ({
            label: d.name,
            outlook:
              d.score !== null && d.score >= 65
                ? "PRESSURE"
                : d.score !== null && d.score <= 35
                  ? "SUPPORTIVE"
                  : "MIXED",
            detail: d.headline,
          })),
        zlOutlook: outlookFromScore(mergedAverage),
        zlColor: colorFromScore(mergedAverage),
        tradingImplication: conciseTradingImplication(mergedTopScore),
        aiPowered: Boolean(aiSnapshot?.intelligence),
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            aiSnapshot?.intelligence?.strategicSpecialInstructions ??
              MARKET_INTELLIGENCE_STRATEGIC_SPECIAL_INSTRUCTIONS,
            "chris",
          ),
        provenance:
          aiSnapshot?.intelligence?.provenance ??
          buildIntelligenceProvenance(
            asOfDateMax ?? asOfDateMin,
            aiSnapshot?.generatedAt ?? responseGeneratedAt,
          ),
      },
      ai: {
        enabled: Boolean(aiSnapshot),
        source: aiSnapshot?.source ?? "weekly-db-plus-ai-snapshot",
        model: aiSnapshot?.model ?? null,
        reasoningEffort: aiSnapshot?.reasoningEffort ?? null,
        generatedAt: aiSnapshot?.generatedAt ?? responseGeneratedAt,
        refreshScheduleEt: aiSnapshot?.refreshScheduleEt ?? null,
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
