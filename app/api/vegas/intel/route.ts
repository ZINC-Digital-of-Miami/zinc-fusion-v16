import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, VegasIntelSnapshot } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTrustedMarketSnapshot,
  TRUSTED_MARKET_SOURCE_FEEDS,
  uniqueTrustedMarketUrls,
} from "@/lib/server/trusted-market-sources";

type VegasIntelCards = {
  upcomingEvents: AiCardContent;
  aiSalesStrategy: AiCardContent;
  restaurantAccounts: AiCardContent;
  fryerTracking: AiCardContent;
};

type VegasIntelAiSnapshot = {
  snapshot?: Partial<VegasIntelSnapshot>;
  cards?: VegasIntelCards;
} & AiSnapshotMeta;

const VEGAS_INSTRUCTIONS: Record<keyof VegasIntelCards, StrategicSpecialInstructions> = {
  upcomingEvents: {
    cardTopic: "Event-Driven Demand Window Risk",
    strategicObjective:
      "Map near-term event concentration to procurement and service-demand timing so account outreach aligns with real demand spikes.",
    neuralConnectionThesis:
      "Convention and sports clusters create synchronized demand surges; timing outreach and service readiness before peak windows improves conversion and operational resilience.",
    quantResearchProtocol: [
      "Count upcoming events by window and expected demand intensity.",
      "Identify overlap windows with highest load concentration.",
      "Rank event clusters by likely account impact and urgency.",
      "Translate event pressure into scheduling and outreach priorities.",
    ],
    inferenceConstraints: [
      "Do not treat all events as equal demand impact.",
      "Do not issue urgency without timing-window evidence.",
      "Do not separate event insight from account execution impact.",
    ],
    outputRequirements: [
      "State highest-pressure event windows.",
      "Describe expected demand behavior by window.",
      "Provide specific outreach timing recommendation.",
    ],
  },
  aiSalesStrategy: {
    cardTopic: "Account-Level Sales Execution Strategy",
    strategicObjective:
      "Generate account-targeted sales strategy that links oil-cost control narrative to each customer’s demand timing and service profile.",
    neuralConnectionThesis:
      "Sales conversion improves when procurement certainty messaging is synchronized with account-specific volume pressure and event exposure.",
    quantResearchProtocol: [
      "Segment accounts by event sensitivity and service-cycle urgency.",
      "Prioritize high-volume/high-volatility accounts first.",
      "Align pitch angle to cost-certainty and operational continuity outcomes.",
      "Sequence recommendations by conversion probability and timing risk.",
    ],
    inferenceConstraints: [
      "Do not output generic sales copy detached from account context.",
      "Do not prioritize low-impact accounts over high-pressure accounts.",
      "Do not omit operational readiness implications.",
    ],
    outputRequirements: [
      "State primary strategy theme for current cycle.",
      "Explain why sequencing supports conversion.",
      "Provide actionable outreach order or cadence guidance.",
    ],
  },
  restaurantAccounts: {
    cardTopic: "Account Priority and Opportunity Concentration",
    strategicObjective:
      "Identify highest-value account opportunities with explicit reasoning tied to event sensitivity, volume pattern, and service window alignment.",
    neuralConnectionThesis:
      "Opportunity concentration is maximized when account priority scores combine event exposure, expected throughput, and current service-cycle state.",
    quantResearchProtocol: [
      "Rank accounts by implied demand spike probability.",
      "Incorporate service-cycle timing into priority score.",
      "Separate near-term close opportunities from longer-horizon nurture accounts.",
      "Attach rationale in buyer/sales operations language.",
    ],
    inferenceConstraints: [
      "Do not use one-dimensional priority scoring.",
      "Do not omit service-cycle timing from recommendations.",
      "Do not overstate certainty without data recency context.",
    ],
    outputRequirements: [
      "State top account cluster focus.",
      "Explain priority rationale with timing context.",
      "Provide next-action guidance for field execution.",
    ],
  },
  fryerTracking: {
    cardTopic: "Fryer Lifecycle and Service Risk",
    strategicObjective:
      "Assess fryer lifecycle risk against demand windows to prevent service disruption and emergency replacement cost exposure.",
    neuralConnectionThesis:
      "High-throughput accounts with stressed fryer lifecycle profiles become operational bottlenecks during demand spikes; pre-emptive service alignment reduces failure risk.",
    quantResearchProtocol: [
      "Classify fryer risk by lifecycle stage and utilization pressure.",
      "Map lifecycle risk to upcoming demand windows.",
      "Prioritize service interventions by downtime-impact severity.",
      "Convert risk rank to scheduling actions for operations teams.",
    ],
    inferenceConstraints: [
      "Do not treat lifecycle risk independently from demand timing.",
      "Do not downplay high-throughput failure exposure.",
      "Do not provide guidance without actionable service prioritization.",
    ],
    outputRequirements: [
      "State current lifecycle risk posture.",
      "Highlight accounts needing proactive service first.",
      "Provide timing recommendation relative to event calendar.",
    ],
  },
};

function buildProvenance(
  generatedAt: string,
  asOf: string,
  cardKey: keyof VegasIntelCards,
  trustedUrls: string[],
): AiCardProvenance {
  return {
    asOf,
    generatedAt,
    method: "verified-db-and-trusted-market-pull",
    sourceFeeds: [
      "vegas.events",
      "vegas.restaurants",
      "vegas.customer_scores",
      "vegas.fryers",
      "vegas.event_impact",
      ...trustedUrls,
    ],
    sourceRecords: [
      {
        source: "vegas.events",
        table: "vegas.events",
        recordHint: "future event_date rows",
        observedAt: asOf,
      },
      {
        source: "vegas.restaurants",
        table: "vegas.restaurants",
        recordHint: "active account rows",
        observedAt: asOf,
      },
      {
        source: "trusted-market-pull",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const aiSnapshot = await readAiSnapshot<VegasIntelAiSnapshot>(
      "app/config/vegas-intel-ai.json",
    );
    const trustedMarket = await fetchTrustedMarketSnapshot();
    const trustedUrls = uniqueTrustedMarketUrls(trustedMarket);

    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date();
    in14.setDate(in14.getDate() + 14);
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const [
      { data: eventRows, error: evtError },
      { data: restaurantRows, error: restError },
      { data: fryerRows },
      { data: scoreRows },
      { data: impactRows },
    ] = await Promise.all([
      supabase
        .schema("vegas")
        .from("events")
        .select("id, event_name, event_date")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(200),
      supabase
        .schema("vegas")
        .from("restaurants")
        .select("id, restaurant_name, account_status")
        .eq("account_status", "active")
        .limit(500),
      supabase
        .schema("vegas")
        .from("fryers")
        .select("restaurant_id, fryer_count")
        .limit(500),
      supabase
        .schema("vegas")
        .from("customer_scores")
        .select("restaurant_id, score_date, score")
        .order("score_date", { ascending: false })
        .limit(500),
      supabase
        .schema("vegas")
        .from("event_impact")
        .select("event_id, restaurant_id, impact_score")
        .order("impact_score", { ascending: false })
        .limit(500),
    ]);

    if (evtError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: evtError.message },
        { status: 500 },
      );
    }

    if (restError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: restError.message },
        { status: 500 },
      );
    }

    const events = eventRows ?? [];
    const activeRestaurants = restaurantRows ?? [];
    const fryers = fryerRows ?? [];
    const customerScores = scoreRows ?? [];
    const eventImpacts = impactRows ?? [];

    const activeEvents = events.length;
    const highPriority = activeRestaurants.length;
    const events14d = events.filter((e) => new Date(e.event_date).getTime() <= in14.getTime()).length;
    const events30d = events.filter((e) => new Date(e.event_date).getTime() <= in30.getTime()).length;
    const nextEvent = events[0] ?? null;

    const knownFryerCounts = fryers
      .map((row) => Number(row.fryer_count))
      .filter((count) => Number.isFinite(count) && count >= 0);
    const totalFryers = knownFryerCounts.reduce((acc, count) => acc + count, 0);
    const lowRedundancySites = knownFryerCounts.filter((count) => count <= 1).length;
    const unknownFryerSites = Math.max(0, fryers.length - knownFryerCounts.length);

    const latestScoreDate = customerScores[0]?.score_date ?? null;
    const latestScores = customerScores.filter((row) => row.score_date === latestScoreDate);
    const scoredAccounts = latestScores
      .map((row) => Number(row.score))
      .filter((value) => Number.isFinite(value));
    const avgScore =
      scoredAccounts.length > 0
        ? scoredAccounts.reduce((acc, value) => acc + value, 0) / scoredAccounts.length
        : null;

    const impactValues = eventImpacts
      .map((row) => Number(row.impact_score))
      .filter((value) => Number.isFinite(value));
    const avgImpact =
      impactValues.length > 0
        ? impactValues.reduce((acc, value) => acc + value, 0) / impactValues.length
        : null;

    const dbSnapshot: VegasIntelSnapshot = {
      activeEvents,
      highPriorityAccounts: highPriority,
      updatedAt: new Date().toISOString(),
    };
    const snapshot: VegasIntelSnapshot = {
      activeEvents: aiSnapshot?.snapshot?.activeEvents ?? dbSnapshot.activeEvents,
      highPriorityAccounts:
        aiSnapshot?.snapshot?.highPriorityAccounts ?? dbSnapshot.highPriorityAccounts,
      updatedAt: aiSnapshot?.snapshot?.updatedAt ?? dbSnapshot.updatedAt,
    };

    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const asOf = snapshot.updatedAt;
    const cl = trustedMarket.cl.value;
    const cl5d = trustedMarket.cl.change5d;
    const vix = trustedMarket.vix.value;
    const cl5dText =
      cl5d === null ? "n/a" : `${cl5d * 100 >= 0 ? "+" : ""}${(cl5d * 100).toFixed(2)}%`;
    const fallbackCards: VegasIntelCards = {
      upcomingEvents: {
        title: "Upcoming Events",
        body: nextEvent
          ? `${events14d} events are scheduled over the next 14 days (${events30d} over 30 days). Next demand catalyst is ${nextEvent.event_name} on ${nextEvent.event_date}.`
          : "Hard stop: no verified vegas.events rows are available for upcoming demand-window analysis.",
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.upcomingEvents,
        provenance: buildProvenance(generatedAt, asOf, "upcomingEvents", trustedUrls),
      },
      aiSalesStrategy: {
        title: "AI Sales Strategy",
        body: activeRestaurants.length === 0 || events.length === 0
          ? "Hard stop: account-targeted strategy is blocked because verified event or active-account rows are missing."
          : `Prioritize high-volume active accounts ahead of the ${events14d > 0 ? "next two-week event cluster" : "next demand window"}. Average modeled event impact is ${avgImpact?.toFixed(2) ?? "n/a"}. Current oil-cost backdrop is CL ${cl?.toFixed(2) ?? "n/a"} with 5-day ${cl5dText} and VIX ${vix?.toFixed(2) ?? "n/a"}, so cost-certainty messaging should be staged and urgency-tiered.`,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.aiSalesStrategy,
        provenance: buildProvenance(generatedAt, asOf, "aiSalesStrategy", trustedUrls),
      },
      restaurantAccounts: {
        title: "Restaurant Accounts",
        body: latestScores.length === 0
          ? "Hard stop: no verified vegas.customer_scores rows are available for account-priority ranking."
          : `Latest scoring window (${latestScoreDate}) covers ${latestScores.length} accounts with average opportunity score ${avgScore?.toFixed(2) ?? "n/a"}. Sequence outreach from highest opportunity tier first, then roll down by event-window overlap.`,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.restaurantAccounts,
        provenance: buildProvenance(generatedAt, asOf, "restaurantAccounts", trustedUrls),
      },
      fryerTracking: {
        title: "Fryer Equipment Tracking",
        body: fryers.length === 0
          ? "Hard stop: fryer lifecycle guidance is blocked because no verified vegas.fryers rows are available."
          : knownFryerCounts.length === 0
            ? `Verified fryer rows exist for ${fryers.length} tracked sites, but fryer-count telemetry is not yet populated. Service prioritization should use event impact and account urgency until count telemetry is promoted.`
            : `Verified fryer inventory totals ${totalFryers} units across ${fryers.length} tracked sites; ${lowRedundancySites} sites run low redundancy (one fryer or fewer) and ${unknownFryerSites} sites still require fryer-count telemetry. Service prioritization should front-load low-redundancy sites before high-impact event windows.`,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.fryerTracking,
        provenance: buildProvenance(generatedAt, asOf, "fryerTracking", trustedUrls),
      },
    };

    const rawCards = aiSnapshot?.cards ?? fallbackCards;
    const cards: VegasIntelCards = {
      upcomingEvents: {
        ...fallbackCards.upcomingEvents,
        ...rawCards.upcomingEvents,
        strategicSpecialInstructions:
          rawCards.upcomingEvents?.strategicSpecialInstructions ??
          fallbackCards.upcomingEvents.strategicSpecialInstructions,
        provenance: rawCards.upcomingEvents?.provenance ?? fallbackCards.upcomingEvents.provenance,
      },
      aiSalesStrategy: {
        ...fallbackCards.aiSalesStrategy,
        ...rawCards.aiSalesStrategy,
        strategicSpecialInstructions:
          rawCards.aiSalesStrategy?.strategicSpecialInstructions ??
          fallbackCards.aiSalesStrategy.strategicSpecialInstructions,
        provenance: rawCards.aiSalesStrategy?.provenance ?? fallbackCards.aiSalesStrategy.provenance,
      },
      restaurantAccounts: {
        ...fallbackCards.restaurantAccounts,
        ...rawCards.restaurantAccounts,
        strategicSpecialInstructions:
          rawCards.restaurantAccounts?.strategicSpecialInstructions ??
          fallbackCards.restaurantAccounts.strategicSpecialInstructions,
        provenance:
          rawCards.restaurantAccounts?.provenance ?? fallbackCards.restaurantAccounts.provenance,
      },
      fryerTracking: {
        ...fallbackCards.fryerTracking,
        ...rawCards.fryerTracking,
        strategicSpecialInstructions:
          rawCards.fryerTracking?.strategicSpecialInstructions ??
          fallbackCards.fryerTracking.strategicSpecialInstructions,
        provenance: rawCards.fryerTracking?.provenance ?? fallbackCards.fryerTracking.provenance,
      },
    };

    const envelope: ApiEnvelope<VegasIntelSnapshot | null> = {
      ok: true,
      data: snapshot,
      asOf: new Date().toISOString(),
      source: ["vegas.events", "vegas.restaurants", "vegas.customer_scores", "vegas.fryers", "vegas.event_impact", ...TRUSTED_MARKET_SOURCE_FEEDS].join(","),
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
