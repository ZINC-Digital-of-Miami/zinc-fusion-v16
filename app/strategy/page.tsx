"use client"

import { useEffect, useState } from "react"
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
        <h1 className="text-2xl font-bold text-white">Strategy</h1>
        <p className="text-slate-400">Procurement posture and contract recommendations</p>

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
