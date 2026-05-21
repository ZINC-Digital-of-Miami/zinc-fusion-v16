import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type {
  ApiEnvelope,
  VegasEventRow,
  VegasIntelSnapshot,
  VegasIntelStats,
  VegasOpportunityRow,
} from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTrustedMarketSnapshot,
  TRUSTED_MARKET_SOURCE_FEEDS,
  uniqueTrustedMarketUrls,
} from "@/lib/server/trusted-market-sources";

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

type RestaurantRow = {
  id: number;
  restaurant_name: string;
  account_status: string | null;
  metadata: unknown;
  ingested_at: string;
};

type CasinoRow = {
  id: number;
  casino_name: string;
  metadata: unknown;
  ingested_at: string;
};

type EventRow = {
  id: number;
  event_name: string;
  event_date: string;
  venue_id: number | null;
  metadata: unknown;
  ingested_at: string;
};

type VenueRow = {
  id: number;
  venue_name: string;
  metadata: unknown;
};

type FryerRow = {
  restaurant_id: number | null;
  fryer_count: number | null;
  metadata: unknown;
  ingested_at: string;
};

type CustomerScoreRow = {
  restaurant_id: number | null;
  score_date: string;
  score: number | null;
};

type EventImpactRow = {
  event_id: number | null;
  restaurant_id: number | null;
  impact_score: number | null;
  metadata: unknown;
};

type OptionalCountQuery = {
  schema: "vegas" | "ops";
  table: string;
};

type GlideOptionalCounts = {
  exportList: number | null;
  shifts: number | null;
  scheduledReports: number | null;
  shiftCasinos: number | null;
  shiftRestaurants: number | null;
};

type CuisineAffinity = {
  score: number;
  reason: string;
};

const EVENT_COLOR_MAP: Record<string, string> = {
  expos: "#2962FF",
  conferences: "#14b8a6",
  concerts: "#a855f7",
  sports: "#22c55e",
  festivals: "#ff6b35",
  "performing-arts": "#f59e0b",
  community: "#06b6d4",
  "school-holidays": "#ec4899",
  fallback: "#6b7280",
};

const GLIDE_OPTIONAL_COUNT_QUERIES: Record<keyof GlideOptionalCounts, OptionalCountQuery[]> = {
  exportList: [
    { schema: "vegas", table: "export_list" },
    { schema: "ops", table: "glide_vegas_export_list" },
    { schema: "ops", table: "vegas_export_list" },
  ],
  shifts: [
    { schema: "vegas", table: "shifts" },
    { schema: "ops", table: "glide_vegas_shifts" },
    { schema: "ops", table: "vegas_shifts" },
  ],
  scheduledReports: [
    { schema: "vegas", table: "scheduled_reports" },
    { schema: "ops", table: "glide_vegas_scheduled_reports" },
    { schema: "ops", table: "vegas_scheduled_reports" },
  ],
  shiftCasinos: [
    { schema: "vegas", table: "shift_casinos" },
    { schema: "ops", table: "glide_vegas_shift_casinos" },
    { schema: "ops", table: "vegas_shift_casinos" },
  ],
  shiftRestaurants: [
    { schema: "vegas", table: "shift_restaurants" },
    { schema: "ops", table: "glide_vegas_shift_restaurants" },
    { schema: "ops", table: "vegas_shift_restaurants" },
  ],
};

const CUISINE_AFFINITY_MATRIX: Record<string, Record<string, CuisineAffinity>> = {
  expos: {
    steakhouse: { score: 88, reason: "Expo traffic favors hosted dinners and group dining." },
    asian: { score: 74, reason: "Expo groups often need quick, shareable business meals." },
    buffet: { score: 82, reason: "Expo windows increase demand for high-volume service formats." },
  },
  conferences: {
    steakhouse: { score: 85, reason: "Conference spend clusters around client meals and networking." },
    italian: { score: 77, reason: "Conference groups favor sit-down team meals near venues." },
    seafood: { score: 79, reason: "Conference dining budgets support higher-ticket menus." },
  },
  concerts: {
    burger: { score: 86, reason: "Concert windows reward fast pre-show and post-show turns." },
    pizza: { score: 84, reason: "Concert crowds lean toward fast, shareable meals." },
    pub: { score: 81, reason: "Concert demand drives drink-led and late-night volume." },
  },
  sports: {
    pub: { score: 90, reason: "Sports windows drive game-day wings, beer, and group tables." },
    burger: { score: 84, reason: "Sports events support repeat quick-service volume." },
    bbq: { score: 74, reason: "Sports parties create shareable, high-throughput orders." },
  },
  festivals: {
    mexican: { score: 82, reason: "Festival traffic skews to quick, flavorful, portable meals." },
    chicken: { score: 76, reason: "Festival windows reward fast, high-repeat menu items." },
    american: { score: 72, reason: "Festival crowds favor broad menus and quick throughput." },
  },
  "performing-arts": {
    italian: { score: 83, reason: "Theater demand favors pre-show sit-down dining." },
    seafood: { score: 80, reason: "Performing-arts nights lift premium dinner demand." },
    steakhouse: { score: 84, reason: "Performing-arts traffic supports upscale timed dining." },
  },
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

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickString(metadata: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/,/g, "").trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickBoolean(metadata: Record<string, unknown>, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "y", "1"].includes(normalized)) return true;
      if (["false", "no", "n", "0"].includes(normalized)) return false;
    }
  }
  return null;
}

function pickGlideData(metadata: Record<string, unknown>): Record<string, unknown> {
  return asObject(metadata.glide_data);
}

function normalizeEventCategory(value: string | null): string {
  if (!value) return "community";
  const normalized = value.trim().toLowerCase();
  if (normalized === "performing_arts") return "performing-arts";
  if (normalized === "school_holidays") return "school-holidays";
  if (normalized === "conference") return "conferences";
  if (normalized === "expo") return "expos";
  if (normalized === "concert") return "concerts";
  if (normalized === "sport") return "sports";
  if (normalized in EVENT_COLOR_MAP) return normalized;
  return "community";
}

function toEventColor(category: string): string {
  return EVENT_COLOR_MAP[category] ?? EVENT_COLOR_MAP.fallback;
}

function toMidnight(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toDaysUntil(current: Date, futureDateText: string): number {
  const now = toMidnight(current).getTime();
  const target = toMidnight(new Date(futureDateText)).getTime();
  return Math.max(0, Math.floor((target - now) / 86400000));
}

function toNullableIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toDurationDays(startDate: string, endDate: string | null): number {
  if (!endDate) return 1;
  const start = toMidnight(new Date(startDate)).getTime();
  const end = toMidnight(new Date(endDate)).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function normalizeCuisineType(value: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

function resolveCuisineAffinity(category: string, cuisineType: string | null): CuisineAffinity {
  if (!cuisineType) return { score: 30, reason: "General dining option." };
  const categoryMap = CUISINE_AFFINITY_MATRIX[category];
  if (!categoryMap) return { score: 30, reason: "General dining option." };
  return categoryMap[cuisineType] ?? { score: 30, reason: "General dining option." };
}

function toPhqMultiplier(attendance: number): number {
  const attendanceScore = Math.min(100000, Math.max(0, attendance || 5000)) / 100000;
  return 0.5 + attendanceScore * 1.5;
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = "code" in error ? String(error.code ?? "") : "";
  const maybeMessage = "message" in error ? String(error.message ?? "") : "";
  return maybeCode === "PGRST205" || maybeMessage.toLowerCase().includes("does not exist");
}

async function readOptionalCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  candidates: OptionalCountQuery[],
): Promise<number | null> {
  for (const candidate of candidates) {
    const { count, error } = await supabase
      .schema(candidate.schema)
      .from(candidate.table)
      .select("*", { count: "exact", head: true });
    if (!error) return count ?? 0;
    if (isMissingRelationError(error)) continue;
    throw error;
  }
  return null;
}

async function readGlideOptionalCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<GlideOptionalCounts> {
  const exportList = await readOptionalCount(supabase, GLIDE_OPTIONAL_COUNT_QUERIES.exportList);
  const shifts = await readOptionalCount(supabase, GLIDE_OPTIONAL_COUNT_QUERIES.shifts);
  const scheduledReports = await readOptionalCount(
    supabase,
    GLIDE_OPTIONAL_COUNT_QUERIES.scheduledReports,
  );
  const shiftCasinos = await readOptionalCount(
    supabase,
    GLIDE_OPTIONAL_COUNT_QUERIES.shiftCasinos,
  );
  const shiftRestaurants = await readOptionalCount(
    supabase,
    GLIDE_OPTIONAL_COUNT_QUERIES.shiftRestaurants,
  );
  return { exportList, shifts, scheduledReports, shiftCasinos, shiftRestaurants };
}

function buildProvenance(
  generatedAt: string,
  asOf: string,
  cardKey: keyof VegasCards,
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
    const now = new Date();
    const todayText = now.toISOString().slice(0, 10);

    const [
      glideOptionalCounts,
      { data: eventRowsRaw, error: eventError },
      { data: venueRowsRaw, error: venueError },
      { data: restaurantRowsRaw, error: restaurantError },
      { data: casinoRowsRaw, error: casinoError },
      { data: fryerRowsRaw, error: fryerError },
      { data: scoreRowsRaw, error: scoreError },
      { data: impactRowsRaw, error: impactError },
    ] = await Promise.all([
      readGlideOptionalCounts(supabase),
      supabase
        .schema("vegas")
        .from("events")
        .select("id, event_name, event_date, venue_id, metadata, ingested_at")
        .gte("event_date", todayText)
        .order("event_date", { ascending: true })
        .limit(200),
      supabase
        .schema("vegas")
        .from("venues")
        .select("id, venue_name, metadata")
        .limit(400),
      supabase
        .schema("vegas")
        .from("restaurants")
        .select("id, restaurant_name, account_status, metadata, ingested_at")
        .limit(1000),
      supabase
        .schema("vegas")
        .from("casinos")
        .select("id, casino_name, metadata, ingested_at")
        .limit(500),
      supabase
        .schema("vegas")
        .from("fryers")
        .select("restaurant_id, fryer_count, metadata, ingested_at")
        .limit(5000),
      supabase
        .schema("vegas")
        .from("customer_scores")
        .select("restaurant_id, score_date, score")
        .order("score_date", { ascending: false })
        .limit(5000),
      supabase
        .schema("vegas")
        .from("event_impact")
        .select("event_id, restaurant_id, impact_score, metadata")
        .order("impact_score", { ascending: false })
        .limit(10000),
    ]);

    const firstError =
      eventError ??
      venueError ??
      restaurantError ??
      casinoError ??
      fryerError ??
      scoreError ??
      impactError;

    if (firstError) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: firstError.message },
        { status: 500 },
      );
    }

    const eventRows = (eventRowsRaw ?? []) as EventRow[];
    const venueRows = (venueRowsRaw ?? []) as VenueRow[];
    const restaurantRows = (restaurantRowsRaw ?? []) as RestaurantRow[];
    const casinoRows = (casinoRowsRaw ?? []) as CasinoRow[];
    const fryerRows = (fryerRowsRaw ?? []) as FryerRow[];
    const scoreRows = (scoreRowsRaw ?? []) as CustomerScoreRow[];
    const impactRows = (impactRowsRaw ?? []) as EventImpactRow[];

    const glideRestaurantRows = restaurantRows.filter((row) => {
      const meta = asObject(row.metadata);
      return pickString(meta, ["source"]) === "glide";
    });
    const activeRestaurantRows = glideRestaurantRows;
    const activeRestaurantIds = new Set(activeRestaurantRows.map((row) => row.id));
    const activeFryerRows = fryerRows.filter(
      (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
    );
    const activeScoreRows = scoreRows.filter(
      (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
    );
    const activeImpactRows = impactRows.filter(
      (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
    );

    const venueMap = new Map<number, string>();
    for (const row of venueRows) {
      venueMap.set(row.id, row.venue_name);
    }

    const casinoNameMap = new Map<string, string>();
    for (const row of casinoRows) {
      const meta = asObject(row.metadata);
      casinoNameMap.set(String(row.id), row.casino_name);
      const glideRowId = pickString(meta, ["glide_row_id", "row_id", "rowId", "glideRowId"]);
      if (glideRowId) casinoNameMap.set(glideRowId, row.casino_name);
    }

    const events: VegasEventRow[] = eventRows
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
        const endDate =
          pickString(meta, ["end_date", "endDate", "event_end_date"]) ?? null;

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
        const customerStatus = pickString(meta, ["source"]) === "glide"
          ? "customer"
          : serviceCadence ? "customer" : "prospect";
        const casinoLink =
          pickString(meta, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
          pickString(glideData, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
          pickString(meta, ["casino_glide_row_id"]) ??
          null;
        const casino = casinoLink ? casinoNameMap.get(casinoLink) ?? casinoLink : null;
        const restaurantId = row.id;
        const impactCount = impactCountByRestaurant.get(restaurantId) ?? 0;
        const eventPressure =
          impactCount > 0
            ? (impactSumByRestaurant.get(restaurantId) ?? 0) / impactCount
            : null;
        const topImpact = topImpactByRestaurant.get(restaurantId);
        const topEvent = topImpact ? eventById.get(topImpact.eventId) ?? null : null;
        const linkedEvent = topEvent ?? defaultLinkedEvent;
        const cuisineType = normalizeCuisineType(
          pickString(meta, ["cuisine_type", "cuisineType", "cuisine"]) ??
            pickString(glideData, ["cuisine_type", "cuisineType", "cuisine"]),
        );
        const affinity = resolveCuisineAffinity(linkedEvent?.category ?? "community", cuisineType);
        const isServiceCuisine = cuisineType === "service";
        const phqMultiplier = linkedEvent ? toPhqMultiplier(linkedEvent.attendance) : null;
        const hospitalityImpact = topImpact?.impactScore ?? eventPressure;
        const expectedSpend =
          topImpact?.expectedSpend ??
          pickNumber(meta, ["expected_spend", "expectedSpend", "hospitality_spend"]) ??
          pickNumber(glideData, ["expected_spend", "expectedSpend", "hospitality_spend"]);
        const zfusionScore =
          isServiceCuisine || hospitalityImpact === null || phqMultiplier === null
            ? null
            : Math.min(100, (affinity.score / 100) * hospitalityImpact * phqMultiplier);

        const totalCapacity = capacityByRestaurant.get(restaurantId) ?? null;
        const fryerCount = fryerCountByRestaurant.get(restaurantId) ?? null;

        return {
          id: restaurantId,
          glideRowId:
            pickString(meta, ["glide_row_id", "row_id", "rowId", "glideRowId"]) ??
            pickString(glideData, ["glide_row_id", "$rowID", "row_id", "rowId", "glideRowId"]),
          name: row.restaurant_name,
          casino,
          contactPerson:
            pickString(meta, ["contact_person", "primary_contact", "doeXs"]) ??
            pickString(glideData, ["doeXs", "primary_contact", "Ie35Z", "a3ffP", "maCR5"]),
          serviceFrequency: serviceFrequencyLabel,
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
          customerStatus,
          opportunityScore: latestScoreByRestaurant.get(restaurantId) ?? null,
          eventPressure,
          eventId: linkedEvent?.id ?? null,
          eventName: linkedEvent?.name ?? null,
          eventCategory: linkedEvent?.category ?? null,
          eventDate: linkedEvent?.startDate ?? null,
          expectedSpend,
          hospitalityImpact,
          phqMultiplier,
          affinityScore: isServiceCuisine ? null : affinity.score,
          zfusionScore,
          pitchReasoning: isServiceCuisine
            ? "Service account excluded from dining opportunity scoring."
            : affinity.reason,
          shiftCount: pickNumber(meta, [
            "shift_count",
            "shiftCount",
            "assigned_shift_count",
            "assignedShiftCount",
          ]) ?? pickNumber(glideData, ["shift_count", "shiftCount", "assigned_shift_count"]),
          scheduledReportCount: pickNumber(meta, [
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
          exportListed: pickBoolean(meta, [
            "export_list",
            "in_export_list",
            "exportListed",
            "is_export_listed",
          ]) ?? pickBoolean(glideData, ["export_list", "in_export_list", "exportListed", "Ny3eQ"]),
          metadata: meta,
        } satisfies VegasOpportunityRow;
      })
      .sort((a, b) => {
        const priorityA =
          (a.customerStatus === "prospect" ? 1000 : 0) +
          (a.opportunityScore ?? 0) * 10 +
          (a.eventPressure ?? 0) +
          (a.zfusionScore ?? 0);
        const priorityB =
          (b.customerStatus === "prospect" ? 1000 : 0) +
          (b.opportunityScore ?? 0) * 10 +
          (b.eventPressure ?? 0) +
          (b.zfusionScore ?? 0);
        if (priorityA !== priorityB) return priorityB - priorityA;

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

        const pressureA = a.eventPressure ?? Number.NEGATIVE_INFINITY;
        const pressureB = b.eventPressure ?? Number.NEGATIVE_INFINITY;
        if (pressureA !== pressureB) return pressureB - pressureA;

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
    const avgScore =
      scoredValues.length > 0
        ? scoredValues.reduce((sum, value) => sum + value, 0) / scoredValues.length
        : null;

    const pressureValues = opportunities
      .map((row) => row.eventPressure)
      .filter((value): value is number => value !== null);
    const avgImpact =
      pressureValues.length > 0
        ? pressureValues.reduce((sum, value) => sum + value, 0) / pressureValues.length
        : null;

    const allIngestedTimestamps = [
      ...eventRows.map((row) => row.ingested_at),
      ...activeRestaurantRows.map((row) => row.ingested_at),
      ...casinoRows.map((row) => row.ingested_at),
      ...activeFryerRows.map((row) => row.ingested_at),
    ]
      .map((value) => toNullableIso(value))
      .filter((value): value is string => value !== null)
      .sort();
    const lastSync = allIngestedTimestamps.at(-1) ?? null;

    const stats: VegasIntelStats = {
      restaurants: activeRestaurantRows.length,
      casinos: casinoRows.length,
      fryers: activeFryerRows.length,
      exportList: glideOptionalCounts.exportList,
      shifts: glideOptionalCounts.shifts,
      scheduledReports: glideOptionalCounts.scheduledReports,
      lastSync,
    };

    const glideTables = {
      restaurants: activeRestaurantRows.length,
      casinos: casinoRows.length,
      fryers: activeFryerRows.length,
      exportList: glideOptionalCounts.exportList,
      scheduledReports: glideOptionalCounts.scheduledReports,
      shifts: glideOptionalCounts.shifts,
      shiftCasinos: glideOptionalCounts.shiftCasinos,
      shiftRestaurants: glideOptionalCounts.shiftRestaurants,
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
    const cl = trustedMarket.cl.value;
    const cl5d = trustedMarket.cl.change5d;
    const vix = trustedMarket.vix.value;
    const cl5dText =
      cl5d === null ? "n/a" : `${cl5d * 100 >= 0 ? "+" : ""}${(cl5d * 100).toFixed(2)}%`;

    const fallbackCards: VegasCards = {
      upcomingEvents: {
        title: "Upcoming Events",
        body: nextEvent
          ? `${events14d} events are scheduled over the next 14 days (${events30d} over 30 days). Next demand catalyst is ${nextEvent.name} on ${nextEvent.startDate}.`
          : "Hard stop: no verified vegas.events rows are available for upcoming demand-window analysis.",
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.upcomingEvents,
        provenance: buildProvenance(generatedAt, asOf, "upcomingEvents", trustedUrls),
      },
      aiSalesStrategy: {
        title: "AI Sales Strategy",
        body:
          opportunities.length === 0 || events.length === 0
            ? "Hard stop: account-targeted strategy is blocked because verified event or account rows are missing."
            : `Prioritize high-volume customer accounts before the next event cluster. Average modeled event pressure is ${avgImpact?.toFixed(2) ?? "n/a"}. Current oil-cost backdrop is CL ${cl?.toFixed(2) ?? "n/a"} with 5-day ${cl5dText} and VIX ${vix?.toFixed(2) ?? "n/a"}, so cost-certainty messaging should be sequenced by urgency.`,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.aiSalesStrategy,
        provenance: buildProvenance(generatedAt, asOf, "aiSalesStrategy", trustedUrls),
      },
      restaurantAccounts: {
        title: "Restaurant Accounts",
        body:
          scoredValues.length === 0
            ? "Hard stop: no verified vegas.customer_scores rows are available for account-priority ranking."
            : `Current account set has ${opportunities.length} rows with average opportunity score ${avgScore?.toFixed(2) ?? "n/a"}. Sequence outreach from highest opportunity tier first, then roll down by event-window overlap.`,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.restaurantAccounts,
        provenance: buildProvenance(generatedAt, asOf, "restaurantAccounts", trustedUrls),
      },
      fryerTracking: {
        title: "Fryer Equipment Tracking",
        body:
          activeFryerRows.length === 0
            ? "Hard stop: fryer lifecycle guidance is blocked because no verified vegas.fryers rows are available."
            : `Verified fryer rows: ${activeFryerRows.length}. Sites with capacity telemetry: ${Array.from(capacityByRestaurant.values()).length}. Missing capacity data must be surfaced explicitly before equipment-specific pitch claims.`,
        strategicSpecialInstructions: VEGAS_INSTRUCTIONS.fryerTracking,
        provenance: buildProvenance(generatedAt, asOf, "fryerTracking", trustedUrls),
      },
    };

    const rawCards = aiSnapshot?.cards ?? fallbackCards;
    const cards: VegasCards = {
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
        ...TRUSTED_MARKET_SOURCE_FEEDS,
      ].join(","),
    };

    return NextResponse.json({
      ...envelope,
      cards,
      stats,
      glideTables,
      events,
      opportunities,
      ai: toAiEnvelopeMeta(aiSnapshot),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
