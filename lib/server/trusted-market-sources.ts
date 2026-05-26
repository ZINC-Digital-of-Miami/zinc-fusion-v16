type YahooChartResult = {
  meta?: {
    regularMarketPrice?: number;
    regularMarketTime?: number;
    previousClose?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
    }>;
  };
};

type YahooChartResponse = {
  chart?: {
    result?: YahooChartResult[];
  };
};

type TrustedSeriesPoint = {
  value: number | null;
  asOf: string | null;
  source: string;
  url: string;
};

type TrustedSeriesWithChange = TrustedSeriesPoint & { change5d: number | null };

export type TrustedMarketSnapshot = {
  fetchedAt: string;
  zl: TrustedSeriesPoint & { change5d: number | null };
  cl: TrustedSeriesPoint & { change5d: number | null };
  cny: TrustedSeriesPoint & { change5d: number | null };
  vix: TrustedSeriesPoint;
  ovx: TrustedSeriesPoint;
};

export const TRUSTED_MARKET_SOURCE_FEEDS = [
  "https://query2.finance.yahoo.com/v8/finance/chart/ZL=F?interval=1d&range=1mo",
  "https://query2.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=1mo",
  "https://query2.finance.yahoo.com/v8/finance/chart/CNY=X?interval=1d&range=1mo",
  "https://hist.databento.com/v0/timeseries.get_range?dataset=GLBX.MDP3&symbols=ZL.n.0&schema=ohlcv-1d&stype_in=continuous",
  "https://hist.databento.com/v0/timeseries.get_range?dataset=GLBX.MDP3&symbols=CL.n.0&schema=ohlcv-1d&stype_in=continuous",
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS",
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=OVXCLS",
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXCHUS",
] as const;

const DATABENTO_DATASET = "GLBX.MDP3";
const DATABENTO_SCHEMA = "ohlcv-1d";
const DATABENTO_SYMBOL_BY_YAHOO: Record<string, string> = {
  "ZL=F": "ZL.n.0",
  "CL=F": "CL.n.0",
};

function toDateIso(ts: number | null | undefined): string | null {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Codex Trusted Source Pull)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchYahooSeries(symbol: string): Promise<TrustedSeriesPoint & { change5d: number | null }> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?interval=1d&range=1mo`;
  const payload = await fetchJson<YahooChartResponse>(url);
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];

  let latestClose: number | null = null;
  let latestTs: number | null = null;
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close)) {
      latestClose = close;
      latestTs = timestamps[i] ?? null;
      break;
    }
  }

  let anchorClose: number | null = null;
  let validSeen = 0;
  for (let i = closes.length - 1; i >= 0; i -= 1) {
    const close = closes[i];
    if (typeof close !== "number" || !Number.isFinite(close)) continue;
    validSeen += 1;
    if (validSeen >= 6) {
      anchorClose = close;
      break;
    }
  }

  const change5d =
    latestClose !== null && anchorClose !== null && anchorClose !== 0
      ? (latestClose - anchorClose) / anchorClose
      : null;

  return {
    value: latestClose,
    asOf: toDateIso(latestTs ?? result?.meta?.regularMarketTime ?? null),
    source: "Yahoo Finance",
    url,
    change5d,
  };
}

function decodeDatabentoPrice(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) >= 10_000) return parsed / 1_000_000_000;
  return parsed;
}

function toDatabentoIso(tsEvent: unknown): string | null {
  if (typeof tsEvent !== "number" && typeof tsEvent !== "string") return null;
  const numeric = Number(tsEvent);
  if (!Number.isFinite(numeric)) return null;
  return new Date(numeric / 1_000_000).toISOString();
}

function buildDatabentoRangeUrl(symbol: string, startIso: string, endIso: string): string {
  const params = new URLSearchParams({
    dataset: DATABENTO_DATASET,
    symbols: symbol,
    schema: DATABENTO_SCHEMA,
    stype_in: "continuous",
    start: startIso,
    end: endIso,
    encoding: "json",
  });
  return `https://hist.databento.com/v0/timeseries.get_range?${params.toString()}`;
}

function asDatabentoAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf-8").toString("base64")}`;
}

async function fetchDatabentoSeries(yahooSymbol: string): Promise<TrustedSeriesWithChange | null> {
  const databentoSymbol = DATABENTO_SYMBOL_BY_YAHOO[yahooSymbol];
  if (!databentoSymbol) return null;

  const apiKey = process.env.DATABENTO_API_KEY?.trim();
  if (!apiKey) return null;

  const end = new Date();
  const start = new Date(end.getTime() - 45 * 24 * 60 * 60 * 1000);
  const endIso = end.toISOString().replace(".000Z", "Z");
  const startIso = start.toISOString().replace(".000Z", "Z");
  const url = buildDatabentoRangeUrl(databentoSymbol, startIso, endIso);

  try {
    const res = await fetch(url, {
      headers: { Authorization: asDatabentoAuth(apiKey) },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const payload = await res.text();
    const rows: Array<{ close: number; asOf: string }> = [];
    for (const rawLine of payload.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        const close = decodeDatabentoPrice(record.close);
        if (close === null || close === 0) continue;
        const header = (record.hd ?? null) as Record<string, unknown> | null;
        const asOf = toDatabentoIso(header?.ts_event ?? record.ts_event);
        if (!asOf) continue;
        rows.push({ close, asOf });
      } catch {
        continue;
      }
    }

    if (rows.length === 0) return null;
    rows.sort((a, b) => new Date(a.asOf).getTime() - new Date(b.asOf).getTime());
    const latest = rows.at(-1) ?? null;
    if (!latest) return null;
    const anchor = rows.length >= 6 ? rows.at(-6) ?? null : null;
    const change5d =
      anchor && anchor.close !== 0 ? (latest.close - anchor.close) / anchor.close : null;

    return {
      value: latest.close,
      asOf: latest.asOf,
      source: "Databento Historical",
      url,
      change5d,
    };
  } catch {
    return null;
  }
}

async function fetchFredSeries(seriesId: string): Promise<TrustedSeriesWithChange> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { value: null, asOf: null, source: "FRED", url, change5d: null };
    }
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    const values: Array<{ date: string; value: number }> = [];
    for (let i = 1; i < lines.length; i += 1) {
      const row = lines[i];
      const [date, value] = row.split(",", 2);
      if (!date || !value || value === ".") continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      values.push({ date, value: n });
    }
    if (values.length === 0) return { value: null, asOf: null, source: "FRED", url, change5d: null };
    const latest = values.at(-1) ?? null;
    if (!latest) return { value: null, asOf: null, source: "FRED", url, change5d: null };
    const anchor = values.length >= 6 ? values.at(-6) ?? null : null;
    const change5d =
      anchor && anchor.value !== 0 ? (latest.value - anchor.value) / anchor.value : null;
    return {
      value: latest.value,
      asOf: new Date(`${latest.date}T00:00:00Z`).toISOString(),
      source: "FRED",
      url,
      change5d,
    };
  } catch {
    return { value: null, asOf: null, source: "FRED", url, change5d: null };
  }
}

async function fetchFredLatest(seriesId: string): Promise<TrustedSeriesPoint> {
  const series = await fetchFredSeries(seriesId);
  return {
    value: series.value,
    asOf: series.asOf,
    source: series.source,
    url: series.url,
  };
}

export async function fetchTrustedMarketSnapshot(): Promise<TrustedMarketSnapshot> {
  const [zlYahoo, clYahoo, cnyYahoo, vix, ovx, cnyFred] = await Promise.all([
    fetchYahooSeries("ZL=F"),
    fetchYahooSeries("CL=F"),
    fetchYahooSeries("CNY=X"),
    fetchFredLatest("VIXCLS"),
    fetchFredLatest("OVXCLS"),
    fetchFredSeries("DEXCHUS"),
  ]);

  const [zlDatabento, clDatabento] = await Promise.all([
    zlYahoo.value === null ? fetchDatabentoSeries("ZL=F") : Promise.resolve(null),
    clYahoo.value === null ? fetchDatabentoSeries("CL=F") : Promise.resolve(null),
  ]);

  const zl = zlYahoo.value !== null ? zlYahoo : zlDatabento ?? zlYahoo;
  const cl = clYahoo.value !== null ? clYahoo : clDatabento ?? clYahoo;
  const cny =
    cnyYahoo.value !== null
      ? cnyYahoo
      : {
          value: cnyFred.value,
          asOf: cnyFred.asOf,
          source: cnyFred.value !== null ? "FRED FX" : cnyYahoo.source,
          url: cnyFred.value !== null ? cnyFred.url : cnyYahoo.url,
          change5d: cnyFred.change5d,
        };

  return {
    fetchedAt: new Date().toISOString(),
    zl,
    cl,
    cny,
    vix,
    ovx,
  };
}

export function uniqueTrustedMarketUrls(snapshot: TrustedMarketSnapshot): string[] {
  return [snapshot.zl.url, snapshot.cl.url, snapshot.cny.url, snapshot.vix.url, snapshot.ovx.url]
    .filter((u, idx, arr) => typeof u === "string" && arr.indexOf(u) === idx);
}
