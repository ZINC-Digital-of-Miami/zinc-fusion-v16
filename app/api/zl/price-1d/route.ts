import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ApiEnvelope, ZlPriceBar } from "@/lib/contracts/api";

type PriceRow = {
  symbol: string;
  bucket_ts: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string | null;
};

function dayKey(tsIso: string): string {
  return tsIso.slice(0, 10);
}

function buildLatestDatabentoDailyFromIntraday(
  rows: PriceRow[],
  { symbol }: { symbol: string },
): ZlPriceBar | null {
  if (rows.length === 0) return null;

  const latestDay = dayKey(rows[0].bucket_ts);
  const sameDayRows = rows.filter((row) => dayKey(row.bucket_ts) === latestDay);
  if (sameDayRows.length === 0) return null;

  sameDayRows.sort(
    (a, b) => new Date(a.bucket_ts).getTime() - new Date(b.bucket_ts).getTime(),
  );

  const parsedRows = sameDayRows
    .map((row) => ({
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume ?? 0),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.open) &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close),
    );

  if (parsedRows.length === 0) return null;

  const open = parsedRows[0].open;
  const close = parsedRows[parsedRows.length - 1].close;
  let high = parsedRows[0].high;
  let low = parsedRows[0].low;
  let volume = 0;

  for (const row of parsedRows) {
    if (row.high > high) high = row.high;
    if (row.low < low) low = row.low;
    if (Number.isFinite(row.volume)) volume += row.volume;
  }

  return {
    symbol,
    tradeDate: `${latestDay}T00:00:00+00:00`,
    open,
    high,
    low,
    close,
    volume,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();

    // Supabase Data API commonly enforces a max-row cap (default 1000).
    // Pull newest rows first so we always include the current chart window.
    const { data: rows, error } = await supabase
      .schema("mkt")
      .from("price_1d")
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

    const { data: intradayRows, error: intradayError } = await supabase
      .schema("mkt")
      .from("price_1h")
      .select("symbol, bucket_ts, open, high, low, close, volume")
      .eq("symbol", "ZL")
      .order("bucket_ts", { ascending: false })
      .limit(96);

    let intradaySource: string | null = null;
    let databentoLatest: ZlPriceBar | null = null;

    if (!intradayError && intradayRows && intradayRows.length > 0) {
      databentoLatest = buildLatestDatabentoDailyFromIntraday(
        intradayRows as PriceRow[],
        { symbol: "ZL" },
      );
      if (databentoLatest) {
        intradaySource = "mkt.price_1h";
      }
    }

    if (databentoLatest) {
      const lastBar = bars[bars.length - 1] ?? null;
      const lastDay = lastBar ? dayKey(lastBar.tradeDate) : null;
      const databentoDay = dayKey(databentoLatest.tradeDate);

      if (!lastDay || databentoDay > lastDay) {
        bars.push(databentoLatest);
      } else if (databentoDay === lastDay && lastBar) {
        bars[bars.length - 1] = databentoLatest;
      }
    }

    const envelope: ApiEnvelope<ZlPriceBar[]> = {
      ok: true,
      data: bars,
      asOf: new Date().toISOString(),
      source: intradaySource
        ? `mkt.price_1d + Databento (${intradaySource} latest daily bar)`
        : "mkt.price_1d",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
