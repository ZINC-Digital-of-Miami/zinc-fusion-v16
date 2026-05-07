import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { ApiEnvelope, ZlPriceBar } from "@/lib/contracts/api";

type YahooChartQuote = {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
};

type YahooChartResult = {
  timestamp?: number[];
  indicators?: {
    quote?: YahooChartQuote[];
  };
};

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[];
  };
};

function dayKey(tsIso: string): string {
  return tsIso.slice(0, 10);
}

function toBarDateUtc(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

async function fetchYahooLatestDailyBar(): Promise<ZlPriceBar | null> {
  const url = "https://query2.finance.yahoo.com/v8/finance/chart/ZL=F?interval=1d&range=1mo";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Codex Market Feed)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as YahooChartResponse;
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    const opens = quote?.open ?? [];
    const highs = quote?.high ?? [];
    const lows = quote?.low ?? [];
    const closes = quote?.close ?? [];
    const volumes = quote?.volume ?? [];

    for (let i = timestamps.length - 1; i >= 0; i -= 1) {
      const ts = timestamps[i];
      const open = opens[i];
      const high = highs[i];
      const low = lows[i];
      const close = closes[i];
      const volume = volumes[i];
      if (
        typeof ts !== "number" ||
        typeof open !== "number" ||
        typeof high !== "number" ||
        typeof low !== "number" ||
        typeof close !== "number"
      ) {
        continue;
      }

      const barDate = toBarDateUtc(ts);
      return {
        symbol: "ZL",
        tradeDate: `${barDate}T00:00:00+00:00`,
        open,
        high,
        low,
        close,
        volume: typeof volume === "number" && Number.isFinite(volume) ? volume : 0,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const { data: rows, error } = await supabase
      .schema("mkt")
      .from("price_1d")
      .select("symbol, bucket_ts, open, high, low, close, volume")
      .eq("symbol", "ZL")
      .order("bucket_ts", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, data: [], asOf: new Date().toISOString(), error: error.message },
        { status: 500 },
      );
    }

    const bars: ZlPriceBar[] = (rows ?? []).map((row) => ({
      symbol: row.symbol,
      tradeDate: row.bucket_ts,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
    }));

    const yahooLatest = await fetchYahooLatestDailyBar();
    if (yahooLatest) {
      const lastBar = bars[bars.length - 1] ?? null;
      const lastDay = lastBar ? dayKey(lastBar.tradeDate) : null;
      const yahooDay = dayKey(yahooLatest.tradeDate);

      if (!lastDay || yahooDay > lastDay) {
        bars.push(yahooLatest);
      } else if (yahooDay === lastDay && lastBar) {
        bars[bars.length - 1] = yahooLatest;
      }
    }

    const envelope: ApiEnvelope<ZlPriceBar[]> = {
      ok: true,
      data: bars,
      asOf: new Date().toISOString(),
      source: yahooLatest ? "mkt.price_1d + Yahoo Finance (latest daily bar)" : "mkt.price_1d",
    };

    return NextResponse.json(envelope);
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
