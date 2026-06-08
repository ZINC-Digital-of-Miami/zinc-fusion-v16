import { NextResponse } from "next/server";

import type { AiCardContent } from "@/lib/contracts/ai-card";
import type {
  AiEnvelopeMeta,
  ApiEnvelope,
  VegasAlert,
  VegasCustomerMatrixBucket,
  VegasDemandSignal,
  VegasEventRow,
  VegasIntelSnapshot,
  VegasOpportunityRow,
  VegasSourceHealth,
} from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createServerDataClient } from "@/lib/server/server-data-client";
import { fetchVegasData } from "@/lib/vegas/fetchVegasIntel";
import { assembleVegasIntel } from "@/lib/vegas/scoreVegasOpportunities";

type VegasAiCardKey =
  | "upcomingEvents"
  | "aiSalesStrategy"
  | "restaurantAccounts"
  | "fryerTracking";

type VegasIntelAiSnapshot = {
  snapshot?: VegasIntelSnapshot;
  cards: Partial<Record<VegasAiCardKey, AiCardContent>>;
} & AiSnapshotMeta;

export type VegasIntelDashboardResponse = ApiEnvelope<{
  demandPulse: {
    score: number;
    trend: "up" | "down" | "flat";
    metrics: { label: string; value: string; hint: string }[];
  };
  eventSurge: VegasEventRow[];
  opportunities: VegasOpportunityRow[];
  cuisineSignals: VegasDemandSignal[];
  customerMatrix: VegasCustomerMatrixBucket[];
  alerts: VegasAlert[];
  sourceHealth: VegasSourceHealth[];
  cards: Partial<Record<VegasAiCardKey, AiCardContent>> | null;
  ai: AiEnvelopeMeta;
}>;

function sumEstimatedOilLbs(opps: VegasOpportunityRow[]): number {
  return opps.reduce((sum, o) => sum + (o.estimatedOilLbsPerWeek ?? 0), 0);
}

function buildDemandPulse(
  events: VegasEventRow[],
  opps: VegasOpportunityRow[],
): VegasIntelDashboardResponse["data"]["demandPulse"] {
  const events14d = events.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 14).length;
  const events30d = events.filter((e) => e.daysUntil >= 0 && e.daysUntil <= 30).length;
  const customers = opps.filter((o) => o.customerStatus === "customer");
  const totalOilLbs = sumEstimatedOilLbs(opps);

  // Near-term demand pressure is driven by how many real events fall inside the
  // outreach window; no synthetic account scores are blended in.
  const demandScore = Math.min(100, events14d * 20 + (events30d - events14d) * 8);

  return {
    score: demandScore,
    trend: demandScore > 60 ? "up" : demandScore > 30 ? "flat" : "down",
    metrics: [
      { label: "14-Day Events", value: events14d.toString(), hint: "Demand windows" },
      {
        label: "Est. Oil / Week",
        value: totalOilLbs > 0 ? `${totalOilLbs.toLocaleString()} lbs` : "n/a",
        hint: "Glide fryer + cadence",
      },
      { label: "Active Customers", value: customers.length.toString(), hint: "Serviced accounts" },
    ],
  };
}

function buildCuisineSignals(opps: VegasOpportunityRow[]): VegasDemandSignal[] {
  const byCuisine = new Map<string, VegasOpportunityRow[]>();
  for (const o of opps) {
    if (!o.cuisineType || o.cuisineType === "service") continue;
    const list = byCuisine.get(o.cuisineType) ?? [];
    list.push(o);
    byCuisine.set(o.cuisineType, list);
  }

  const signals: VegasDemandSignal[] = [];
  for (const [cuisine, list] of byCuisine.entries()) {
    const validScores = list
      .filter((o) => o.cuisineAffinityScore !== null)
      .map((o) => o.cuisineAffinityScore as number);
    const avgScore =
      validScores.length > 0
        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
        : 0;
    const cuisineOilLbs = sumEstimatedOilLbs(list);

    signals.push({
      category: cuisine,
      demandScore: Math.round(avgScore),
      trendDirection: avgScore > 50 ? "up" : "flat",
      oilRelevance: [],
      evidence: [
        `${list.length} mapped accounts`,
        cuisineOilLbs > 0 ? `${cuisineOilLbs.toLocaleString()} lbs/week est. oil` : "oil usage telemetry incomplete",
      ],
      salesNote: `Event alignment drives throughput for ${cuisine} venues in this cycle.`,
    });
  }

  return signals.sort((a, b) => b.demandScore - a.demandScore).slice(0, 6);
}

function buildCustomerMatrix(opps: VegasOpportunityRow[]): VegasCustomerMatrixBucket[] {
  const buckets: Record<string, VegasOpportunityRow[]> = {
    "High-Volume Customers": [],
    "Customers (Incomplete Telemetry)": [],
    Prospects: [],
  };

  for (const o of opps) {
    if (o.customerStatus === "prospect") {
      buckets["Prospects"].push(o);
    } else if (o.estimatedOilLbsPerWeek !== null) {
      buckets["High-Volume Customers"].push(o);
    } else {
      buckets["Customers (Incomplete Telemetry)"].push(o);
    }
  }

  return Object.entries(buckets).map(([bucket, accounts]) => {
    const totalOilLbs = sumEstimatedOilLbs(accounts);
    return {
      bucket,
      accounts: accounts.sort(
        (a, b) => (b.estimatedOilLbsPerWeek ?? 0) - (a.estimatedOilLbsPerWeek ?? 0),
      ),
      estimatedOilLbsPerWeek: totalOilLbs > 0 ? totalOilLbs : null,
      suggestedAction: bucket.includes("Incomplete")
        ? "Service Audit"
        : bucket.includes("Prospects")
        ? "Direct Outreach"
        : "Retain / Schedule",
    };
  });
}

function buildAlerts(opps: VegasOpportunityRow[]): VegasAlert[] {
  const alerts: VegasAlert[] = [];
  
  const highRiskFryers = opps.filter(o => o.customerStatus === "customer" && o.fryerCount !== null && o.fryerCount >= 5 && o.totalCapacityLbs === null);
  if (highRiskFryers.length > 0) {
    alerts.push({
      alertId: "fryer_risk_01",
      severity: "high",
      category: "fryer_risk",
      message: `${highRiskFryers.length} heavy-fryer accounts lack capacity telemetry, risking unexpected downtime during demand surges.`,
      affectedAccounts: highRiskFryers.map(o => o.name),
      recommendedAction: "Dispatch immediate service audit to capture total capacity."
    });
  }

  return alerts;
}

function buildSourceHealth(
  data: Awaited<ReturnType<typeof fetchVegasData>>,
): VegasSourceHealth[] {
  const now = new Date().toISOString();
  const coverage = data.glideCoverageCounts;
  const coverageValues = [
    coverage.exportList,
    coverage.shifts,
    coverage.scheduledReports,
    coverage.shiftCasinos,
    coverage.shiftRestaurants,
  ];
  const reachableCoverage = coverageValues.filter((value): value is number => value !== null);
  const hasCoverage = reachableCoverage.length > 0;
  const isCoverageComplete = coverageValues.every((value) => value !== null);
  const coverageRows = reachableCoverage.reduce((sum, value) => sum + value, 0);

  return [
    {
      source: "Supabase Events Feed",
      lastUpdated: now,
      status: data.events.length > 0 ? "fresh" : "missing",
      severity: data.events.length > 0 ? "ok" : "warn",
      message: `${data.events.length} upcoming events verified.`
    },
    {
      source: "Glide CRM Sync",
      lastUpdated: now,
      status: !hasCoverage ? "missing" : isCoverageComplete ? "fresh" : "stale",
      severity: !hasCoverage ? "warn" : isCoverageComplete ? "ok" : "warn",
      message: !hasCoverage
        ? "No Glide coverage tables were reachable in this environment."
        : `Coverage visible in ${reachableCoverage.length}/5 tables (${coverageRows.toLocaleString()} rows).`
    }
  ];
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();

    // 1. Fetch RAW data from DB (NO FAKE DATA) + the AI snapshot in parallel.
    const [rawData, aiSnapshot] = await Promise.all([
      fetchVegasData(supabase),
      readAiSnapshot<VegasIntelAiSnapshot>("app/config/vegas-intel-ai.json"),
    ]);

    // 2. Normalize and Score
    const { events, opportunities } = assembleVegasIntel(rawData);

    // 3. Build UI Layers
    const demandPulse = buildDemandPulse(events, opportunities);
    const cuisineSignals = buildCuisineSignals(opportunities);
    const customerMatrix = buildCustomerMatrix(opportunities);
    const alerts = buildAlerts(opportunities);
    const sourceHealth = buildSourceHealth(rawData);

    const payload: VegasIntelDashboardResponse["data"] = {
      demandPulse,
      eventSurge: events.slice(0, 8),
      opportunities,
      cuisineSignals,
      customerMatrix,
      alerts,
      sourceHealth,
      cards: aiSnapshot?.cards ?? null,
      ai: toAiEnvelopeMeta(aiSnapshot),
    };

    return NextResponse.json({
      ok: true,
      data: payload,
      asOf: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
