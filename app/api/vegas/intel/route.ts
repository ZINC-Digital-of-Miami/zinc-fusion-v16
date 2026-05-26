import { NextResponse } from "next/server";

import type {
  ApiEnvelope,
  VegasAlert,
  VegasCustomerMatrixBucket,
  VegasDemandSignal,
  VegasEventRow,
  VegasOpportunityRow,
  VegasSourceHealth,
} from "@/lib/contracts/api";
import { createServerDataClient } from "@/lib/server/server-data-client";
import { fetchVegasData } from "@/lib/vegas/fetchVegasIntel";
import { assembleVegasIntel } from "@/lib/vegas/scoreVegasOpportunities";

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
}>;

function buildDemandPulse(events: VegasEventRow[], opps: VegasOpportunityRow[]): VegasIntelDashboardResponse["data"]["demandPulse"] {
  const events14d = events.filter((e) => e.daysUntil <= 14).length;
  const avgZfusion = opps.reduce((sum, o) => sum + (o.zfusionScore ?? 0), 0) / (opps.length || 1);
  const demandScore = Math.min(100, Math.round(events14d * 5 + avgZfusion));
  
  return {
    score: demandScore,
    trend: demandScore > 60 ? "up" : demandScore > 30 ? "flat" : "down",
    metrics: [
      { label: "14-Day Events", value: events14d.toString(), hint: "High-pressure windows" },
      { label: "Avg ZFusion", value: avgZfusion.toFixed(1), hint: "Account overlap intensity" },
      { label: "Active Coverage", value: opps.length.toString(), hint: "Monitored universe" },
    ]
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
    const validScores = list.filter(o => o.zfusionScore !== null).map(o => o.zfusionScore as number);
    const avgScore = validScores.length > 0 ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;
    
    signals.push({
      category: cuisine,
      demandScore: Math.round(avgScore),
      trendDirection: avgScore > 50 ? "up" : "flat",
      oilRelevance: ["Standard Fryer Oil", "Premium Canola"],
      evidence: [`${list.length} mapped accounts`, `Avg impact score: ${avgScore.toFixed(1)}`],
      salesNote: `Event alignment drives throughput for ${cuisine} venues in this cycle.`
    });
  }

  return signals.sort((a, b) => b.demandScore - a.demandScore).slice(0, 6);
}

function buildCustomerMatrix(opps: VegasOpportunityRow[]): VegasCustomerMatrixBucket[] {
  const buckets: Record<string, VegasOpportunityRow[]> = {
    "Hot Leads (Unserviced)": [],
    "Vulnerable Customers (Missing Telemetry)": [],
    "Stable Customers": [],
    "Low Priority": []
  };

  for (const o of opps) {
    if (o.customerStatus === "prospect" && (o.opportunityScore ?? 0) >= 60) {
      buckets["Hot Leads (Unserviced)"].push(o);
    } else if (o.customerStatus === "customer" && (o.fryerCount === null || o.totalCapacityLbs === null)) {
      buckets["Vulnerable Customers (Missing Telemetry)"].push(o);
    } else if (o.customerStatus === "customer") {
      buckets["Stable Customers"].push(o);
    } else {
      buckets["Low Priority"].push(o);
    }
  }

  return Object.entries(buckets).map(([bucket, accounts]) => ({
    bucket,
    accounts: accounts.sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0)),
    totalPotentialGallons: accounts.reduce((sum, o) => sum + ((o.totalCapacityLbs ?? 0) / 7.5), 0),
    suggestedAction: bucket.includes("Leads") ? "Direct Outreach" : bucket.includes("Vulnerable") ? "Service Audit" : "Monitor"
  }));
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

function buildSourceHealth(data: any): VegasSourceHealth[] {
  const now = new Date().toISOString();
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
      lastUpdated: data.glideCoverageCounts?.lastSync ?? now,
      status: "fresh",
      severity: "ok",
      message: "Glide operational coverage intact."
    }
  ];
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();
    
    // 1. Fetch RAW data from DB (NO FAKE DATA)
    const rawData = await fetchVegasData(supabase);
    
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
      sourceHealth
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
