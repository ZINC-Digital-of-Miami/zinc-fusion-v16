"use client"

import { Building2 } from "lucide-react"

import { BackendShell } from "@/components/backend-shell"

export default function VegasIntelPage() {
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
            <div className="text-2xl font-bold text-white mt-1">—</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider">High Priority Accounts</div>
            <div className="text-2xl font-bold text-white mt-1">—</div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Upcoming Events</div>
          <p className="text-slate-500 text-center py-4">Awaiting event data</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">AI Sales Strategy</div>
          <p className="text-slate-500 text-center py-4">Awaiting customer and event data from Glide API</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Restaurant Accounts</div>
          <p className="text-slate-500 text-center py-4">Awaiting restaurant data from Glide API</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">Fryer Equipment Tracking</div>
          <p className="text-slate-500 text-center py-4">Awaiting equipment lifecycle data</p>
        </div>
      </div>
    </BackendShell>
  )
}
