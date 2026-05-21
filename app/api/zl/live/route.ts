import { NextResponse } from "next/server";

import { createServerDataClient } from "@/lib/server/server-data-client";
import type { ApiEnvelope, ZlLivePrice } from "@/lib/contracts/api";

export async function GET() {
  try {
    const supabase = await createServerDataClient();

    const { data: row, error } = await supabase
      .schema("mkt")
      .from("latest_price")
      .select("symbol, price, observed_at")
      .eq("symbol", "ZL")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, data: null, asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    const live: ZlLivePrice | null = row
      ? { symbol: row.symbol, price: Number(row.price), observedAt: row.observed_at }
      : null;

    const envelope: ApiEnvelope<ZlLivePrice | null> = {
      ok: true,
      data: live,
      asOf: new Date().toISOString(),
      source: "mkt.latest_price",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: null, asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
