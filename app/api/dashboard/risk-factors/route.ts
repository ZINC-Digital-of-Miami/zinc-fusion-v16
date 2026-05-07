import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

type DriverKey =
  | "vix_stress"
  | "crush_pressure"
  | "china_tension"
  | "tariff_threat"
  | "energy_stress";

type WhatsHappening = {
  whatsHappening: string;
  macroContext: string;
  supplyDemand: string;
  geopolitical: string;
  investorSentiment: string;
  nearTermOutlook: string;
  zlImplication: string;
};

type DriverData = {
  name: string;
  score: number | null;
  level: string;
  regime: string;
  headline: string;
  components: Record<string, number | null>;
  whatsHappening?: WhatsHappening;
  aiPowered: boolean;
  dataDate: string | null;
};

type MarketDriversResponse = {
  as_of_date: string | null;
  as_of_date_min?: string | null;
  as_of_date_max?: string | null;
  mixed_vintage?: boolean;
  drivers: Record<DriverKey, DriverData>;
  summary: {
    average_pressure: number;
    highest_pressure: { name: string; score: number };
    alert_count: number;
  };
  intelligence: {
    headline: string;
    summary: string;
    drivers: { label: string; outlook: string; detail: string }[];
    zlOutlook: "BULLISH" | "NEUTRAL" | "CAUTIOUS" | "BEARISH";
    zlColor: string;
    tradingImplication?: string;
  };
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMetricKey(key: string): string {
  return key.trim().toLowerCase();
}

function coerceScore(value: number | null): number | null {
  if (value === null) return null;
  const abs = Math.abs(value);
  if (abs <= 1) return Math.round(abs * 1000) / 10;
  if (abs <= 100) return Math.round(abs * 10) / 10;
  return 100;
}

function mapFactorToDriver(factor: string): DriverKey | null {
  const f = factor.toLowerCase();
  if (f.includes("vix") || f.includes("volatility")) return "vix_stress";
  if (f.includes("crush")) return "crush_pressure";
  if (f.includes("china") || f.includes("cny")) return "china_tension";
  if (f.includes("tariff") || f.includes("policy") || f.includes("tpu") || f.includes("emv")) return "tariff_threat";
  if (f.includes("energy") || f.includes("crude") || f.includes("oil") || f.includes("cl")) return "energy_stress";
  return null;
}

function levelFor(driver: DriverKey, score: number | null): string {
  if (score === null) return "No Data";

  if (driver === "vix_stress") {
    if (score >= 85) return "Gap Risk";
    if (score >= 65) return "Fund Exit";
    if (score >= 45) return "Elevated";
    return "Calm";
  }
  if (driver === "crush_pressure") {
    if (score >= 85) return "Plant Idling";
    if (score >= 65) return "Margin Squeeze";
    if (score >= 45) return "Breakeven Risk";
    return "Strong";
  }
  if (driver === "china_tension") {
    if (score >= 80) return "Active Conflict";
    if (score >= 60) return "Trade Diversion";
    if (score >= 40) return "Monitor Flows";
    return "Brazil Favored";
  }
  if (driver === "tariff_threat") {
    if (score >= 85) return "Active War";
    if (score >= 65) return "Retaliation Risk";
    if (score >= 45) return "Elevated Noise";
    return "Minimal Threat";
  }
  if (score >= 85) return "Crisis";
  if (score >= 65) return "Supply Shock";
  if (score >= 45) return "Elevated";
  return "Low Risk";
}

function regimeFor(score: number | null): string {
  if (score === null) return "NO_DATA";
  if (score >= 70) return "PRESSURE";
  if (score >= 45) return "WATCH";
  return "CALM";
}

function outlookFromScore(score: number): "BULLISH" | "NEUTRAL" | "CAUTIOUS" | "BEARISH" {
  if (score >= 70) return "BEARISH";
  if (score >= 55) return "CAUTIOUS";
  if (score >= 35) return "NEUTRAL";
  return "BULLISH";
}

function colorFromScore(score: number): string {
  if (score >= 70) return "#EF4444";
  if (score >= 55) return "#EF7300";
  if (score >= 40) return "#EAB308";
  return "#22C55E";
}

function headlineFor(driverName: string, score: number | null): string {
  if (score === null) return `${driverName}: awaiting promoted data`;
  if (score >= 70) return `${driverName}: elevated pressure`;
  if (score >= 45) return `${driverName}: moderate risk`;
  return `${driverName}: stable`;
}

function getMetric(metrics: Map<string, number | null>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metrics.get(normalizeMetricKey(key));
    if (value !== undefined) return value;
  }
  return null;
}

function formatMetric(value: number | null, mode: "fixed1" | "fixed2" | "int" | "pct" | "usd2"): string {
  if (value === null) return "unavailable";
  if (mode === "fixed1") return value.toFixed(1);
  if (mode === "fixed2") return value.toFixed(2);
  if (mode === "int") return value.toFixed(0);
  if (mode === "pct") return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
  return `$${value.toFixed(2)}`;
}

function scoreState(score: number | null): string {
  if (score === null) return "data pending";
  if (score >= 70) return "elevated pressure";
  if (score >= 45) return "watch zone";
  return "calm zone";
}

function driverFocus(driver: DriverKey): string {
  if (driver === "vix_stress") return "volatility transmission into procurement timing";
  if (driver === "crush_pressure") return "processor margin pressure and oil-share economics";
  if (driver === "china_tension") return "China demand and trade-flow displacement";
  if (driver === "tariff_threat") return "policy shocks and geopolitical tariff channels";
  return "energy complex pass-through into ZL";
}

function buildDriverWhatsHappening(
  driver: DriverKey,
  payload: DriverData,
  aggregateSummary: string,
  topDriverName: string,
  averagePressure: number,
): WhatsHappening {
  const scoreText = payload.score === null ? "No scored signal yet" : `Score ${Math.round(payload.score)}`;
  const commonState = scoreState(payload.score);
  const focus = driverFocus(driver);

  const c = payload.components;
  let supplyDemand = "Underlying supply/demand metrics are waiting on the next promoted dataset."
  let geopolitical = "No explicit geopolitical pulse is dominating this driver in the current snapshot."
  let sentiment = `Market posture is ${commonState}; regime tag is ${payload.regime}.`

  if (driver === "vix_stress") {
    supplyDemand = `VIX ${formatMetric(c.vix_value ?? null, "fixed1")} and OVX ${formatMetric(c.ovx_value ?? null, "fixed1")} define the current volatility envelope.`
    geopolitical = "Cross-asset stress is being monitored as an early warning for procurement-cost spikes."
    sentiment = `Volatility regime is ${commonState}; defensive hedging usually increases as this score rises.`
  } else if (driver === "crush_pressure") {
    supplyDemand = `Crush margin ${formatMetric(c.board_crush_value ?? null, "usd2")} and oil share ${formatMetric(c.oil_share_value ?? null, "fixed1")} describe processing economics.`
    geopolitical = "Crush behavior is primarily a microstructure signal unless macro shocks force abrupt repricing."
    sentiment = `Crush pressure is ${commonState}; buyers should watch processing spreads for timing risk.`
  } else if (driver === "china_tension") {
    supplyDemand = `CNY ${formatMetric(c.cny_rate ?? null, "fixed2")} with ${formatMetric(c.soy_china_news_count ?? null, "int")} China/soy headlines tracks demand-flow tension.`
    geopolitical = "Trade-friction headlines and import-flow shifts remain the key geopolitical amplifier here."
    sentiment = `China-linked risk is ${commonState}; abrupt headline shifts can reprice demand assumptions quickly.`
  } else if (driver === "tariff_threat") {
    supplyDemand = `Uncertainty index ${formatMetric(c.uncertainty_value ?? null, "int")} and crude 5D ${formatMetric(c.oil_change_5d ?? null, "pct")} frame policy-to-price transmission.`
    geopolitical = `${formatMetric(c.iran_war_news_count ?? null, "int")} Iran/war headlines and ${formatMetric(c.macro_news_count ?? null, "int")} macro headlines are feeding this channel.`
    sentiment = `Policy risk is ${commonState}; this is the macro/geopolitical lane most likely to force schedule adjustments.`
  } else {
    supplyDemand = `CL ${formatMetric(c.cl_price ?? null, "usd2")}, 5D change ${formatMetric(c.cl_change_5d ?? null, "pct")}, and OVX ${formatMetric(c.ovx_value ?? null, "fixed1")} define energy stress.`
    geopolitical = `Energy headline count is ${formatMetric(c.energy_news_count ?? null, "int")}; supply-shock sensitivity remains active.`
    sentiment = `Energy pass-through is ${commonState}; sustained pressure can lift procurement urgency.`
  }

  const zlImplication =
    payload.score === null
      ? "Keep standard buying cadence while waiting for fresh promoted metrics."
      : payload.score >= 70
        ? "Increase execution vigilance, shorten decision windows, and preserve optionality on contract timing."
        : payload.score >= 45
          ? "Maintain normal execution with tighter monitoring around upcoming refresh windows."
          : "Pressure is contained; continue schedule-based procurement unless another driver escalates."

  return {
    whatsHappening: `${payload.name} is currently ${commonState}. ${scoreText} with level ${payload.level} keeps focus on ${focus}.`,
    macroContext: `${aggregateSummary} Top pressure is ${topDriverName} and average pressure is ${averagePressure.toFixed(1)}.`,
    supplyDemand,
    geopolitical,
    investorSentiment: sentiment,
    nearTermOutlook: payload.score === null ? "Awaiting next signal update." : payload.score >= 70 ? "High-risk posture likely to persist near term." : payload.score >= 45 ? "Mixed posture with event-driven volatility risk." : "Low-pressure posture unless headline regime changes.",
    zlImplication,
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();

    const [{ data: metricRows, error: metricError }, { data: attributionRows, error: attributionError }] = await Promise.all([
      supabase
        .schema("analytics")
        .from("dashboard_metrics")
        .select("trade_date, metric_key, metric_value")
        .order("trade_date", { ascending: false })
        .limit(500),
      supabase
        .schema("analytics")
        .from("driver_attribution_1d")
        .select("trade_date, rank, factor, contribution, confidence")
        .order("trade_date", { ascending: false })
        .order("rank", { ascending: true })
        .limit(100),
    ]);

    if (metricError || attributionError) {
      return NextResponse.json(
        {
          error: metricError?.message ?? attributionError?.message ?? "Failed to load market drivers",
        },
        { status: 500 },
      );
    }

    const latestMetricDate = metricRows?.[0]?.trade_date ?? null;
    const latestMetrics = (metricRows ?? []).filter((r) => r.trade_date === latestMetricDate);
    const metricMap = new Map<string, number | null>();
    for (const row of latestMetrics) {
      metricMap.set(normalizeMetricKey(row.metric_key), toNumber(row.metric_value));
    }

    const latestAttributionDate = attributionRows?.[0]?.trade_date ?? null;
    const latestAttribution = (attributionRows ?? []).filter((r) => r.trade_date === latestAttributionDate);
    const attributionByDriver = new Map<DriverKey, { trade_date: string; factor: string; contribution: number | null }>();
    for (const row of latestAttribution) {
      const driverKey = mapFactorToDriver(String(row.factor));
      if (!driverKey) continue;
      const contribution = toNumber(row.contribution);
      const existing = attributionByDriver.get(driverKey);
      const existingAbs = existing?.contribution === null || existing?.contribution === undefined ? -1 : Math.abs(existing.contribution);
      const currentAbs = contribution === null ? -1 : Math.abs(contribution);
      if (!existing || currentAbs > existingAbs) {
        attributionByDriver.set(driverKey, {
          trade_date: String(row.trade_date),
          factor: String(row.factor),
          contribution,
        });
      }
    }

    const scoreCandidates = {
      vix_stress: coerceScore(getMetric(metricMap, ["vix_stress_score", "vix_score", "market_volatility_score", "driver_vix_score"])),
      crush_pressure: coerceScore(getMetric(metricMap, ["crush_pressure_score", "crush_score", "driver_crush_score"])),
      china_tension: coerceScore(getMetric(metricMap, ["china_tension_score", "china_score", "driver_china_score"])),
      tariff_threat: coerceScore(getMetric(metricMap, ["tariff_threat_score", "tariff_score", "policy_risk_score", "driver_tariff_score"])),
      energy_stress: coerceScore(getMetric(metricMap, ["energy_stress_score", "energy_score", "driver_energy_score"])),
    };

    for (const key of Object.keys(scoreCandidates) as DriverKey[]) {
      if (scoreCandidates[key] === null) {
        scoreCandidates[key] = coerceScore(attributionByDriver.get(key)?.contribution ?? null);
      }
    }

    const metricDate = latestMetricDate ? String(latestMetricDate) : null;
    const dateFor = (key: DriverKey): string | null =>
      attributionByDriver.get(key)?.trade_date ?? metricDate;

    const drivers: Record<DriverKey, DriverData> = {
      vix_stress: {
        name: "VIX Stress",
        score: scoreCandidates.vix_stress,
        level: levelFor("vix_stress", scoreCandidates.vix_stress),
        regime: regimeFor(scoreCandidates.vix_stress),
        headline: headlineFor("Market volatility", scoreCandidates.vix_stress),
        components: {
          vix_value: getMetric(metricMap, ["vix_value"]),
          ovx_value: getMetric(metricMap, ["ovx_value"]),
        },
        aiPowered: false,
        dataDate: dateFor("vix_stress"),
      },
      crush_pressure: {
        name: "Crush Pressure",
        score: scoreCandidates.crush_pressure,
        level: levelFor("crush_pressure", scoreCandidates.crush_pressure),
        regime: regimeFor(scoreCandidates.crush_pressure),
        headline: headlineFor("Crush margins", scoreCandidates.crush_pressure),
        components: {
          board_crush_value: getMetric(metricMap, ["board_crush_value", "crush_margin"]),
          oil_share_value: getMetric(metricMap, ["oil_share_value", "soy_oil_share"]),
          oil_share_5d_change: getMetric(metricMap, ["oil_share_5d_change"]),
        },
        aiPowered: false,
        dataDate: dateFor("crush_pressure"),
      },
      china_tension: {
        name: "China Tension",
        score: scoreCandidates.china_tension,
        level: levelFor("china_tension", scoreCandidates.china_tension),
        regime: regimeFor(scoreCandidates.china_tension),
        headline: headlineFor("China demand/trade", scoreCandidates.china_tension),
        components: {
          cny_rate: getMetric(metricMap, ["cny_rate"]),
          soy_china_news_count: getMetric(metricMap, ["soy_china_news_count", "china_soy_news_count"]),
        },
        aiPowered: false,
        dataDate: dateFor("china_tension"),
      },
      tariff_threat: {
        name: "Tariff Threat",
        score: scoreCandidates.tariff_threat,
        level: levelFor("tariff_threat", scoreCandidates.tariff_threat),
        regime: regimeFor(scoreCandidates.tariff_threat),
        headline: headlineFor("Trade policy", scoreCandidates.tariff_threat),
        components: {
          tpu_value: getMetric(metricMap, ["tpu_value", "trade_policy_uncertainty"]),
          uncertainty_value: getMetric(metricMap, ["uncertainty_value", "tpu_value", "trade_policy_uncertainty"]),
          emv_value: getMetric(metricMap, ["emv_value", "trade_policy_index"]),
          soy_tariff_news_count: getMetric(metricMap, ["soy_tariff_news_count", "tariff_news_count"]),
          oil_change_5d: getMetric(metricMap, ["oil_change_5d", "cl_change_5d", "crude_oil_change_5d"]),
          iran_war_news_count: getMetric(metricMap, ["iran_war_news_count", "soy_tariff_news_count", "tariff_news_count"]),
          macro_news_count: getMetric(metricMap, ["macro_news_count", "soy_tariff_news_count", "tariff_news_count"]),
        },
        aiPowered: false,
        dataDate: dateFor("tariff_threat"),
      },
      energy_stress: {
        name: "Energy Stress",
        score: scoreCandidates.energy_stress,
        level: levelFor("energy_stress", scoreCandidates.energy_stress),
        regime: regimeFor(scoreCandidates.energy_stress),
        headline: headlineFor("Energy complex", scoreCandidates.energy_stress),
        components: {
          cl_price: getMetric(metricMap, ["cl_price", "crude_oil_price"]),
          cl_change_5d: getMetric(metricMap, ["cl_change_5d", "crude_oil_change_5d"]),
          ovx_value: getMetric(metricMap, ["ovx_value"]),
          energy_news_count: getMetric(metricMap, ["energy_news_count"]),
        },
        aiPowered: false,
        dataDate: dateFor("energy_stress"),
      },
    };

    const scoredEntries = (Object.values(drivers) as DriverData[]).filter((d) => d.score !== null) as Array<DriverData & { score: number }>;
    const average = scoredEntries.length > 0
      ? Math.round((scoredEntries.reduce((acc, d) => acc + d.score, 0) / scoredEntries.length) * 10) / 10
      : 0;
    const highest = scoredEntries.length > 0
      ? scoredEntries.slice().sort((a, b) => b.score - a.score)[0]
      : null;
    const topScore = highest?.score ?? 0;
    const topName = highest?.name ?? "No Data";
    const alertCount = scoredEntries.filter((d) => d.score >= 65).length;

    const allDates = (Object.values(drivers) as DriverData[])
      .map((d) => d.dataDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    const asOfDateMin = allDates[0] ?? null;
    const asOfDateMax = allDates[allDates.length - 1] ?? null;
    const asOfDate = asOfDateMin;
    const mixedVintage = Boolean(asOfDateMin && asOfDateMax && asOfDateMin !== asOfDateMax);

    const response: MarketDriversResponse = {
      as_of_date: asOfDate,
      as_of_date_min: asOfDateMin,
      as_of_date_max: asOfDateMax,
      mixed_vintage: mixedVintage,
      drivers: {
        vix_stress: {
          ...drivers.vix_stress,
          whatsHappening: buildDriverWhatsHappening(
            "vix_stress",
            drivers.vix_stress,
            scoredEntries.length === 0
              ? "Awaiting promoted analytics rows."
              : `Top concern is ${topName} at ${Math.round(topScore)}.`,
            topName,
            average,
          ),
        },
        crush_pressure: {
          ...drivers.crush_pressure,
          whatsHappening: buildDriverWhatsHappening(
            "crush_pressure",
            drivers.crush_pressure,
            scoredEntries.length === 0
              ? "Awaiting promoted analytics rows."
              : `Top concern is ${topName} at ${Math.round(topScore)}.`,
            topName,
            average,
          ),
        },
        china_tension: {
          ...drivers.china_tension,
          whatsHappening: buildDriverWhatsHappening(
            "china_tension",
            drivers.china_tension,
            scoredEntries.length === 0
              ? "Awaiting promoted analytics rows."
              : `Top concern is ${topName} at ${Math.round(topScore)}.`,
            topName,
            average,
          ),
        },
        tariff_threat: {
          ...drivers.tariff_threat,
          whatsHappening: buildDriverWhatsHappening(
            "tariff_threat",
            drivers.tariff_threat,
            scoredEntries.length === 0
              ? "Awaiting promoted analytics rows."
              : `Top concern is ${topName} at ${Math.round(topScore)}.`,
            topName,
            average,
          ),
        },
        energy_stress: {
          ...drivers.energy_stress,
          whatsHappening: buildDriverWhatsHappening(
            "energy_stress",
            drivers.energy_stress,
            scoredEntries.length === 0
              ? "Awaiting promoted analytics rows."
              : `Top concern is ${topName} at ${Math.round(topScore)}.`,
            topName,
            average,
          ),
        },
      },
      summary: {
        average_pressure: average,
        highest_pressure: { name: topName, score: topScore },
        alert_count: alertCount,
      },
      intelligence: {
        headline: topScore >= 65 ? "ELEVATED MARKET - Watch Procurement Risk" : "NORMAL MARKET - Buy On Schedule",
        summary:
          scoredEntries.length === 0
            ? "Awaiting promoted analytics rows. Cards are wired to live Supabase contracts and will populate automatically."
            : `Top concern is ${topName} at ${Math.round(topScore)}. Average risk is ${average}.`,
        drivers: (Object.values(drivers) as DriverData[])
          .filter((d) => d.score !== null)
          .map((d) => ({
            label: d.name,
            outlook: d.score !== null && d.score >= 65 ? "PRESSURE" : d.score !== null && d.score <= 35 ? "SUPPORTIVE" : "MIXED",
            detail: d.headline,
          })),
        zlOutlook: outlookFromScore(average),
        zlColor: colorFromScore(average),
        tradingImplication:
          topScore >= 65
            ? "Risk elevated. Keep procurement flexible and monitor next refresh."
            : "No major pressure signal yet. Continue normal buying schedule.",
      },
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
