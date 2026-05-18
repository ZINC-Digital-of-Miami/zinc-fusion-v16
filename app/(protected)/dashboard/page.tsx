"use client"

import { BackendShell } from "@/components/backend-shell"
import { ZlCandlestickChart } from "@/components/chart/ZlCandlestickChart"
import { ProbabilitySurface } from "@/components/dashboard/ProbabilitySurface"
import { RegimeAnalysisChart } from "@/components/dashboard/RegimeAnalysisChart"
import { MarketRiskFactors } from "@/components/dashboard/MarketRiskFactors"
import { MarketIntelligenceRow } from "@/components/dashboard/MarketIntelligenceRow"
import { MarketSymbolPressureBar } from "@/components/dashboard/MarketSymbolPressureBar"

export default function DashboardPage() {
  return (
    <BackendShell>
      {/* SECTION 0: SYMBOL PRESSURE BAR */}
      <div className="w-full">
        <MarketSymbolPressureBar />
      </div>

      {/* SECTION 1: HERO CHART */}
      <div>
        <ZlCandlestickChart height="80vh" />
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
