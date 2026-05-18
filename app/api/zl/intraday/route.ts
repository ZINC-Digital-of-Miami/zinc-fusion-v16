import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ApiEnvelope, ZlPriceBar } from "@/lib/contracts/api";

const PROJECTION = "symbol, bucket_ts, open, high, low, close, volume";
const INTRADAY_LIMIT = 1000;

export async function GET() {
  try {
    const supabase = await createClient();

    const fetchBars = (table: "price_15m" | "price_1m" | "price_1h") =>
      supabase
        .schema("mkt")
        .from(table)
        .select(PROJECTION)
        .eq("symbol", "ZL")
        .order("bucket_ts", { ascending: false })
        .limit(INTRADAY_LIMIT);

    const primary = await fetchBars("price_15m");
    const minuteFallbackRequired = Boolean(primary.error) || (primary.data ?? []).length === 0;
    const minuteFallback = minuteFallbackRequired ? await fetchBars("price_1m") : null;
    const hourlyFallbackRequired =
      minuteFallbackRequired &&
      (Boolean(minuteFallback?.error) || (minuteFallback?.data ?? []).length === 0);
    const hourlyFallback = hourlyFallbackRequired ? await fetchBars("price_1h") : null;
    const resolved = hourlyFallback ?? minuteFallback ?? primary;
    const sourceTable = hourlyFallback
      ? "mkt.price_1h"
      : minuteFallback
        ? "mkt.price_1m"
        : "mkt.price_15m";

    if (resolved.error) {
      const errors = [
        primary.error ? `mkt.price_15m: ${primary.error.message}` : null,
        minuteFallback?.error ? `mkt.price_1m: ${minuteFallback.error.message}` : null,
        hourlyFallback?.error ? `mkt.price_1h: ${hourlyFallback.error.message}` : null,
      ].filter(Boolean);
      const message = errors.length > 0 ? errors.join("; ") : resolved.error.message;
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), source: sourceTable, error: message },
        { status: 500 },
      );
    }

    const bars: ZlPriceBar[] = (resolved.data ?? [])
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
