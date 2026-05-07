"use client"

import { useEffect, useState } from "react"
import { Building2 } from "lucide-react"

import { BackendShell } from "@/components/backend-shell"
import type { AiCardContent } from "@/lib/contracts/ai-card"
import type { ApiEnvelope, VegasIntelSnapshot } from "@/lib/contracts/api"

type VegasCards = {
  upcomingEvents: AiCardContent
  aiSalesStrategy: AiCardContent
  restaurantAccounts: AiCardContent
  fryerTracking: AiCardContent
}

export default function VegasIntelPage() {
  const [snapshot, setSnapshot] = useState<VegasIntelSnapshot | null>(null)
  const [cards, setCards] = useState<VegasCards | null>(null)

  useEffect(() => {
    fetch("/api/vegas/intel", { cache: "no-store" })
      .then((r) => r.json() as Promise<ApiEnvelope<VegasIntelSnapshot | null> & { cards?: VegasCards }>)
      .then((res) => {
        if (res.ok && res.data) setSnapshot(res.data)
        if (res.cards) setCards(res.cards)
      })
      .catch(() => {})
  }, [])

  return (
    <BackendShell>
      <div className="w-full space-y-6">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Building2 className="w-8 h-8" />
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">Vegas Intel</h1>
            </div>
            <p className="text-slate-400 text-sm font-mono">
              Sales strategy, event intelligence, and account recommendations for Las Vegas restaurant operations
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Active Events</div>
            <div className="text-2xl font-bold text-white mt-1">{snapshot?.activeEvents ?? "—"}</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider">High Priority Accounts</div>
            <div className="text-2xl font-bold text-white mt-1">{snapshot?.highPriorityAccounts ?? "—"}</div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">
            {cards?.upcomingEvents?.title ?? "Upcoming Events"}
          </div>
          <p className="text-slate-300 text-center py-4">
            {cards?.upcomingEvents?.body ?? "Awaiting event data"}
          </p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">
            {cards?.aiSalesStrategy?.title ?? "AI Sales Strategy"}
          </div>
          <p className="text-slate-300 text-center py-4">
            {cards?.aiSalesStrategy?.body ?? "Awaiting customer and event data from Glide API"}
          </p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">
            {cards?.restaurantAccounts?.title ?? "Restaurant Accounts"}
          </div>
          <p className="text-slate-300 text-center py-4">
            {cards?.restaurantAccounts?.body ?? "Awaiting restaurant data from Glide API"}
          </p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">
            {cards?.fryerTracking?.title ?? "Fryer Equipment Tracking"}
          </div>
          <p className="text-slate-300 text-center py-4">
            {cards?.fryerTracking?.body ?? "Awaiting equipment lifecycle data"}
          </p>
        </div>
      </div>
    </BackendShell>
  )
}
