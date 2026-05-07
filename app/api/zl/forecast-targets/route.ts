import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

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
      .select("forecast_date, horizon_days, p30, p50, p70")
      .order("forecast_date", { ascending: false })
      .limit(60);

    if (error) {
      return NextResponse.json(
        { error: error.message, asOfDate: null, targets: [] as ForecastTarget[] },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        asOfDate: null,
        targets: [] as ForecastTarget[],
      });
    }

    const asOfDate = rows[0].forecast_date;
    const latestRows = rows.filter((r) => r.forecast_date === asOfDate);
    const agRows = latestRows.filter((r) => AG_HORIZON_DAYS.includes(r.horizon_days as (typeof AG_HORIZON_DAYS)[number]));

    const targets: ForecastTarget[] = agRows
      .sort((a, b) => a.horizon_days - b.horizon_days)
      .map((r) => ({
        id: `${r.forecast_date}-${r.horizon_days}`,
        horizonDays: r.horizon_days,
        horizonLabel: horizonLabel(r.horizon_days),
        priceLow: Number(r.p30),
        priceHigh: Number(r.p70),
        oofPrice: Number(r.p50),
        coveragePct: null,
      }));

    return NextResponse.json({
      asOfDate,
      targets,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), asOfDate: null, targets: [] as ForecastTarget[] },
      { status: 500 },
    );
  }
}
