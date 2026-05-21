import { NextResponse } from "next/server";

import { createServerDataClient } from "@/lib/server/server-data-client";
import type { ApiEnvelope, ZlPriceBar } from "@/lib/contracts/api";

const PROJECTION = "symbol, bucket_ts, open, high, low, close, volume";
const INTRADAY_LIMIT = 1000;
const INTRADAY_SOURCE = "mkt.price_1h";

export async function GET() {
  try {
    const supabase = await createServerDataClient();

    const { data: rows, error } = await supabase
      .schema("mkt")
      .from("price_1h")
      .select(PROJECTION)
      .eq("symbol", "ZL")
      .order("bucket_ts", { ascending: false })
      .limit(INTRADAY_LIMIT);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          data: [],
          asOf: new Date().toISOString(),
          source: INTRADAY_SOURCE,
          error: `mkt.price_1h: ${error.message}`,
        },
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
      source: INTRADAY_SOURCE,
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
