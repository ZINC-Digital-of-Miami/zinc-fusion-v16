import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ApiEnvelope, ZlPriceBar } from "@/lib/contracts/api";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: rows, error } = await supabase
      .schema("mkt")
      .from("price_1h")
      .select("symbol, bucket_ts, open, high, low, close, volume")
      .eq("symbol", "ZL")
      .order("bucket_ts", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    const bars: ZlPriceBar[] = (rows ?? [])
      .map((row) => ({
        symbol: row.symbol,
        tradeDate: row.bucket_ts,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }))
      .sort(
        (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
      );

    const envelope: ApiEnvelope<ZlPriceBar[]> = {
      ok: true,
      data: bars,
      asOf: new Date().toISOString(),
      source: "mkt.price_1h",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
