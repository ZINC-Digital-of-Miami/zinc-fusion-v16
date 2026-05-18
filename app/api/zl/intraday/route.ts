import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { ApiEnvelope, ZlPriceBar } from "@/lib/contracts/api";

const PROJECTION = "symbol, bucket_ts, open, high, low, close, volume";

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const fetchBars = (table: "price_15m" | "price_1m") =>
      supabase
        .schema("mkt")
        .from(table)
        .select(PROJECTION)
        .eq("symbol", "ZL")
        .order("bucket_ts", { ascending: true });

    const primary = await fetchBars("price_15m");
    const fallbackRequired = Boolean(primary.error) || (primary.data ?? []).length === 0;
    const resolved = fallbackRequired ? await fetchBars("price_1m") : primary;
    const sourceTable = fallbackRequired ? "mkt.price_1m" : "mkt.price_15m";

    if (resolved.error) {
      const message = primary.error
        ? `mkt.price_15m: ${primary.error.message}; ${sourceTable}: ${resolved.error.message}`
        : resolved.error.message;
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), source: sourceTable, error: message },
        { status: 500 },
      );
    }

    const bars: ZlPriceBar[] = (resolved.data ?? []).map((row) => ({
      symbol: row.symbol,
      tradeDate: row.bucket_ts,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));

    const envelope: ApiEnvelope<ZlPriceBar[]> = {
      ok: true,
      data: bars,
      asOf: new Date().toISOString(),
      source: sourceTable,
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
