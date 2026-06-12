import { NextResponse } from "next/server";

import type {
  AiCardContent,
  AiCardProvenance,
  StrategicSpecialInstructions,
} from "@/lib/contracts/ai-card";
import type {
  ApiEnvelope,
  VegasEventRow,
  VegasGlideTableCounts,
  VegasIntelSnapshot,
  VegasIntelStats,
  VegasOpportunityRow,
} from "@/lib/contracts/api";
import { withAudienceInstructionGuardrails } from "@/lib/server/ai-instruction-guardrails";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createServerDataClient } from "@/lib/server/server-data-client";
import { fetchVegasData } from "@/lib/vegas/fetchVegasIntel";
import {
  asObject,
  estimateOilLbsPerWeek,
  normalizeCuisineType,
  normalizeEventCategory,
  pickBoolean,
  pickGlideData,
  pickNumber,
  pickString,
  resolveCuisineAffinity,
  serviceChangesPerWeek,
  toDaysUntil,
  toDurationDays,
  toEventColor,
  toNullableIso,
} from "@/lib/vegas/normalizeVegasIntel";

type VegasCards = {
  upcomingEvents: AiCardContent;
  aiSalesStrategy: AiCardContent;
  restaurantAccounts: AiCardContent;
  fryerTracking: AiCardContent;
};

type VegasIntelAiSnapshot = {
  snapshot?: Partial<VegasIntelSnapshot>;
  cards?: VegasCards;
} & AiSnapshotMeta;

export type VegasIntelResponse = ApiEnvelope<VegasIntelSnapshot | null> & {
  cards: VegasCards;
  stats: VegasIntelStats;
  glideTables: VegasGlideTableCounts;
  events: VegasEventRow[];
  opportunities: VegasOpportunityRow[];
};

const VEGAS_INSTRUCTIONS: Record<keyof VegasCards, StrategicSpecialInstructions> = {
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

// PHQ-style attendance signal: deterministic 0.5–2.0 multiplier from verified
// event attendance, mirroring the V15 approximation (attendance capped at 100k).
function toPhqMultiplier(attendance: number): number {
  const attendanceScore = Math.min(100000, Math.max(0, attendance || 5000)) / 100000;
  return 0.5 + attendanceScore * 1.5;
}

function buildProvenance(
  generatedAt: string,
  asOf: string,
  cardKey: keyof VegasCards,
): AiCardProvenance {
  return {
    asOf,
    generatedAt,
    method: "verified-db-deterministic",
    sourceFeeds: [
      "vegas.events",
      "vegas.restaurants",
      "vegas.customer_scores",
      "vegas.fryers",
      "vegas.event_impact",
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
        recordHint: "Glide-synced account rows",
        observedAt: asOf,
      },
      {
        source: "verified-db-deterministic",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
  };
}

function kevinUpcomingEventsBody(params: {
  nextEvent: VegasEventRow | null;
  events14d: number;
  events30d: number;
}): string {
  if (!params.nextEvent) {
    return "Hard stop: no verified future-event rows are available for demand-window planning.";
  }
  return `${params.events14d} events inside 14 days (${params.events30d} inside 30). Next pulse: ${params.nextEvent.name} on ${params.nextEvent.startDate}. Show up with talking points, not hotel caffeine.`;
}

function kevinSalesStrategyBody(params: {
  opportunitiesCount: number;
  eventsCount: number;
  accountsWithOilEstimate: number;
  totalEstimatedOilLbs: number;
  nextEvent: VegasEventRow | null;
}): string {
  if (params.opportunitiesCount === 0 || params.eventsCount === 0) {
    return "Hard stop: strategy is blocked because verified event or account rows are missing.";
  }
  const volumeText =
    params.accountsWithOilEstimate > 0
      ? `${params.accountsWithOilEstimate} of ${params.opportunitiesCount} accounts carry a verified weekly oil estimate totaling ${params.totalEstimatedOilLbs.toLocaleString()} lbs`
      : `none of the ${params.opportunitiesCount} accounts has complete fryer-capacity plus cadence telemetry yet, so weekly oil volume cannot be estimated`;
  const timingText = params.nextEvent
    ? `The next demand window is ${params.nextEvent.name} in ${params.nextEvent.daysUntil} days; sequence outreach by event date first, then by verified volume.`
    : "No verified upcoming event window is loaded; sequence outreach by verified volume and service cadence.";
  return `${volumeText}. ${timingText}`;
}

function kevinRestaurantAccountsBody(params: {
  opportunitiesCount: number;
  scoredCount: number;
  highPriorityCount: number;
  telemetryCompleteCount: number;
}): string {
  if (params.opportunitiesCount === 0) {
    return "Hard stop: no verified Glide account rows are available for account ranking.";
  }
  if (params.scoredCount === 0) {
    return `${params.opportunitiesCount} tracked Glide accounts; no verified customer-score rows are landed yet, so ranking uses telemetry completeness and estimated volume only. ${params.telemetryCompleteCount} of ${params.opportunitiesCount} accounts have full fryer and capacity telemetry.`;
  }
  const qualifiedRate = (params.highPriorityCount / params.scoredCount) * 100;
  return `${params.opportunitiesCount} tracked accounts, ${params.scoredCount} scored, ${params.highPriorityCount} priority. Qualified rate ${qualifiedRate.toFixed(1)}%. If this gets thinner, the carpet may out-network the booth.`;
}

function kevinFryerTrackingBody(params: {
  activeFryerRowsCount: number;
  telemetryCapacityCount: number;
  nextEventName: string | null;
}): string {
  if (params.activeFryerRowsCount === 0) {
    return "Hard stop: fryer guidance is blocked because verified fryer rows are missing.";
  }
  return `Verified fryer rows: ${params.activeFryerRowsCount}; populated capacity rows: ${params.telemetryCapacityCount}. Close telemetry gaps before ${params.nextEventName ?? "the next demand window"} so service calls are planned, not heroic.`;
}

// Snapshot title/instructions/provenance win when present, but the body is
// always the deterministic server-computed text from verified rows.
function mergeCard(
  fallback: AiCardContent,
  raw: AiCardContent | undefined,
  voicedBody: string,
): AiCardContent {
  return {
    ...fallback,
    ...raw,
    body: voicedBody,
    strategicSpecialInstructions: withAudienceInstructionGuardrails(
      raw?.strategicSpecialInstructions ?? fallback.strategicSpecialInstructions,
      "kevin",
    ),
    provenance: raw?.provenance ?? fallback.provenance,
  };
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();
    const now = new Date();

    const [data, aiSnapshot] = await Promise.all([
      fetchVegasData(supabase),
      readAiSnapshot<VegasIntelAiSnapshot>("app/config/vegas-intel-ai.json"),
    ]);
    const { glideCoverageCounts } = data;

    const glideRestaurantRows = data.restaurants.filter((row) => {
      const meta = asObject(row.metadata);
      return pickString(meta, ["source"]) === "glide";
    });
    const activeRestaurantRows = glideRestaurantRows;
    const activeRestaurantIds = new Set(activeRestaurantRows.map((row) => row.id));
    const activeFryerRows = data.fryers.filter(
      (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
    );
    const activeScoreRows = data.customerScores.filter(
      (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
    );
    const activeImpactRows = data.eventImpacts.filter(
      (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
    );

    const venueMap = new Map<number, string>();
    for (const row of data.venues) {
      venueMap.set(row.id, row.venue_name);
    }

    const casinoNameMap = new Map<string, string>();
    const casinoAddressMap = new Map<string, string>();
    for (const row of data.casinos) {
      const meta = asObject(row.metadata);
      const glideData = pickGlideData(meta);
      const address =
        pickString(meta, ["address", "L9K9x"]) ?? pickString(glideData, ["L9K9x", "address"]);
      casinoNameMap.set(String(row.id), row.casino_name);
      if (address) casinoAddressMap.set(String(row.id), address);
      const glideRowId = pickString(meta, ["glide_row_id", "row_id", "rowId", "glideRowId"]);
      if (glideRowId) {
        casinoNameMap.set(glideRowId, row.casino_name);
        if (address) casinoAddressMap.set(glideRowId, address);
      }
    }

    const events: VegasEventRow[] = data.events
      .map((row): VegasEventRow | null => {
        const meta = asObject(row.metadata);
        const isActive = meta.is_active;
        if (typeof isActive === "boolean" && !isActive) return null;

        const category = normalizeEventCategory(
          pickString(meta, ["event_type", "category", "eventCategory", "type"]),
        );
        const attendance = pickNumber(meta, ["attendance", "rank", "predicted_attendance"]) ?? 0;
        const venue =
          pickString(meta, ["venue", "venue_name", "location_name"]) ??
          (row.venue_id ? venueMap.get(row.venue_id) ?? null : null);
        const startDate = row.event_date;
        const endDate = pickString(meta, ["end_date", "endDate", "event_end_date"]) ?? null;

        return {
          id: row.id,
          name: row.event_name,
          category,
          venue,
          attendance,
          startDate,
          endDate,
          durationDays: toDurationDays(startDate, endDate),
          daysUntil: toDaysUntil(now, startDate),
          color: toEventColor(category),
          location: pickString(meta, ["location", "address", "city"]),
        } satisfies VegasEventRow;
      })
      .filter((row): row is VegasEventRow => row !== null)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    const eventById = new Map<number, VegasEventRow>();
    for (const event of events) {
      eventById.set(event.id, event);
    }
    // Rows without verified event-impact linkage fall back to the next verified
    // upcoming event window; nothing synthetic is invented for them.
    const defaultLinkedEvent = events[0] ?? null;

    const latestScoreByRestaurant = new Map<number, number>();
    const latestDateByRestaurant = new Map<number, string>();
    for (const row of activeScoreRows) {
      if (!row.restaurant_id || row.score === null) continue;
      const parsedScore = Number(row.score);
      if (!Number.isFinite(parsedScore)) continue;
      const prevDate = latestDateByRestaurant.get(row.restaurant_id);
      if (!prevDate || row.score_date >= prevDate) {
        latestDateByRestaurant.set(row.restaurant_id, row.score_date);
        latestScoreByRestaurant.set(row.restaurant_id, parsedScore);
      }
    }

    const impactSumByRestaurant = new Map<number, number>();
    const impactCountByRestaurant = new Map<number, number>();
    const topImpactByRestaurant = new Map<
      number,
      { eventId: number; impactScore: number; expectedSpend: number | null }
    >();
    for (const row of activeImpactRows) {
      if (!row.restaurant_id || row.impact_score === null) continue;
      const parsedImpact = Number(row.impact_score);
      if (!Number.isFinite(parsedImpact)) continue;
      impactSumByRestaurant.set(
        row.restaurant_id,
        (impactSumByRestaurant.get(row.restaurant_id) ?? 0) + parsedImpact,
      );
      impactCountByRestaurant.set(
        row.restaurant_id,
        (impactCountByRestaurant.get(row.restaurant_id) ?? 0) + 1,
      );

      if (!row.event_id) continue;
      const impactMeta = asObject(row.metadata);
      const expectedSpend = pickNumber(impactMeta, [
        "expected_spend",
        "hospitality_spend",
        "predicted_spend",
      ]);
      const currentTop = topImpactByRestaurant.get(row.restaurant_id);
      if (!currentTop || parsedImpact > currentTop.impactScore) {
        topImpactByRestaurant.set(row.restaurant_id, {
          eventId: row.event_id,
          impactScore: parsedImpact,
          expectedSpend,
        });
      }
    }

    const fryerCountByRestaurant = new Map<number, number>();
    const capacityByRestaurant = new Map<number, number>();
    for (const row of activeFryerRows) {
      if (!row.restaurant_id) continue;
      const fryerCount = row.fryer_count ?? 0;
      fryerCountByRestaurant.set(
        row.restaurant_id,
        (fryerCountByRestaurant.get(row.restaurant_id) ?? 0) + fryerCount,
      );
      const meta = asObject(row.metadata);
      const capacity = pickNumber(meta, ["total_capacity_lbs", "capacity_lbs", "xhrM0"]);
      if (capacity !== null) {
        capacityByRestaurant.set(
          row.restaurant_id,
          (capacityByRestaurant.get(row.restaurant_id) ?? 0) + capacity,
        );
      }
    }

    const opportunities: VegasOpportunityRow[] = activeRestaurantRows
      .map((row) => {
        const meta = asObject(row.metadata);
        const glideData = pickGlideData(meta);
        const serviceCadence =
          pickString(meta, ["service_frequency", "serviceFrequency", "Po4Zg"]) ??
          pickString(glideData, ["service_frequency", "serviceFrequency", "Po4Zg"]);
        const serviceDays =
          pickString(meta, ["service_days", "serviceDays", "lf0gF"]) ??
          pickString(glideData, ["service_days", "serviceDays", "lf0gF"]);
        const serviceFrequencyLabel =
          serviceCadence && serviceDays ? `${serviceCadence} (${serviceDays})` : serviceCadence;
        // Glide rows are existing serviced accounts even when the cadence field
        // is sparse; only verified non-Glide universes can produce prospects.
        const customerStatus = pickString(meta, ["source"]) === "glide"
          ? "customer"
          : serviceCadence
            ? "customer"
            : "prospect";
        const casinoLink =
          pickString(meta, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
          pickString(glideData, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
          pickString(meta, ["casino_glide_row_id"]) ??
          null;
        const casino = casinoLink ? casinoNameMap.get(casinoLink) ?? casinoLink : null;
        const location = casinoLink ? casinoAddressMap.get(casinoLink) ?? null : null;
        const restaurantId = row.id;
        const impactCount = impactCountByRestaurant.get(restaurantId) ?? 0;
        const eventPressure =
          impactCount > 0 ? (impactSumByRestaurant.get(restaurantId) ?? 0) / impactCount : null;
        const topImpact = topImpactByRestaurant.get(restaurantId);
        const topEvent = topImpact ? eventById.get(topImpact.eventId) ?? null : null;
        const linkedEvent = topEvent ?? defaultLinkedEvent;
        const cuisineType = normalizeCuisineType(
          pickString(meta, ["cuisine_type", "cuisineType", "cuisine"]) ??
            pickString(glideData, ["cuisine_type", "cuisineType", "cuisine"]),
        );
        const isServiceCuisine = cuisineType === "service";
        const affinity =
          isServiceCuisine || !linkedEvent
            ? null
            : resolveCuisineAffinity(linkedEvent.category, cuisineType);
        const phqMultiplier = linkedEvent ? toPhqMultiplier(linkedEvent.attendance) : null;
        const hospitalityImpact = topImpact?.impactScore ?? eventPressure;
        // Spend is a modeled signal: only verified event-impact metadata may
        // populate it. Restaurant/Glide metadata is not a verified spend source.
        const expectedSpend = topImpact?.expectedSpend ?? null;
        const zfusionScore =
          affinity === null || hospitalityImpact === null || phqMultiplier === null
            ? null
            : Math.min(100, (affinity.score / 100) * hospitalityImpact * phqMultiplier);

        const totalCapacity = capacityByRestaurant.get(restaurantId) ?? null;
        const fryerCount = fryerCountByRestaurant.get(restaurantId) ?? null;
        const changesPerWeek = serviceChangesPerWeek(serviceCadence, serviceDays);
        const estimatedOilLbsPerWeek = estimateOilLbsPerWeek(totalCapacity, changesPerWeek);

        return {
          id: restaurantId,
          glideRowId:
            pickString(meta, ["glide_row_id", "row_id", "rowId", "glideRowId"]) ??
            pickString(glideData, ["glide_row_id", "$rowID", "row_id", "rowId", "glideRowId"]),
          name: row.restaurant_name,
          casino,
          location,
          contactPerson:
            pickString(meta, ["contact_person", "primary_contact", "doeXs"]) ??
            pickString(glideData, ["doeXs", "primary_contact", "Ie35Z", "a3ffP", "maCR5"]),
          contactEmail:
            pickString(meta, ["contact_email", "contactEmail", "a3ffP", "maCR5"]) ??
            pickString(glideData, ["a3ffP", "maCR5", "contact_email", "contactEmail"]),
          serviceFrequency: serviceFrequencyLabel,
          changesPerWeek,
          oilType:
            pickString(meta, ["oil_type", "oilType", "U0Jf2"]) ??
            pickString(glideData, ["oil_type", "oilType", "U0Jf2", "UYUGq"]),
          oilForm:
            pickString(meta, ["oil_form", "oilForm", "0RcWz"]) ??
            pickString(glideData, ["oil_form", "oilForm", "0RcWz"]),
          cuisineType,
          status:
            row.account_status ??
            pickString(meta, ["status", "s8tNr"]) ??
            pickString(glideData, ["status", "s8tNr"]),
          fryerCount,
          totalCapacityLbs: totalCapacity,
          estimatedOilLbsPerWeek,
          customerStatus,
          eventId: linkedEvent?.id ?? null,
          eventName: linkedEvent?.name ?? null,
          eventCategory: linkedEvent?.category ?? null,
          eventDate: linkedEvent?.startDate ?? null,
          eventDaysUntil: linkedEvent?.daysUntil ?? null,
          cuisineAffinityScore: affinity?.score ?? null,
          cuisineAffinityReason: isServiceCuisine
            ? "Service account excluded from dining opportunity scoring."
            : affinity?.reason ?? null,
          opportunityScore: latestScoreByRestaurant.get(restaurantId) ?? null,
          eventPressure,
          expectedSpend,
          hospitalityImpact,
          phqMultiplier,
          zfusionScore,
          shiftCount:
            pickNumber(meta, [
              "shift_count",
              "shiftCount",
              "assigned_shift_count",
              "assignedShiftCount",
            ]) ?? pickNumber(glideData, ["shift_count", "shiftCount", "assigned_shift_count"]),
          scheduledReportCount:
            pickNumber(meta, [
              "scheduled_reports_count",
              "scheduledReportCount",
              "report_count",
              "maintenance_report_count",
            ]) ??
            pickNumber(glideData, [
              "scheduled_reports_count",
              "scheduledReportCount",
              "report_count",
              "maintenance_report_count",
            ]),
          exportListed:
            pickBoolean(meta, [
              "export_list",
              "in_export_list",
              "exportListed",
              "is_export_listed",
            ]) ?? pickBoolean(glideData, ["export_list", "in_export_list", "exportListed", "Ny3eQ"]),
          metadata: meta,
        } satisfies VegasOpportunityRow;
      })
      .sort((a, b) => {
        // Verified service accounts rank before prospects.
        if (a.customerStatus !== b.customerStatus) {
          return a.customerStatus === "customer" ? -1 : 1;
        }

        // Real estimated weekly oil volume is the strongest verified signal.
        const oilA = a.estimatedOilLbsPerWeek ?? Number.NEGATIVE_INFINITY;
        const oilB = b.estimatedOilLbsPerWeek ?? Number.NEGATIVE_INFINITY;
        if (oilA !== oilB) return oilB - oilA;

        // Glide telemetry completeness outranks modeled scores so well-documented
        // accounts surface before sparsely populated rows.
        const completenessScoreA =
          Number(a.serviceFrequency !== null) +
          Number(a.oilType !== null) +
          Number(a.contactPerson !== null) +
          Number(a.totalCapacityLbs !== null) +
          Number(a.eventDate !== null);
        const completenessScoreB =
          Number(b.serviceFrequency !== null) +
          Number(b.oilType !== null) +
          Number(b.contactPerson !== null) +
          Number(b.totalCapacityLbs !== null) +
          Number(b.eventDate !== null);
        if (completenessScoreA !== completenessScoreB) return completenessScoreB - completenessScoreA;

        // Soonest verified demand window first.
        const eventA = a.eventDaysUntil ?? Number.POSITIVE_INFINITY;
        const eventB = b.eventDaysUntil ?? Number.POSITIVE_INFINITY;
        if (eventA !== eventB) return eventA - eventB;

        // Modeled scores last; they exist only when verified score/impact rows do.
        const zfusionA = a.zfusionScore ?? Number.NEGATIVE_INFINITY;
        const zfusionB = b.zfusionScore ?? Number.NEGATIVE_INFINITY;
        if (zfusionA !== zfusionB) return zfusionB - zfusionA;

        const scoreA = a.opportunityScore ?? Number.NEGATIVE_INFINITY;
        const scoreB = b.opportunityScore ?? Number.NEGATIVE_INFINITY;
        return scoreB - scoreA;
      });

    const events14d = events.filter((row) => row.daysUntil <= 14).length;
    const events30d = events.filter((row) => row.daysUntil <= 30).length;
    const nextEvent = events[0] ?? null;

    const scoredValues = opportunities
      .map((row) => row.opportunityScore)
      .filter((value): value is number => value !== null);

    const oilEstimates = opportunities
      .map((row) => row.estimatedOilLbsPerWeek)
      .filter((value): value is number => value !== null);
    const totalEstimatedOilLbs = oilEstimates.reduce((sum, value) => sum + value, 0);

    const telemetryCompleteCount = opportunities.filter(
      (row) => row.fryerCount !== null && row.totalCapacityLbs !== null,
    ).length;

    const allIngestedTimestamps = [
      ...data.events.map((row) => row.ingested_at),
      ...activeRestaurantRows.map((row) => row.ingested_at),
      ...data.casinos.map((row) => row.ingested_at),
      ...activeFryerRows.map((row) => row.ingested_at),
    ]
      .map((value) => toNullableIso(value))
      .filter((value): value is string => value !== null)
      .sort();
    const lastSync = allIngestedTimestamps.at(-1) ?? null;

    const stats: VegasIntelStats = {
      restaurants: activeRestaurantRows.length,
      casinos: data.casinos.length,
      fryers: activeFryerRows.length,
      exportList: glideCoverageCounts.exportList,
      shifts: glideCoverageCounts.shifts,
      scheduledReports: glideCoverageCounts.scheduledReports,
      shiftCasinos: glideCoverageCounts.shiftCasinos,
      shiftRestaurants: glideCoverageCounts.shiftRestaurants,
      lastSync,
    };

    const glideTables: VegasGlideTableCounts = {
      restaurants: activeRestaurantRows.length,
      casinos: data.casinos.length,
      fryers: activeFryerRows.length,
      exportList: glideCoverageCounts.exportList,
      scheduledReports: glideCoverageCounts.scheduledReports,
      shifts: glideCoverageCounts.shifts,
      shiftCasinos: glideCoverageCounts.shiftCasinos,
      shiftRestaurants: glideCoverageCounts.shiftRestaurants,
    };

    const highPriorityCount = opportunities.filter((row) => {
      if (row.opportunityScore === null) return false;
      return row.customerStatus === "prospect" && row.opportunityScore >= 65;
    }).length;

    const dbSnapshot: VegasIntelSnapshot = {
      activeEvents: events.length,
      highPriorityAccounts: highPriorityCount,
      updatedAt: lastSync ?? new Date().toISOString(),
    };

    const snapshot: VegasIntelSnapshot = {
      activeEvents: aiSnapshot?.snapshot?.activeEvents ?? dbSnapshot.activeEvents,
      highPriorityAccounts:
        aiSnapshot?.snapshot?.highPriorityAccounts ?? dbSnapshot.highPriorityAccounts,
      updatedAt: aiSnapshot?.snapshot?.updatedAt ?? dbSnapshot.updatedAt,
    };

    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const asOf = snapshot.updatedAt;

    const voicedBodies: Record<keyof VegasCards, string> = {
      upcomingEvents: kevinUpcomingEventsBody({ nextEvent, events14d, events30d }),
      aiSalesStrategy: kevinSalesStrategyBody({
        opportunitiesCount: opportunities.length,
        eventsCount: events.length,
        accountsWithOilEstimate: oilEstimates.length,
        totalEstimatedOilLbs,
        nextEvent,
      }),
      restaurantAccounts: kevinRestaurantAccountsBody({
        opportunitiesCount: opportunities.length,
        scoredCount: scoredValues.length,
        highPriorityCount,
        telemetryCompleteCount,
      }),
      fryerTracking: kevinFryerTrackingBody({
        activeFryerRowsCount: activeFryerRows.length,
        telemetryCapacityCount: Array.from(capacityByRestaurant.values()).length,
        nextEventName: nextEvent?.name ?? null,
      }),
    };

    const fallbackCards: VegasCards = {
      upcomingEvents: {
        title: "Upcoming Events",
        body: voicedBodies.upcomingEvents,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.upcomingEvents,
        provenance: buildProvenance(generatedAt, asOf, "upcomingEvents"),
      },
      aiSalesStrategy: {
        title: "AI Sales Strategy",
        body: voicedBodies.aiSalesStrategy,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.aiSalesStrategy,
        provenance: buildProvenance(generatedAt, asOf, "aiSalesStrategy"),
      },
      restaurantAccounts: {
        title: "Restaurant Accounts",
        body: voicedBodies.restaurantAccounts,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.restaurantAccounts,
        provenance: buildProvenance(generatedAt, asOf, "restaurantAccounts"),
      },
      fryerTracking: {
        title: "Fryer Equipment Tracking",
        body: voicedBodies.fryerTracking,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.fryerTracking,
        provenance: buildProvenance(generatedAt, asOf, "fryerTracking"),
      },
    };

    const rawCards = aiSnapshot?.cards;
    const cards: VegasCards = {
      upcomingEvents: mergeCard(
        fallbackCards.upcomingEvents,
        rawCards?.upcomingEvents,
        voicedBodies.upcomingEvents,
      ),
      aiSalesStrategy: mergeCard(
        fallbackCards.aiSalesStrategy,
        rawCards?.aiSalesStrategy,
        voicedBodies.aiSalesStrategy,
      ),
      restaurantAccounts: mergeCard(
        fallbackCards.restaurantAccounts,
        rawCards?.restaurantAccounts,
        voicedBodies.restaurantAccounts,
      ),
      fryerTracking: mergeCard(
        fallbackCards.fryerTracking,
        rawCards?.fryerTracking,
        voicedBodies.fryerTracking,
      ),
    };

    const envelope: ApiEnvelope<VegasIntelSnapshot | null> = {
      ok: true,
      data: snapshot,
      asOf: new Date().toISOString(),
      source: [
        "vegas.events",
        "vegas.restaurants",
        "vegas.casinos",
        "vegas.fryers",
        "vegas.export_list",
        "vegas.scheduled_reports",
        "vegas.shifts",
        "vegas.shift_casinos",
        "vegas.shift_restaurants",
        "vegas.customer_scores",
        "vegas.event_impact",
      ].join(","),
    };

    const payload: VegasIntelResponse = {
      ...envelope,
      cards,
      stats,
      glideTables,
      events,
      opportunities,
    };

    return NextResponse.json({
      ...payload,
      ai: toAiEnvelopeMeta(aiSnapshot),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
