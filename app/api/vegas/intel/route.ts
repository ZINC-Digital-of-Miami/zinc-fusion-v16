import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, VegasIntelSnapshot } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

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
): AiCardProvenance {
  return {
    asOf,
    generatedAt,
    method: "daily-ai-card-refresh",
    sourceFeeds: ["vegas.events", "vegas.restaurants", "app/config/vegas-intel-ai.json"],
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
        source: "ai-daily-refresh",
        table: "app/config/vegas-intel-ai.json",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const aiSnapshot = await readAiSnapshot<VegasIntelAiSnapshot>(
      "app/config/vegas-intel-ai.json",
    );

    const today = new Date().toISOString().slice(0, 10);

    const { count: activeEvents, error: evtError } = await supabase
      .schema("vegas")
      .from("events")
      .select("id", { count: "exact", head: true })
      .gte("event_date", today);

    if (evtError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: evtError.message },
        { status: 500 },
      );
    }

    const { count: highPriority, error: restError } = await supabase
      .schema("vegas")
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("account_status", "active");

    if (restError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: restError.message },
        { status: 500 },
      );
    }

    const dbSnapshot: VegasIntelSnapshot = {
      activeEvents: activeEvents ?? 0,
      highPriorityAccounts: highPriority ?? 0,
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
    const fallbackCards: VegasIntelCards = {
      upcomingEvents: {
        title: "Upcoming Events",
        body: "Awaiting daily AI pull for event-level demand implications.",
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.upcomingEvents,
        provenance: buildProvenance(generatedAt, asOf, "upcomingEvents"),
      },
      aiSalesStrategy: {
        title: "AI Sales Strategy",
        body: "Awaiting daily AI pull for account-targeted sales strategy recommendations.",
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.aiSalesStrategy,
        provenance: buildProvenance(generatedAt, asOf, "aiSalesStrategy"),
      },
      restaurantAccounts: {
        title: "Restaurant Accounts",
        body: "Awaiting daily AI pull for account-priority reasoning and timing guidance.",
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.restaurantAccounts,
        provenance: buildProvenance(generatedAt, asOf, "restaurantAccounts"),
      },
      fryerTracking: {
        title: "Fryer Equipment Tracking",
        body: "Awaiting daily AI pull for fryer lifecycle risk and service-window prioritization.",
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.fryerTracking,
        provenance: buildProvenance(generatedAt, asOf, "fryerTracking"),
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
      source: "vegas.events,vegas.restaurants",
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
