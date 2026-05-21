import { NextResponse } from "next/server";

import { createServerDataClient } from "@/lib/server/server-data-client";
import type { ApiEnvelope } from "@/lib/contracts/api";

type DashboardMetric = {
  key: string;
  label: string;
  value: number;
};

export async function GET() {
  try {
    const supabase = await createServerDataClient();

    // Get the latest dashboard metrics
    const { data: rows, error } = await supabase
      .schema("analytics")
      .from("dashboard_metrics")
      .select("metric_key, metric_value, trade_date")
      .order("trade_date", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      const envelope: ApiEnvelope<DashboardMetric[]> = {
        ok: true,
        data: [],
        asOf: new Date().toISOString(),
        source: "analytics.dashboard_metrics",
      };
      return NextResponse.json(envelope);
    }

    // Filter to latest trade_date
    const latestDate = rows[0].trade_date;
    const latestRows = rows.filter((r) => r.trade_date === latestDate);

    const metrics: DashboardMetric[] = latestRows.map((row) => ({
      key: row.metric_key,
      label: row.metric_key.replace(/_/g, " "),
      value: Number(row.metric_value),
    }));

    const envelope: ApiEnvelope<DashboardMetric[]> = {
      ok: true,
      data: metrics,
      asOf: new Date().toISOString(),
      source: "analytics.dashboard_metrics",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
