"use client"

import { useEffect, useRef, useState } from "react"
import {
  createChart,
  LineSeries,
  HistogramSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type Time,
} from "lightweight-charts"

type MarketRegime = "BULLISH" | "BEARISH" | "NEUTRAL" | "SUPPLY_CRISIS" | "DEMAND_SHOCK"

const REGIME_COLORS: Record<MarketRegime, { bg: string; border: string }> = {
  BULLISH: { bg: "rgba(34, 197, 94, 0.15)", border: "#22C55E" },
  BEARISH: { bg: "rgba(239, 68, 68, 0.15)", border: "#EF4444" },
  NEUTRAL: { bg: "rgba(107, 114, 128, 0.1)", border: "#6B7280" },
  SUPPLY_CRISIS: { bg: "rgba(239, 68, 68, 0.25)", border: "#DC2626" },
  DEMAND_SHOCK: { bg: "rgba(34, 197, 94, 0.25)", border: "#16A34A" },
}

interface RegimeZone {
  start: string
  end: string
  regime: MarketRegime
}

function toChartDay(dateStr: string): Time {
  return dateStr.slice(0, 10) as unknown as Time
}

function rollingSma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out

  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function RegimeAnalysisChart({
  height = 400,
  timeRange = "1Y",
}: {
  height?: number
  timeRange?: "1M" | "3M" | "6M" | "1Y"
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const [selectedRange, setSelectedRange] = useState(timeRange)
  const [priceData, setPriceData] = useState<{ timestamp: string; close: number }[]>([])
  const [currentRegime, setCurrentRegime] = useState<MarketRegime>("NEUTRAL")

  useEffect(() => {
    fetch("/api/zl/price-1d")
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          setPriceData(
            json.data.map((d: Record<string, unknown>) => ({
              timestamp: String(d.tradeDate),
              close: Number(d.close),
            })),
          )
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!containerRef.current || priceData.length === 0) return

    // Filter by selected range
    const days = { "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }[selectedRange]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const filtered = priceData.filter((d) => new Date(d.timestamp) >= cutoff)
    if (filtered.length === 0) return

    if (chartRef.current) {
      try { chartRef.current.remove() } catch { /* disposed */ }
      chartRef.current = null
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#525252",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      handleScroll: false,
      handleScale: false,
      crosshair: {
        vertLine: {
          color: "rgba(0, 212, 255, 0.2)",
          width: 1,
          style: LineStyle.Dashed,
          labelVisible: true,
        },
        horzLine: { visible: false, labelVisible: false },
      },
      timeScale: {
        visible: true,
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: { borderVisible: false, visible: false },
      leftPriceScale: { visible: true, borderVisible: false },
    })

    chartRef.current = chart

    const lineData = filtered
      .map((d) => ({ time: toChartDay(d.timestamp), value: d.close }))
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))

    // SMA-based regime detection
    const regimeZones: RegimeZone[] = []
    let currentZoneStart = lineData[0]?.time as string
    let prevRegime: MarketRegime = "NEUTRAL"

    const closeValues = lineData.map((d) => d.value)
    const shortPeriod = Math.min(20, Math.max(8, Math.floor(lineData.length * 0.35)))
    const longPeriod = Math.min(50, Math.max(shortPeriod + 8, Math.floor(lineData.length * 0.75)))
    const bullThreshold = longPeriod >= 50 ? 1.02 : 1.01
    const bearThreshold = longPeriod >= 50 ? 0.98 : 0.99
    const supplyThreshold = longPeriod >= 50 ? 0.95 : 0.97
    const demandThreshold = longPeriod >= 50 ? 1.08 : 1.05
    const smaShort = rollingSma(closeValues, shortPeriod)
    const smaLong = rollingSma(closeValues, longPeriod)

    for (let i = 0; i < lineData.length; i += 1) {
      const sShort = smaShort[i]
      const sLong = smaLong[i]
      if (sShort == null || sLong == null) continue

      const price = lineData[i].value
      let regime: MarketRegime = "NEUTRAL"
      if (sShort > sLong * bullThreshold && price > sShort) regime = "BULLISH"
      else if (sShort < sLong * bearThreshold && price < sShort) regime = "BEARISH"
      else if (price < sLong * supplyThreshold) regime = "SUPPLY_CRISIS"
      else if (price > sLong * demandThreshold) regime = "DEMAND_SHOCK"

      if (regime !== prevRegime) {
        if (currentZoneStart) {
          regimeZones.push({ start: currentZoneStart, end: lineData[i].time as string, regime: prevRegime })
        }
        currentZoneStart = lineData[i].time as string
        prevRegime = regime
      }
    }

    if (currentZoneStart && lineData.length > 0) {
      regimeZones.push({ start: currentZoneStart, end: lineData[lineData.length - 1].time as string, regime: prevRegime })
      setCurrentRegime(prevRegime)
    }

    // Draw regime zones as histogram background
    for (const zone of regimeZones) {
      const zoneData = lineData
        .filter((d) => (d.time as string) >= zone.start && (d.time as string) <= zone.end)
        .map((d) => ({ time: d.time, value: 1, color: REGIME_COLORS[zone.regime].bg }))

      if (zoneData.length > 0) {
        const maxPrice = Math.max(...lineData.map((d) => d.value))
        const minPrice = Math.min(...lineData.map((d) => d.value))
        const range = maxPrice - minPrice

        const zoneSeries = chart.addSeries(HistogramSeries, {
          priceLineVisible: false,
          lastValueVisible: false,
          priceScaleId: "regime",
          color: REGIME_COLORS[zone.regime].bg,
        })

        zoneSeries.setData(
          zoneData.map((d) => ({
            time: d.time,
            value: maxPrice + range * 0.1,
            color: REGIME_COLORS[zone.regime].bg,
          })),
        )
      }
    }

    // Price line on top
    const priceLine = chart.addSeries(LineSeries, {
      color: "#ffffff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      priceScaleId: "left",
    })
    priceLine.setData(lineData)

    chart.timeScale().fitContent()

    let disposed = false
    const observer = new ResizeObserver((entries) => {
      if (disposed || !entries[0]) return
      const { width } = entries[0].contentRect
      try { chart.applyOptions({ width, height }) } catch { /* disposed */ }
    })
    observer.observe(containerRef.current)

    return () => {
      disposed = true
      observer.disconnect()
      try { chart.remove() } catch { /* disposed */ }
      chartRef.current = null
    }
  }, [priceData, selectedRange, height])

  return (
    <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-white">ZL Futures - Regime Analysis</h3>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Beta
          </span>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
            style={{
              backgroundColor: REGIME_COLORS[currentRegime].bg,
              color: REGIME_COLORS[currentRegime].border,
              border: `1px solid ${REGIME_COLORS[currentRegime].border}30`,
            }}
          >
            {currentRegime.replace("_", " ")}
          </span>
        </div>

        <div className="flex items-center bg-white/5 rounded-lg p-0.5">
          {(["1M", "3M", "6M", "1Y"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                selectedRange === range ? "bg-white/10 text-white" : "text-slate-500 hover:text-white"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ height }} />

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 py-2 border-t border-white/5 bg-white/[0.02]">
        {(Object.entries(REGIME_COLORS) as [MarketRegime, { bg: string; border: string }][])
          .map(([regime, colors]) => (
            <div key={regime} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}40` }}
              />
              <span className="text-[10px] text-slate-500 uppercase">
                {regime.replace("_", " ")}
              </span>
            </div>
          ))}
      </div>
    </div>
  )
}
