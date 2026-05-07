"use client"

import { useEffect, useState } from "react"
import { BackendShell } from "@/components/backend-shell"
import { ZlCandlestickChart } from "@/components/chart/ZlCandlestickChart"
import { ProbabilitySurface } from "@/components/dashboard/ProbabilitySurface"
import { RegimeAnalysisChart } from "@/components/dashboard/RegimeAnalysisChart"
import { MarketRiskFactors } from "@/components/dashboard/MarketRiskFactors"
import { MarketIntelligenceRow } from "@/components/dashboard/MarketIntelligenceRow"
import type { TargetZone } from "@/lib/contracts/api"

export default function DashboardPage() {
  const [targetZones, setTargetZones] = useState<TargetZone[]>([])

  useEffect(() => {
    fetch("/api/zl/target-zones")
      .then((r) => r.json())
      .then((res) => { if (res.ok && res.data) setTargetZones(res.data) })
      .catch(() => {})
  }, [])

  return (
    <BackendShell>
      {/* SECTION 1: HERO CHART */}
      <div>
        <ZlCandlestickChart height="80vh" targetZones={targetZones} />
      </div>

      {/* SECTION 2: L3 Probability Surface */}
      <div className="w-full">
        <ProbabilitySurface />
      </div>

      {/* SECTION 3: Regime Analysis */}
      <div className="w-full">
        <RegimeAnalysisChart height={350} timeRange="1Y" />
      </div>

      {/* SECTION 4: AI Market Intelligence */}
      <div className="w-full">
        <div className="flex items-center gap-2 pl-1 border-l-4 border-cyan-500 mb-4">
          <h3 className="text-base font-bold text-white uppercase tracking-wider">
            AI Market Intelligence
          </h3>
        </div>
        <MarketIntelligenceRow />
      </div>

      {/* SECTION 5: Market Risk Factors */}
      <MarketRiskFactors />
    </BackendShell>
  )
}
