import type { VegasEventRow, VegasOpportunityRow } from "@/lib/contracts/api";
import {
  RawCasinoRow,
  RawCustomerScoreRow,
  RawEventImpactRow,
  RawEventRow,
  RawFryerRow,
  RawRestaurantRow,
  RawVenueRow,
} from "./fetchVegasIntel";
import {
  asObject,
  normalizeCuisineType,
  normalizeEventCategory,
  pickBoolean,
  pickGlideData,
  pickNumber,
  pickString,
  resolveCuisineAffinity,
  toDaysUntil,
  toDurationDays,
  toEventColor,
  toPhqMultiplier,
} from "./normalizeVegasIntel";

export function assembleVegasIntel(data: {
  events: RawEventRow[];
  venues: RawVenueRow[];
  restaurants: RawRestaurantRow[];
  casinos: RawCasinoRow[];
  fryers: RawFryerRow[];
  scores: RawCustomerScoreRow[];
  impacts: RawEventImpactRow[];
}): { events: VegasEventRow[]; opportunities: VegasOpportunityRow[] } {
  const now = new Date();

  const glideRestaurantRows = data.restaurants.filter((row) => {
    const meta = asObject(row.metadata);
    return pickString(meta, ["source"]) === "glide";
  });
  const activeRestaurantRows = glideRestaurantRows;
  const activeRestaurantIds = new Set(activeRestaurantRows.map((row) => row.id));

  const activeFryerRows = data.fryers.filter(
    (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
  );
  const activeScoreRows = data.scores.filter(
    (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
  );
  const activeImpactRows = data.impacts.filter(
    (row) => row.restaurant_id !== null && activeRestaurantIds.has(row.restaurant_id),
  );

  const venueMap = new Map<number, string>();
  for (const row of data.venues) {
    venueMap.set(row.id, row.venue_name);
  }

  const casinoNameMap = new Map<string, string>();
  for (const row of data.casinos) {
    const meta = asObject(row.metadata);
    casinoNameMap.set(String(row.id), row.casino_name);
    const glideRowId = pickString(meta, ["glide_row_id", "row_id", "rowId", "glideRowId"]);
    if (glideRowId) casinoNameMap.set(glideRowId, row.casino_name);
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
      };
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
      const customerStatus =
        pickString(meta, ["source"]) === "glide"
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
      if (completenessScoreA !== completenessScoreB)
        return completenessScoreB - completenessScoreA;

      const pressureA = a.eventPressure ?? Number.NEGATIVE_INFINITY;
      const pressureB = b.eventPressure ?? Number.NEGATIVE_INFINITY;
      if (pressureA !== pressureB) return pressureB - pressureA;

      const scoreA = a.opportunityScore ?? Number.NEGATIVE_INFINITY;
      const scoreB = b.opportunityScore ?? Number.NEGATIVE_INFINITY;
      return scoreB - scoreA;
    });

  return { events, opportunities };
}
