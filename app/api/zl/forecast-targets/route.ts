import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { ApiEnvelope } from "@/lib/contracts/api";

type ForecastTarget = {
  id: string;
  horizonDays: number;
  horizonLabel: string;
  priceLow: number;
  priceHigh: number;
  oofPrice: number;
  coveragePct: number | null;
};

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

function horizonLabel(days: number): string {
  if (days === 30) return "1M";
  if (days === 90) return "3M";
  if (days === 180) return "6M";
  return `${days}d`;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: rows, error } = await supabase
      .schema("forecasts")
      .from("target_zones")
      .select("forecast_date, horizon_days, p30, p50, p70, model_version")
      .order("forecast_date", { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          data: [] as ForecastTarget[],
          asOf: new Date().toISOString(),
          source: "forecasts.target_zones",
          error: error.message,
        },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      const envelope: ApiEnvelope<ForecastTarget[]> = {
        ok: true,
        data: [],
        asOf: new Date().toISOString(),
        source: "forecasts.target_zones",
      };
      return NextResponse.json(envelope);
    }

    const asOfDate = rows[0].forecast_date;
    const latestRows = rows.filter((r) => r.forecast_date === asOfDate);
    const deduped = new Map<number, ForecastTarget>();
    for (const row of latestRows) {
      const horizonDays = normalizeHorizon(row);
      if (!horizonDays) continue;
      if (deduped.has(horizonDays)) continue;
      deduped.set(horizonDays, {
        id: `${row.forecast_date}-${horizonDays}`,
        horizonDays,
        horizonLabel: horizonLabel(horizonDays),
        priceLow: Number(row.p30),
        priceHigh: Number(row.p70),
        oofPrice: Number(row.p50),
        coveragePct: null,
      });
    }

    const targets: ForecastTarget[] = [...deduped.values()]
      .sort((a, b) => a.horizonDays - b.horizonDays)
      .map((r) => ({
        id: r.id,
        horizonDays: r.horizonDays,
        horizonLabel: r.horizonLabel,
        priceLow: r.priceLow,
        priceHigh: r.priceHigh,
        oofPrice: r.oofPrice,
        coveragePct: r.coveragePct,
      }));

    const envelope: ApiEnvelope<ForecastTarget[]> = {
      ok: true,
      data: targets,
      asOf: asOfDate,
      source: "forecasts.target_zones",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        data: [] as ForecastTarget[],
        asOf: new Date().toISOString(),
        source: "forecasts.target_zones",
        error: String(err),
      },
      { status: 500 },
    );
  }
}
