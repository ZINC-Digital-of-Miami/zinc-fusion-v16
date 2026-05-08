"use client"

import { useEffect, useMemo, useState } from "react"

type DriverData = {
  score: number | null
  components?: Record<string, number | null>
}

type RiskFactorsResponse = {
  drivers?: {
    vix_stress?: DriverData
    crush_pressure?: DriverData
    china_tension?: DriverData
    tariff_threat?: DriverData
    energy_stress?: DriverData
  }
  summary?: {
    average_pressure?: number
  }
}

type TickerRow = {
  label: string
  sublabel: string
  value: number | null
  score: number | null
}

const PRESSURE_DOMINANCE_THRESHOLD_PCT = 55
const RISK_HIGH = 55
const RISK_LOW = 45
const HOURLY_REFRESH_MS = 60 * 60 * 1000

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stateFromScore(score: number | null): -1 | 0 | 1 {
  if (score == null) return 0
  if (score >= RISK_HIGH) return -1
  if (score <= RISK_LOW) return 1
  return 0
}

function stateLabel(state: -1 | 0 | 1): string {
  if (state === 1) return "▲"
  if (state === -1) return "▼"
  return "—"
}

function stateColor(state: -1 | 0 | 1): string {
  if (state === 1) return "#26C6DA"
  if (state === -1) return "#FF0000"
  return "rgba(255,255,255,0.20)"
}

function formatValue(label: string, value: number | null): string {
  if (value == null) return "—"
  if (label === "CNY") return value.toFixed(4)
  return value.toFixed(2)
}

export function MarketSymbolPressureBar() {
  const [riskFactors, setRiskFactors] = useState<RiskFactorsResponse | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const riskRes = await fetch("/api/dashboard/risk-factors", { cache: "no-store" })
        const riskJson = (await riskRes.json()) as RiskFactorsResponse

        if (!active) return
        setRiskFactors(riskJson)
      } catch {
        if (!active) return
        setRiskFactors(null)
      }
    }

    void load()
    const interval = setInterval(load, HOURLY_REFRESH_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const tickerData = useMemo<TickerRow[]>(() => {
    const drivers = riskFactors?.drivers
    const vix = drivers?.vix_stress
    const crush = drivers?.crush_pressure
    const china = drivers?.china_tension
    const tariff = drivers?.tariff_threat
    const energy = drivers?.energy_stress

    return [
      {
        label: "CL",
        sublabel: "Crude Oil",
        value: toNumber(energy?.components?.cl_price),
        score: toNumber(energy?.score),
      },
      {
        label: "VIX",
        sublabel: "Volatility",
        value: toNumber(vix?.components?.vix_value),
        score: toNumber(vix?.score),
      },
      {
        label: "OVX",
        sublabel: "Oil Volatility",
        value: toNumber(energy?.components?.ovx_value) ?? toNumber(vix?.components?.ovx_value),
        score: toNumber(energy?.score) ?? toNumber(vix?.score),
      },
      {
        label: "CNY",
        sublabel: "Yuan",
        value: toNumber(china?.components?.cny_rate),
        score: toNumber(china?.score),
      },
      {
        label: "CRUSH",
        sublabel: "Crush Margin",
        value: toNumber(crush?.components?.board_crush_value),
        score: toNumber(crush?.score) ?? toNumber(tariff?.score),
      },
    ]
  }, [riskFactors])

  const laneImpacts = tickerData.map((row) => {
    const score = row.score
    if (score == null) return 0
    return 50 - score
  })
  const upPressure = laneImpacts.reduce((sum, impact) => sum + Math.max(0, impact), 0)
  const downPressure = laneImpacts.reduce((sum, impact) => sum + Math.max(0, -impact), 0)
  const totalAbs = upPressure + downPressure
  const upPressurePct = totalAbs > 0 ? (upPressure / totalAbs) * 100 : 50
  const downPressurePct = 100 - upPressurePct
  const confluencePct = Math.max(upPressurePct, downPressurePct)

  const netUpDominant = upPressurePct >= PRESSURE_DOMINANCE_THRESHOLD_PCT
  const netDownDominant = downPressurePct >= PRESSURE_DOMINANCE_THRESHOLD_PCT
  const netDirectionLabel = netUpDominant ? "Bullish" : netDownDominant ? "Bearish" : "Balanced"

  return (
    <div
      className="flex flex-col w-full flex-shrink-0"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-0 w-full overflow-x-auto">
        {tickerData.map((row, index) => {
          const laneImpact = laneImpacts[index] ?? 0
          const lanePressurePct = totalAbs > 0 ? (Math.abs(laneImpact) / totalAbs) * 100 : 0
          const state = stateFromScore(row.score)
          const scoreOpacity = row.score == null ? 0.45 : clamp(0.45 + (Math.abs(laneImpact) / 50) * 0.55, 0.45, 1)
          const tintAlpha =
            row.score == null
              ? 0.04
              : clamp(0.07 + (lanePressurePct / 100) * 0.22, 0.07, 0.30)
          const laneBg =
            state === 1
              ? `rgba(38, 198, 218, ${tintAlpha})`
              : state === -1
                ? `rgba(242, 54, 69, ${tintAlpha})`
                : "rgba(255,255,255,0.03)"

          return (
            <div
              key={row.label}
              className="flex-1 min-w-[90px] px-3 py-0 flex flex-col gap-0"
              style={{
                background: laneBg,
                borderRight: "1px solid rgba(255,255,255,0.04)",
                transition: "background 0.3s ease",
                opacity: scoreOpacity,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold" style={{ color: stateColor(state) }}>
                  {stateLabel(state)}
                </span>
                <span className="text-[11px] font-semibold text-white/55 tracking-wide">
                  {row.label}
                </span>
                <span className="text-[9px] text-white tracking-wider">
                  {row.sublabel}
                </span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium text-white tabular-nums">
                  {formatValue(row.label, row.value)}
                </span>
                <span className="text-[10px] text-white tabular-nums">
                  {row.score == null ? "—" : `${Math.round(row.score)}`}
                </span>
                <span className="text-[9px] text-white tabular-nums">
                  {lanePressurePct.toFixed(0)}%
                </span>
              </div>
            </div>
          )
        })}

        <div
          className="flex-none min-w-[80px] px-3 py-0 flex flex-col items-center justify-center gap-0"
          style={{
            background: netUpDominant
              ? "rgba(38, 198, 218, 0.14)"
              : netDownDominant
                ? "rgba(242, 54, 69, 0.16)"
                : "rgba(255,255,255,0.03)",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span className="text-[9px] text-white/30 uppercase tracking-wider font-medium">
            Pressure
          </span>
          <span
            className="text-2xl leading-none font-extrabold tabular-nums"
            style={{ color: "#FFFFFF" }}
          >
            {confluencePct.toFixed(0)}%
          </span>
          <span className="text-[9px] text-white uppercase tracking-wide">{netDirectionLabel}</span>
        </div>
      </div>
    </div>
  )
}
