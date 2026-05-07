"use client"

import { useEffect, useState } from "react"

type IntelligenceData = {
  headline: string
  summary: string
  drivers: { label: string; outlook: string; detail: string }[]
  zlOutlook: string
  zlColor: string
  tradingImplication?: string
  aiPowered?: boolean
}

type RiskFactorsEnvelope = {
  intelligence?: IntelligenceData
}

export function MarketIntelligenceRow() {
  const [intelligence, setIntelligence] = useState<IntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const res = await fetch("/api/dashboard/risk-factors", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as RiskFactorsEnvelope
        if (!active) return
        if (json.intelligence) {
          setIntelligence(json.intelligence)
        } else {
          setError("Unable to load market intelligence")
        }
      } catch (e) {
        if (!active) return
        setError(e instanceof Error ? e.message : "Unable to load market intelligence")
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  if (loading && !intelligence) {
    return (
      <div className="w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 md:p-8">
        <div className="h-6 w-80 bg-slate-700/40 rounded animate-pulse mb-4" />
        <div className="h-4 w-full bg-slate-700/30 rounded animate-pulse mb-2" />
        <div className="h-4 w-5/6 bg-slate-700/30 rounded animate-pulse" />
      </div>
    )
  }

  if (error && !intelligence) {
    return (
      <div className="w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 md:p-8 text-slate-500">
        {error}
      </div>
    )
  }

  if (!intelligence) return null

  return (
    <div className="w-full bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-1 h-6 rounded-full"
            style={{ backgroundColor: intelligence.zlColor }}
          />
          <h4 className="text-lg font-semibold text-white">{intelligence.headline}</h4>
          {intelligence.aiPowered && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/20">
              AI
            </span>
          )}
        </div>
        <span
          className="px-3 py-1.5 rounded text-xs font-bold tracking-wider"
          style={{
            backgroundColor: `${intelligence.zlColor}20`,
            color: intelligence.zlColor,
            border: `1px solid ${intelligence.zlColor}40`,
          }}
        >
          ZL {intelligence.zlOutlook}
        </span>
      </div>

      <p className="text-base text-slate-400 leading-relaxed mb-4">
        {intelligence.summary}
      </p>

      {intelligence.tradingImplication && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
          <span className="text-xs text-slate-500 uppercase tracking-wider">
            What This Means For You
          </span>
          <p className="text-base text-slate-300 mt-1">{intelligence.tradingImplication}</p>
        </div>
      )}

      {intelligence.drivers?.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {intelligence.drivers.map((driver, idx) => (
            <div
              key={`${driver.label}-${idx}`}
              className="flex items-start gap-2 text-sm"
            >
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                  driver.outlook === "BEARISH" || driver.outlook === "PRESSURE"
                    ? "bg-red-500/20 text-red-400"
                    : driver.outlook === "BULLISH" ||
                        driver.outlook === "SUPPORTIVE" ||
                        driver.outlook === "CALM"
                      ? "bg-green-500/20 text-green-400"
                      : driver.outlook === "MIXED" ||
                          driver.outlook === "WATCH SUPPLY"
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-slate-500/20 text-slate-400"
                }`}
              >
                {driver.label}
              </span>
              <span className="text-slate-500">{driver.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
