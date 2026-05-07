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
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS",
  "https://fred.stlouisfed.org/graph/fredgraph.csv?id=OVXCLS",
] as const;

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

async function fetchFredLatest(seriesId: string): Promise<TrustedSeriesPoint> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { value: null, asOf: null, source: "FRED", url };
    }
    const csv = await res.text();
    const lines = csv.trim().split("\n");
    for (let i = lines.length - 1; i >= 1; i -= 1) {
      const row = lines[i];
      const [date, value] = row.split(",", 2);
      if (!date || !value || value === ".") continue;
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      return {
        value: n,
        asOf: new Date(`${date}T00:00:00Z`).toISOString(),
        source: "FRED",
        url,
      };
    }
  } catch {
    return { value: null, asOf: null, source: "FRED", url };
  }
  return { value: null, asOf: null, source: "FRED", url };
}

export async function fetchTrustedMarketSnapshot(): Promise<TrustedMarketSnapshot> {
  const [zl, cl, cny, vix, ovx] = await Promise.all([
    fetchYahooSeries("ZL=F"),
    fetchYahooSeries("CL=F"),
    fetchYahooSeries("CNY=X"),
    fetchFredLatest("VIXCLS"),
    fetchFredLatest("OVXCLS"),
  ]);

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
