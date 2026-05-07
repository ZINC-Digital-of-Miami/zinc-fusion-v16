"use client"

import { useEffect, useState } from "react"
import { TrendingUp } from "lucide-react"

import { BackendShell } from "@/components/backend-shell"

interface StrategyPosture {
  posture: "ACCUMULATE" | "WAIT" | "DEFER"
  rationale: string
  updatedAt: string
}

export default function StrategyPage() {
  const [posture, setPosture] = useState<StrategyPosture | null>(null)

  useEffect(() => {
    fetch("/api/strategy/posture")
      .then((r) => r.json())
      .then((res) => { if (res.data) setPosture(res.data) })
      .catch(() => {})
  }, [])

  return (
    <BackendShell>
      <div className="w-full space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <TrendingUp className="w-8 h-8" />
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">Strategy</h1>
            </div>
            <p className="text-slate-400 text-sm font-mono">Procurement posture and contract recommendations</p>
          </div>
        </header>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Market Posture</div>
          {posture ? (
            <div>
              <div className="text-3xl font-bold mb-3" style={{
                color: posture.posture === "ACCUMULATE" ? "#22C55E" : posture.posture === "DEFER" ? "#EF4444" : "#EAB308"
              }}>
                {posture.posture}
              </div>
              <p className="text-slate-300 leading-relaxed">{posture.rationale}</p>
            </div>
          ) : (
            <p className="text-slate-500">Awaiting strategy data</p>
          )}
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Contract Impact Calculator</div>
          <p className="text-slate-500">Awaiting forecast and pricing data</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Factor Waterfall</div>
          <p className="text-slate-500">Awaiting driver attribution data</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Risk Metrics</div>
          <p className="text-slate-500">Awaiting risk calculation data</p>
        </div>
      </div>
    </BackendShell>
  )
}
