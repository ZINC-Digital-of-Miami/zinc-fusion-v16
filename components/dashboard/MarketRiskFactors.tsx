"use client"

import { useEffect, useState } from "react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WhatsHappening {
  whatsHappening: string
  macroContext: string
  supplyDemand: string
  geopolitical: string
  investorSentiment: string
  nearTermOutlook: string
  zlImplication: string
}

interface DriverData {
  name: string
  score: number | null
  level: string
  regime: string
  headline: string
  components: Record<string, number | null>
  whatsHappening?: WhatsHappening
  aiPowered?: boolean
  dataDate?: string
}

interface IntelligenceData {
  headline: string
  summary: string
  drivers: { label: string; outlook: string; detail: string }[]
  zlOutlook: string
  zlColor: string
  tradingImplication?: string
}

interface MarketDriversResponse {
  as_of_date: string | null
  as_of_date_min?: string
  as_of_date_max?: string
  mixed_vintage?: boolean
  drivers: {
    vix_stress: DriverData
    crush_pressure: DriverData
    china_tension: DriverData
    tariff_threat: DriverData
    energy_stress?: DriverData
  }
  summary: {
    average_pressure: number
    highest_pressure: { name: string; score: number }
    alert_count: number
  }
  intelligence: IntelligenceData
}

function formatFreshnessLabel(
  payload: Pick<MarketDriversResponse, "as_of_date" | "as_of_date_min" | "as_of_date_max" | "mixed_vintage"> | null | undefined,
): string | null {
  if (!payload) return null
  if (payload.mixed_vintage && payload.as_of_date_min && payload.as_of_date_max) {
    return `Mixed vintage ${payload.as_of_date_min} to ${payload.as_of_date_max}`
  }
  return payload.as_of_date ? `Data as of ${payload.as_of_date}` : null
}

function formatFreshnessSummary(
  payload: Pick<MarketDriversResponse, "as_of_date" | "as_of_date_min" | "as_of_date_max" | "mixed_vintage"> | null | undefined,
): string {
  if (!payload) return "–"
  if (payload.mixed_vintage && payload.as_of_date_min && payload.as_of_date_max) {
    return `${payload.as_of_date_min} to ${payload.as_of_date_max}`
  }
  return payload.as_of_date ?? "–"
}

// ---------------------------------------------------------------------------
// Display label mappings
// ---------------------------------------------------------------------------

const DRIVER_NAMES: Record<string, string> = {
  "VIX Stress": "Market Volatility",
  "Crush Pressure": "Crush Margins",
  "China Tension": "China / Trade Risk",
  "Tariff Threat": "Macro / Geopolitical",
  "Macro Threat": "Macro / Geopolitical",
  "Energy Stress": "Energy / Oil",
}

const LEVEL_LABELS: Record<string, string> = {
  "Gap Risk": "Extreme Risk", "Fund Exit": "High Risk",
  "Spread Widening": "Elevated", Compressing: "Very Calm",
  "Risk Off": "Risk Off", "High Alert": "High Alert",
  Elevated: "Elevated", Normal: "Normal", Calm: "Calm",
  "Plant Idling": "Margins Collapsing", "Margin Squeeze": "Margins Squeezed",
  "Max Utilization": "Strong Margins", "Breakeven Risk": "Breakeven Risk",
  Comfortable: "Comfortable", Strong: "Strong Margins",
  "Monitor Flows": "Watch Closely", "Brazil Favored": "Low Risk",
  "Brazil Dominates": "Stable", "Trade Diversion": "Trade Diversion",
  "Active Conflict": "Active Conflict",
  "Systemic Shock": "Systemic Shock",
  "Elevated Risk": "Elevated",
  Watch: "Watch",
  Contained: "Contained",
  "Active War": "Active Trade War", "Retaliation Risk": "High Risk",
  "Elevated Noise": "Elevated", "Background Noise": "Background",
  "Minimal Threat": "Quiet",
  Crisis: "Energy Crisis", "Supply Shock": "Supply Shock", "Low Risk": "Low Risk",
}

// ---------------------------------------------------------------------------
// Score → color
// ---------------------------------------------------------------------------

function getScoreColor(score: number): { stroke: string; glow: string } {
  const s = Math.max(0, Math.min(100, score))
  if (s <= 25) return { stroke: "#22C55E", glow: "rgba(34,197,94,0.5)" }
  if (s <= 40) {
    const t = (s - 25) / 15
    return {
      stroke: `rgb(${Math.round(34 + (234 - 34) * t)}, ${Math.round(197 - (197 - 179) * t)}, ${Math.round(94 - (94 - 8) * t)})`,
      glow: `rgba(${Math.round(34 + (234 - 34) * t)}, ${Math.round(197 - (197 - 179) * t)}, ${Math.round(94 - (94 - 8) * t)}, 0.5)`,
    }
  }
  if (s <= 55) return { stroke: "#EAB308", glow: "rgba(234,179,8,0.5)" }
  if (s <= 70) {
    const t = (s - 55) / 15
    return {
      stroke: `rgb(${Math.round(234 + (239 - 234) * t)}, ${Math.round(179 - (179 - 115) * t)}, ${Math.round(8 + (0 - 8) * t)})`,
      glow: `rgba(${Math.round(234 + (239 - 234) * t)}, ${Math.round(179 - (179 - 115) * t)}, ${Math.round(8 + (0 - 8) * t)}, 0.5)`,
    }
  }
  if (s <= 85) return { stroke: "#EF7300", glow: "rgba(239,115,0,0.5)" }
  return { stroke: "#EF4444", glow: "rgba(239,68,68,0.6)" }
}

function getScoreTextColor(score: number | null): string {
  if (score === null) return "text-slate-500"
  if (score >= 70) return "text-red-400"
  if (score >= 55) return "text-orange-400"
  if (score >= 40) return "text-amber-400"
  return "text-green-400"
}

// ---------------------------------------------------------------------------
// Horizontal Meter
// ---------------------------------------------------------------------------

function HorizontalMeter({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <div className="flex items-center gap-4 w-full">
        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden" />
        <span className="text-3xl font-bold tabular-nums min-w-[3ch] text-right text-slate-500">
          --
        </span>
      </div>
    )
  }

  const pct = Math.min(Math.max(score, 0), 100)
  const colors = getScoreColor(score)
  return (
    <div className="flex items-center gap-4 w-full">
      <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: colors.stroke, boxShadow: `0 0 8px ${colors.glow}` }}
        />
      </div>
      <span className="text-3xl font-bold tabular-nums min-w-[3ch] text-right" style={{ color: colors.stroke }}>
        {Math.round(score)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Driver Card
// ---------------------------------------------------------------------------

interface MetricDef {
  key: string
  label: string
  format: (v: number | null) => string
}

function DriverCard({
  label,
  data,
  metrics,
  loading,
}: {
  label: string
  data: DriverData | null
  metrics: MetricDef[]
  loading: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const score = data?.score ?? null
  const level = data?.level ? (LEVEL_LABELS[data.level] ?? data.level) : "--"
  const colors = getScoreColor(score ?? 0)
  const wh = data?.whatsHappening

  const border =
    score !== null && score >= 65
      ? { borderColor: colors.stroke, boxShadow: `0 0 20px ${colors.glow}` }
      : { borderColor: "rgba(255,255,255,0.08)" }

  return (
    <div
      className="bg-[#0a0a0a] border rounded-2xl p-6 md:p-8 flex flex-col hover:border-white/20 transition-all duration-300"
      style={border}
    >
      <div className="text-base font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
        {DRIVER_NAMES[label] ?? label}
        {data?.aiPowered && (
          <span className="px-1.5 py-0.5 rounded text-xs bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">AI</span>
        )}
      </div>

      <div className="w-full mb-2">
        {loading ? (
          <div className="h-3 bg-slate-700/50 rounded-full animate-pulse" />
        ) : (
          <HorizontalMeter score={score} />
        )}
      </div>

      <div className={`text-lg font-medium mt-1 mb-4 ${loading ? "text-slate-600" : getScoreTextColor(score)}`}>
        {loading ? "..." : level}
      </div>

      <div className="w-full space-y-2 border-t border-white/5 pt-4">
        {metrics.map((m) => {
          const val = data?.components?.[m.key] ?? null
          return (
            <div key={m.key} className="flex justify-between items-center text-sm">
              <span className="text-slate-400">{m.label}</span>
              <span className="text-slate-200 font-mono">{loading ? "--" : m.format(val)}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-4 text-sm text-slate-300 leading-relaxed min-h-[40px]">
        {loading ? "..." : (data?.headline ?? "--")}
      </div>

      {!loading && data?.dataDate && (
        <div className="mt-2 text-xs text-slate-500 font-mono">Data as of: {data.dataDate}</div>
      )}

      {wh && !loading && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-2 border border-slate-700/50"
        >
          <span>{expanded ? "\u25BC" : "\u25B6"}</span> What&apos;s Happening?
        </button>
      )}

      {expanded && wh && (
        <div className="mt-4 w-full text-left space-y-3 animate-in slide-in-from-top-2 duration-200">
          <div className="text-sm text-slate-300 leading-relaxed border-l-2 pl-3" style={{ borderColor: colors.stroke }}>
            {wh.whatsHappening}
          </div>
          <div className="space-y-2 pt-1">
            {[
              { t: "Macro Context", c: wh.macroContext },
              { t: "Supply & Demand", c: wh.supplyDemand },
              { t: "Geopolitical", c: wh.geopolitical },
              { t: "Market Sentiment", c: wh.investorSentiment },
              { t: "Near-Term Outlook", c: wh.nearTermOutlook },
            ].map((s) => (
              <div key={s.t}>
                <div className="text-xs text-slate-500 uppercase tracking-wider">{s.t}</div>
                <div className="text-sm text-slate-400 leading-snug">{s.c}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">What This Means For You</div>
            <div className="text-sm text-slate-200">{wh.zlImplication}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export function MarketRiskFactors() {
  const [data, setData] = useState<MarketDriversResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/dashboard/risk-factors", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json) => {
        if (!json.error) setData(json as MarketDriversResponse)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const d = data?.drivers

  return (
    <div className="w-full">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 pl-1 border-l-4 border-cyan-500">
          <h3 className="text-base font-bold text-white uppercase tracking-wider">Market Risk Factors</h3>
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            KEY DRIVERS
          </span>
          {data?.summary?.alert_count != null && data.summary.alert_count > 0 && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
              {data.summary.alert_count} ALERT{data.summary.alert_count > 1 ? "S" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {formatFreshnessLabel(data) && <span className="text-xs text-slate-600">{formatFreshnessLabel(data)}</span>}
        </div>
      </div>

      {/* Summary Bar */}
      {data?.summary && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-slate-400">
            Average Risk:{" "}
            <span className="font-mono" style={{ color: getScoreColor(data.summary.average_pressure ?? 0).stroke }}>
              {data.summary.average_pressure}
            </span>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-slate-400">
            Top Concern:{" "}
            <span className="text-slate-200">
              {DRIVER_NAMES[data.summary.highest_pressure?.name ?? ""] ?? data.summary.highest_pressure?.name}
            </span>{" "}
            (<span className="font-mono" style={{ color: getScoreColor(data.summary.highest_pressure?.score ?? 0).stroke }}>
              {data.summary.highest_pressure?.score}
            </span>)
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-slate-400">
            Freshness: <span className="text-slate-300">{formatFreshnessSummary(data)}</span>
          </div>
        </div>
      )}

      {/* Driver Cards — 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DriverCard
          label="VIX Stress"
          data={d?.vix_stress ?? null}
          metrics={[
            { key: "vix_value", label: "VIX Index", format: (v) => v?.toFixed(1) ?? "--" },
            { key: "ovx_value", label: "Oil Volatility (OVX)", format: (v) => v?.toFixed(1) ?? "--" },
          ]}
          loading={loading}
        />
        <DriverCard
          label="Crush Pressure"
          data={d?.crush_pressure ?? null}
          metrics={[
            { key: "board_crush_value", label: "Crush Margin", format: (v) => v ? `$${v.toFixed(2)}/bu` : "--" },
            { key: "oil_share_value", label: "Oil Value Share", format: (v) => v != null ? `${v.toFixed(1)}%` : "--" },
            { key: "oil_share_5d_change", label: "5-Day Change", format: (v) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "--" },
          ]}
          loading={loading}
        />
        <DriverCard
          label="China Tension"
          data={d?.china_tension ?? null}
          metrics={[
            { key: "cny_rate", label: "Yuan Rate (CNY/USD)", format: (v) => v?.toFixed(2) ?? "--" },
          ]}
          loading={loading}
        />
        <DriverCard
          label="Macro Threat"
          data={d?.tariff_threat ?? null}
          metrics={[
            { key: "uncertainty_value", label: "Uncertainty Index", format: (v) => v?.toFixed(0) ?? "--" },
            { key: "oil_change_5d", label: "Crude Oil (5D)", format: (v) => v != null ? `${(v * 100) >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "--" },
          ]}
          loading={loading}
        />
        <DriverCard
          label="Energy Stress"
          data={d?.energy_stress ?? null}
          metrics={[
            { key: "cl_price", label: "Crude Oil (CL)", format: (v) => v ? `$${v.toFixed(2)}` : "--" },
            { key: "cl_change_5d", label: "5-Day Change", format: (v) => v != null ? `${(v * 100) >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "--" },
            { key: "ovx_value", label: "Oil Volatility (OVX)", format: (v) => v?.toFixed(1) ?? "--" },
          ]}
          loading={loading}
        />
      </div>

    </div>
  )
}
