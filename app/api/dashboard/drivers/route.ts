import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ApiEnvelope, DriverAttribution } from "@/lib/contracts/api";

export async function GET() {
  try {
    const supabase = await createClient();

    // Get the latest driver attribution (most recent trade_date, top 4 by rank)
    const { data: rows, error } = await supabase
      .schema("analytics")
      .from("driver_attribution_1d")
      .select("factor, contribution, confidence, trade_date, rank")
      .order("trade_date", { ascending: false })
      .order("rank", { ascending: true })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      const envelope: ApiEnvelope<DriverAttribution[]> = {
        ok: true,
        data: [],
        asOf: new Date().toISOString(),
        source: "analytics.driver_attribution_1d",
      };
      return NextResponse.json(envelope);
    }

    // Filter to latest trade_date only
    const latestDate = rows[0].trade_date;
    const latestRows = rows.filter((r) => r.trade_date === latestDate);

    const drivers: DriverAttribution[] = latestRows.map((row) => ({
      factor: row.factor,
      contribution: Number(row.contribution),
      confidence: Number(row.confidence),
    }));

    const envelope: ApiEnvelope<DriverAttribution[]> = {
      ok: true,
      data: drivers,
      asOf: new Date().toISOString(),
      source: "analytics.driver_attribution_1d",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
