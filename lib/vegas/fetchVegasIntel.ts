import { createServerDataClient } from "@/lib/server/server-data-client";

export type RawRestaurantRow = {
  id: number;
  restaurant_name: string;
  account_status: string | null;
  metadata: unknown;
  ingested_at: string;
};

export type RawCasinoRow = {
  id: number;
  casino_name: string;
  metadata: unknown;
  ingested_at: string;
};

export type RawEventRow = {
  id: number;
  event_name: string;
  event_date: string;
  venue_id: number | null;
  metadata: unknown;
  ingested_at: string;
};

export type RawVenueRow = {
  id: number;
  venue_name: string;
  metadata: unknown;
};

export type RawFryerRow = {
  restaurant_id: number | null;
  fryer_count: number | null;
  metadata: unknown;
  ingested_at: string;
};

export type GlideCoverageCounts = {
  exportList: number | null;
  shifts: number | null;
  scheduledReports: number | null;
  shiftCasinos: number | null;
  shiftRestaurants: number | null;
};

type CoverageCountQuery = {
  schema: "vegas" | "ops";
  table: string;
};

const GLIDE_COVERAGE_COUNT_QUERIES: Record<keyof GlideCoverageCounts, CoverageCountQuery[]> = {
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

async function readCoverageCount(
  supabase: Awaited<ReturnType<typeof createServerDataClient>>,
  candidates: CoverageCountQuery[],
): Promise<number | null> {
  for (const candidate of candidates) {
    const { count, error } = await supabase
      .schema(candidate.schema)
      .from(candidate.table)
      .select("*", { count: "exact", head: true });
    if (!error) return count ?? 0;
    // Any failure (missing relation or transient) falls through to the next
    // candidate table; coverage is reported null only when none are readable.
  }
  return null;
}

export async function fetchGlideCoverageCounts(
  supabase: Awaited<ReturnType<typeof createServerDataClient>>,
): Promise<GlideCoverageCounts> {
  const [exportList, shifts, scheduledReports, shiftCasinos, shiftRestaurants] = await Promise.all([
    readCoverageCount(supabase, GLIDE_COVERAGE_COUNT_QUERIES.exportList),
    readCoverageCount(supabase, GLIDE_COVERAGE_COUNT_QUERIES.shifts),
    readCoverageCount(supabase, GLIDE_COVERAGE_COUNT_QUERIES.scheduledReports),
    readCoverageCount(supabase, GLIDE_COVERAGE_COUNT_QUERIES.shiftCasinos),
    readCoverageCount(supabase, GLIDE_COVERAGE_COUNT_QUERIES.shiftRestaurants),
  ]);
  return { exportList, shifts, scheduledReports, shiftCasinos, shiftRestaurants };
}

export async function fetchVegasData(supabase: Awaited<ReturnType<typeof createServerDataClient>>) {
  const todayText = new Date().toISOString().slice(0, 10);

  const [
    glideCoverageCounts,
    { data: eventRowsRaw, error: eventError },
    { data: venueRowsRaw, error: venueError },
    { data: restaurantRowsRaw, error: restaurantError },
    { data: casinoRowsRaw, error: casinoError },
    { data: fryerRowsRaw, error: fryerError },
  ] = await Promise.all([
    fetchGlideCoverageCounts(supabase),
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
  ]);

  const firstError =
    eventError ??
    venueError ??
    restaurantError ??
    casinoError ??
    fryerError;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    glideCoverageCounts,
    events: (eventRowsRaw ?? []) as RawEventRow[],
    venues: (venueRowsRaw ?? []) as RawVenueRow[],
    restaurants: (restaurantRowsRaw ?? []) as RawRestaurantRow[],
    casinos: (casinoRowsRaw ?? []) as RawCasinoRow[],
    fryers: (fryerRowsRaw ?? []) as RawFryerRow[],
  };
}
