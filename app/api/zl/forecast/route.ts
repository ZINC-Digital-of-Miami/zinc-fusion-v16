import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { ApiEnvelope, ForecastSummary } from "@/lib/contracts/api";

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
    const supabase = createSupabaseAdminClient();

    // Get the latest forecast summaries (most recent forecast_date)
    const { data: rows, error } = await supabase
      .schema("forecasts")
      .from("forecast_summary_1d")
      .select("horizon_days, predicted_price, hit_probability, model_version, forecast_date")
      .order("forecast_date", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      const envelope: ApiEnvelope<ForecastSummary[]> = {
        ok: true,
        data: [],
        asOf: new Date().toISOString(),
        source: "forecasts.forecast_summary_1d",
      };
      return NextResponse.json(envelope);
    }

    // Filter to the latest forecast_date only
    const latestDate = rows[0].forecast_date;
    const latestRows = rows.filter((r) => r.forecast_date === latestDate);

    const deduped = new Map<number, ForecastSummary>();
    for (const row of latestRows) {
      const horizonDays = normalizeHorizon(row);
      if (!horizonDays) continue;
      if (deduped.has(horizonDays)) continue;
      deduped.set(horizonDays, {
        horizonDays,
        predictedPrice: Number(row.predicted_price),
        hitProbability: Number(row.hit_probability ?? 0),
        modelVersion: row.model_version,
      });
    }
    const forecasts = [...deduped.values()].sort((a, b) => a.horizonDays - b.horizonDays);

    const envelope: ApiEnvelope<ForecastSummary[]> = {
      ok: true,
      data: forecasts,
      asOf: new Date().toISOString(),
      source: "forecasts.forecast_summary_1d",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
