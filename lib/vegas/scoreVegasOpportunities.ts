import type { VegasEventRow, VegasOpportunityRow } from "@/lib/contracts/api";
import {
  RawCasinoRow,
  RawEventRow,
  RawFryerRow,
  RawRestaurantRow,
  RawVenueRow,
} from "./fetchVegasIntel";
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
} from "./normalizeVegasIntel";

export function assembleVegasIntel(data: {
  events: RawEventRow[];
  venues: RawVenueRow[];
  restaurants: RawRestaurantRow[];
  casinos: RawCasinoRow[];
  fryers: RawFryerRow[];
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

  const venueMap = new Map<number, string>();
  for (const row of data.venues) {
    venueMap.set(row.id, row.venue_name);
  }

  const casinoNameMap = new Map<string, string>();
  const casinoAddressMap = new Map<string, string>();
  for (const row of data.casinos) {
    const meta = asObject(row.metadata);
    const glideData = pickGlideData(meta);
    const address = pickString(meta, ["address", "L9K9x"]) ?? pickString(glideData, ["L9K9x", "address"]);
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
      };
    })
    .filter((row): row is VegasEventRow => row !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Nearest upcoming event drives the demand-window context for every account.
  const nearestUpcomingEvent = events.find((event) => event.daysUntil >= 0) ?? events[0] ?? null;

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
      const customerStatus = serviceCadence ? "customer" : "prospect";
      const casinoLink =
        pickString(meta, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
        pickString(glideData, ["casino", "casino_name", "property", "2Ca0T", "casino_id"]) ??
        pickString(meta, ["casino_glide_row_id"]) ??
        null;
      const casino = casinoLink ? casinoNameMap.get(casinoLink) ?? casinoLink : null;
      const location = casinoLink ? casinoAddressMap.get(casinoLink) ?? null : null;
      const restaurantId = row.id;
      const linkedEvent = nearestUpcomingEvent;
      const cuisineType = normalizeCuisineType(
        pickString(meta, ["cuisine_type", "cuisineType", "cuisine"]) ??
          pickString(glideData, ["cuisine_type", "cuisineType", "cuisine"]),
      );
      const isServiceCuisine = cuisineType === "service";
      const affinity =
        isServiceCuisine || !linkedEvent
          ? null
          : resolveCuisineAffinity(linkedEvent.category, cuisineType);

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
      // Known customers first, then prospects.
      if (a.customerStatus !== b.customerStatus) {
        return a.customerStatus === "customer" ? -1 : 1;
      }

      // Rank by real estimated oil volume; rows with known volume rank above
      // incomplete-telemetry rows (no synthetic score is invented for them).
      const oilA = a.estimatedOilLbsPerWeek ?? Number.NEGATIVE_INFINITY;
      const oilB = b.estimatedOilLbsPerWeek ?? Number.NEGATIVE_INFINITY;
      if (oilA !== oilB) return oilB - oilA;

      // Then by event adjacency (soonest upcoming event window first).
      const eventA = a.eventDaysUntil ?? Number.POSITIVE_INFINITY;
      const eventB = b.eventDaysUntil ?? Number.POSITIVE_INFINITY;
      if (eventA !== eventB) return eventA - eventB;

      // Finally by Glide field completeness so well-documented accounts surface.
      const completenessA =
        Number(a.serviceFrequency !== null) +
        Number(a.oilType !== null) +
        Number(a.contactPerson !== null) +
        Number(a.totalCapacityLbs !== null);
      const completenessB =
        Number(b.serviceFrequency !== null) +
        Number(b.oilType !== null) +
        Number(b.contactPerson !== null) +
        Number(b.totalCapacityLbs !== null);
      return completenessB - completenessA;
    });

  return { events, opportunities };
}
