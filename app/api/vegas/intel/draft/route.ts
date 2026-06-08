import { NextResponse } from "next/server";

import { requireAuthenticatedApiRequest } from "@/lib/server/auth-guards";
import {
  fallbackVegasIntelReport,
  generateVegasIntelReport,
  type VegasIntelReportInput,
} from "@/lib/server/openrouter";
import { createServerDataClient } from "@/lib/server/server-data-client";
import { estimateOilLbsPerWeek, serviceChangesPerWeek } from "@/lib/vegas/normalizeVegasIntel";

type RestaurantRow = {
  id: number;
  restaurant_name: string;
  account_status: string | null;
  metadata: unknown;
};

type FryerRow = {
  fryer_count: number | null;
  metadata: unknown;
};

type EventRow = {
  id: number;
  event_name: string;
  event_date: string;
  metadata: unknown;
};

type CasinoRow = {
  id: number;
  casino_name: string;
  metadata: unknown;
};

type CuisineAffinity = {
  score: number;
  reason: string;
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

function normalizeEventCategory(value: string | null): string {
  if (!value) return "community";
  const normalized = value.trim().toLowerCase();
  if (normalized === "performing_arts") return "performing-arts";
  if (normalized === "school_holidays") return "school-holidays";
  if (normalized === "conference") return "conferences";
  if (normalized === "expo") return "expos";
  if (normalized === "concert") return "concerts";
  if (normalized === "sport") return "sports";
  return normalized;
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

function toMidnight(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toDaysUntil(current: Date, futureDateText: string): number {
  const now = toMidnight(current).getTime();
  const target = toMidnight(new Date(futureDateText)).getTime();
  return Math.max(0, Math.floor((target - now) / 86400000));
}

function pitchAngleForCategory(category: string): string {
  if (category === "expos" || category === "conferences") {
    return "Business-heavy demand window; lead with continuity and group-volume readiness.";
  }
  if (category === "concerts" || category === "festivals") {
    return "Pre/post-event throughput pressure; protect late-night volume before it gets chaotic.";
  }
  if (category === "sports") {
    return "Game-day surge profile; sell fryer uptime and high-turn menu protection.";
  }
  if (category === "performing-arts") {
    return "Pre-show reservation flow; timing discipline beats panic fixes.";
  }
  return "General event-timing play: procurement certainty plus service continuity.";
}

export async function GET(request: Request) {
  try {
    const authError = await requireAuthenticatedApiRequest();
    if (authError) return authError;

    const url = new URL(request.url);
    const restaurantIdParam = url.searchParams.get("restaurantId");
    const eventIdParam = url.searchParams.get("eventId");
    const restaurantId = restaurantIdParam ? Number(restaurantIdParam) : Number.NaN;
    const requestedEventId = eventIdParam ? Number(eventIdParam) : null;

    if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
      return NextResponse.json(
        { ok: false, error: "restaurantId is required and must be a positive integer." },
        { status: 400 },
      );
    }
    if (eventIdParam && (!Number.isInteger(requestedEventId) || (requestedEventId ?? 0) <= 0)) {
      return NextResponse.json(
        { ok: false, error: "eventId must be a positive integer when provided." },
        { status: 400 },
      );
    }

    const supabase = await createServerDataClient();

    const { data: restaurantRaw, error: restaurantError } = await supabase
      .schema("vegas")
      .from("restaurants")
      .select("id, restaurant_name, account_status, metadata")
      .eq("id", restaurantId)
      .maybeSingle();

    if (restaurantError) {
      return NextResponse.json({ ok: false, error: restaurantError.message }, { status: 500 });
    }
    if (!restaurantRaw) {
      return NextResponse.json({ ok: false, error: "Restaurant not found." }, { status: 404 });
    }

    const restaurant = restaurantRaw as RestaurantRow;
    const meta = asObject(restaurant.metadata);
    if (pickString(meta, ["source"]) !== "glide") {
      return NextResponse.json(
        { ok: false, error: "Restaurant is not a verified Glide-synced account." },
        { status: 404 },
      );
    }
    const glideData = asObject(meta.glide_data);

    const [
      { data: fryerRowsRaw, error: fryerError },
      { data: casinoRowsRaw, error: casinoError },
    ] = await Promise.all([
      supabase
        .schema("vegas")
        .from("fryers")
        .select("fryer_count, metadata")
        .eq("restaurant_id", restaurantId)
        .limit(200),
      supabase
        .schema("vegas")
        .from("casinos")
        .select("id, casino_name, metadata")
        .limit(200),
    ]);

    const firstError = fryerError ?? casinoError;
    if (firstError) {
      return NextResponse.json({ ok: false, error: firstError.message }, { status: 500 });
    }

    const fryerRows = (fryerRowsRaw ?? []) as FryerRow[];
    const casinoRows = (casinoRowsRaw ?? []) as CasinoRow[];

    const selectedEventId: number | null = requestedEventId;
    let selectedEvent: EventRow | null = null;
    if (selectedEventId !== null) {
      const { data: eventRaw, error: eventError } = await supabase
        .schema("vegas")
        .from("events")
        .select("id, event_name, event_date, metadata")
        .eq("id", selectedEventId)
        .maybeSingle();
      if (eventError) {
        return NextResponse.json({ ok: false, error: eventError.message }, { status: 500 });
      }
      selectedEvent = (eventRaw as EventRow | null) ?? null;
    }

    if (requestedEventId !== null && !selectedEvent) {
      return NextResponse.json(
        { ok: false, error: "Requested event was not found." },
        { status: 404 },
      );
    }

    if (!selectedEvent) {
      const todayText = new Date().toISOString().slice(0, 10);
      const { data: fallbackEventRaw, error: fallbackEventError } = await supabase
        .schema("vegas")
        .from("events")
        .select("id, event_name, event_date, metadata")
        .gte("event_date", todayText)
        .order("event_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (fallbackEventError) {
        return NextResponse.json({ ok: false, error: fallbackEventError.message }, { status: 500 });
      }
      selectedEvent = (fallbackEventRaw as EventRow | null) ?? null;
    }

    const casinoNameMap = new Map<string, string>();
    const casinoAddressMap = new Map<string, string>();
    for (const row of casinoRows) {
      const casinoMeta = asObject(row.metadata);
      const casinoGlideData = asObject(casinoMeta.glide_data);
      const address =
        pickString(casinoMeta, ["address", "L9K9x"]) ??
        pickString(casinoGlideData, ["address", "L9K9x"]);
      casinoNameMap.set(String(row.id), row.casino_name);
      if (address) casinoAddressMap.set(String(row.id), address);
      const glideRowId = pickString(casinoMeta, ["glide_row_id", "row_id", "rowId", "glideRowId"]);
      if (glideRowId) {
        casinoNameMap.set(glideRowId, row.casino_name);
        if (address) casinoAddressMap.set(glideRowId, address);
      }
    }

    const casinoLink =
      pickString(meta, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
      pickString(glideData, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
      pickString(meta, ["casino_glide_row_id"]);
    const casinoName = casinoLink ? casinoNameMap.get(casinoLink) ?? casinoLink : null;
    const location = casinoLink ? casinoAddressMap.get(casinoLink) ?? null : null;

    const serviceCadence =
      pickString(meta, ["service_frequency", "serviceFrequency", "Po4Zg"]) ??
      pickString(glideData, ["service_frequency", "serviceFrequency", "Po4Zg"]);
    const serviceDays =
      pickString(meta, ["service_days", "serviceDays", "lf0gF"]) ??
      pickString(glideData, ["service_days", "serviceDays", "lf0gF"]);
    const serviceFrequency =
      serviceCadence && serviceDays ? `${serviceCadence} (${serviceDays})` : serviceCadence;

    const oilType =
      pickString(meta, ["oil_type", "oilType", "U0Jf2"]) ??
      pickString(glideData, ["oil_type", "oilType", "U0Jf2", "UYUGq"]);
    const oilForm =
      pickString(meta, ["oil_form", "oilForm", "0RcWz"]) ??
      pickString(glideData, ["oil_form", "oilForm", "0RcWz"]);
    const cuisineType = normalizeCuisineType(
      pickString(meta, ["cuisine_type", "cuisineType", "cuisine"]) ??
        pickString(glideData, ["cuisine_type", "cuisineType", "cuisine"]),
    );
    const contact =
      pickString(meta, ["contact_person", "primary_contact", "doeXs"]) ??
      pickString(glideData, ["doeXs", "primary_contact", "Ie35Z", "a3ffP", "maCR5"]);
    const contactEmail =
      pickString(meta, ["contact_email", "contactEmail", "a3ffP", "maCR5"]) ??
      pickString(glideData, ["a3ffP", "maCR5", "contact_email", "contactEmail"]);

    const fryerCount = fryerRows.reduce((sum, row) => sum + (row.fryer_count ?? 0), 0);
    const totalCapacityLbs = fryerRows.reduce((sum, row) => {
      const fryerMeta = asObject(row.metadata);
      const capacity = pickNumber(fryerMeta, ["total_capacity_lbs", "capacity_lbs", "xhrM0"]) ?? 0;
      return sum + capacity;
    }, 0);
    const normalizedCapacity = totalCapacityLbs > 0 ? totalCapacityLbs : null;
    const changesPerWeek = serviceChangesPerWeek(serviceCadence, serviceDays);
    const estimatedOilLbsPerWeek = estimateOilLbsPerWeek(normalizedCapacity, changesPerWeek);

    const selectedEventMeta = selectedEvent ? asObject(selectedEvent.metadata) : {};
    const eventCategory = normalizeEventCategory(
      pickString(selectedEventMeta, ["event_type", "category", "eventCategory", "type"]),
    );
    const cuisineAffinity = resolveCuisineAffinity(eventCategory, cuisineType);
    const attendance =
      pickNumber(selectedEventMeta, ["attendance", "rank", "predicted_attendance"]) ?? null;
    const daysUntil = selectedEvent ? toDaysUntil(new Date(), selectedEvent.event_date) : null;

    const basePitchAngle = pitchAngleForCategory(eventCategory);
    const pitchAngle = `${basePitchAngle} Cuisine fit: ${cuisineType ?? "missing"} (${cuisineAffinity.score}/100). ${cuisineAffinity.reason}`;
    const missingEvidence: string[] = [];
    if (!oilType) missingEvidence.push("Oil type missing");
    if (!serviceCadence) missingEvidence.push("Service cadence missing");
    if (!contact) missingEvidence.push("Contact missing");
    if (!cuisineType) missingEvidence.push("Cuisine type missing");
    if (fryerCount <= 0 || totalCapacityLbs <= 0) missingEvidence.push("Capacity telemetry missing");
    if (estimatedOilLbsPerWeek === null) missingEvidence.push("Estimated weekly oil usage missing");

    const customerStatus = serviceCadence ? "customer" : "prospect";
    const eventName = selectedEvent?.event_name ?? "No linked event window";
    const eventDate = selectedEvent?.event_date ?? null;

    const evidenceBullets = [
      `Account: ${restaurant.restaurant_name}${casinoName ? ` at ${casinoName}` : ""}`,
      `Event window: ${eventName}${eventDate ? ` (${eventDate})` : ""}${daysUntil !== null ? `, ${daysUntil} days out` : ""}`,
      `Event category: ${eventCategory}`,
      `Cuisine fit: ${cuisineType ?? "missing"} (${cuisineAffinity.score}/100)`,
      `Cuisine rationale: ${cuisineAffinity.reason}`,
      `Location: ${location ?? "missing"}`,
      `Contact: ${contact ?? "missing"}${contactEmail ? ` <${contactEmail}>` : ""}`,
      `Service cadence: ${serviceFrequency ?? "missing"}`,
      `Oil type: ${oilType ?? "missing"}`,
      `Fryer telemetry: ${fryerCount > 0 ? `${fryerCount} fryers` : "missing"}`,
      `Capacity telemetry: ${totalCapacityLbs > 0 ? `${Math.round(totalCapacityLbs)} lbs` : "missing"}`,
      `Estimated oil usage: ${
        estimatedOilLbsPerWeek !== null ? `${estimatedOilLbsPerWeek.toLocaleString()} lbs/week` : "missing"
      }`,
    ];

    const reportInput: VegasIntelReportInput = {
      restaurantName: restaurant.restaurant_name,
      casinoName,
      customerStatus,
      eventName,
      eventCategory,
      eventDate,
      daysUntil,
      attendance,
      oilType,
      oilForm,
      location,
      contactName: contact,
      contactEmail,
      cuisineType,
      cuisineAffinityScore: cuisineAffinity.score,
      cuisineAffinityReason: cuisineAffinity.reason,
      serviceFrequency,
      changesPerWeek,
      fryerCount: fryerCount > 0 ? fryerCount : null,
      totalCapacityLbs: normalizedCapacity,
      estimatedOilLbsPerWeek,
      pitchAngle,
      evidenceBullets,
      missingEvidence,
    };
    const fallbackReport = fallbackVegasIntelReport(reportInput);
    const aiReport = await generateVegasIntelReport(reportInput);
    const finalReport = aiReport.ok ? aiReport.report : fallbackReport;

    return NextResponse.json({
      ok: true,
      asOf: new Date().toISOString(),
      draft: {
        status: "draft",
        restaurantId: restaurant.id,
        restaurantName: restaurant.restaurant_name,
        casinoName,
        eventId: selectedEvent?.id ?? null,
        eventName,
        eventCategory,
        eventDate,
        daysUntil,
        attendance,
        oilType,
        oilForm,
        location,
        contactName: contact,
        contactEmail,
        cuisineType,
        cuisineAffinityScore: cuisineAffinity.score,
        cuisineAffinityReason: cuisineAffinity.reason,
        serviceFrequency,
        changesPerWeek,
        fryerCount: fryerCount > 0 ? fryerCount : null,
        totalCapacityLbs: normalizedCapacity,
        estimatedOilLbsPerWeek,
        customerStatus,
        pitchAngle,
        aiGenerated: aiReport.ok,
        provider: aiReport.ok ? aiReport.provider : "structured-verification",
        model: aiReport.model,
        executiveBrief: finalReport.executiveBrief,
        salesScript: finalReport.salesScript,
        emailDraft: finalReport.emailDraft,
        callPlan: finalReport.callPlan,
        objectionHandling: finalReport.objectionHandling,
        riskFlags: finalReport.riskFlags,
        evidenceSummary: finalReport.evidenceSummary,
        evidenceBullets,
        nextAction: finalReport.nextAction,
        aiWarning: aiReport.ok
          ? null
          : "Direct OpenRouter API is not configured or did not return a valid report; showing verified structured draft.",
        provenance: {
          sourceFeeds: [
            "vegas.restaurants",
            "vegas.casinos",
            "vegas.fryers",
            "vegas.events",
          ],
          aiProvider: aiReport.ok ? "openrouter" : "none",
          aiModel: aiReport.model,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
