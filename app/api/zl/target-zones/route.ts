import { NextResponse } from "next/server";

import { createServerDataClient } from "@/lib/server/server-data-client";
import type { ApiEnvelope, TargetZone } from "@/lib/contracts/api";

const AG_HORIZON_DAYS = [30, 90, 180] as const;
const LEGACY_HORIZON_MAP: Record<number, (typeof AG_HORIZON_DAYS)[number]> = {
  7: 30,
  14: 90,
  30: 180,
};

function normalizeHorizon(row: {
  horizon_days: number;
  model_version: string | null;
}): number | null {
  if (AG_HORIZON_DAYS.includes(row.horizon_days as (typeof AG_HORIZON_DAYS)[number])) {
    return row.horizon_days;
  }
  if (row.model_version?.startsWith("trusted-fill-v1")) {
    return LEGACY_HORIZON_MAP[row.horizon_days] ?? null;
  }
  return null;
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();

    // Get the latest target zones (most recent forecast_date, all horizons)
    const { data: rows, error } = await supabase
      .schema("forecasts")
      .from("target_zones")
      .select("horizon_days, p30, p50, p70, model_version, generated_at, forecast_date")
      .order("forecast_date", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      const envelope: ApiEnvelope<TargetZone[]> = {
        ok: true,
        data: [],
        asOf: new Date().toISOString(),
        source: "forecasts.target_zones",
      };
      return NextResponse.json(envelope);
    }

    // Get the latest forecast_date and filter to only that date's zones
    const latestDate = rows[0].forecast_date;
    const latestZones = rows.filter((r) => r.forecast_date === latestDate);

    const deduped = new Map<number, TargetZone>();
    for (const row of latestZones) {
      const horizonDays = normalizeHorizon(row);
      if (!horizonDays) continue;
      if (deduped.has(horizonDays)) continue;
      deduped.set(horizonDays, {
        horizonDays,
        p30: Number(row.p30),
        p50: Number(row.p50),
        p70: Number(row.p70),
        generatedAt: row.generated_at,
      });
    }
    const zones = [...deduped.values()].sort((a, b) => a.horizonDays - b.horizonDays);

    const envelope: ApiEnvelope<TargetZone[]> = {
      ok: true,
      data: zones,
      asOf: new Date().toISOString(),
      source: "forecasts.target_zones",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
