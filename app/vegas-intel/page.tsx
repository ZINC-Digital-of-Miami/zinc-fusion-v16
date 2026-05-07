"use client"

import { BackendShell } from "@/components/backend-shell"

export default function VegasIntelPage() {
  return (
    <BackendShell>
      <div className="w-full space-y-6">
        <h1 className="text-2xl font-bold text-white">Vegas Intel</h1>
        <p className="text-slate-400">Sales strategy, event intelligence, and account recommendations for Las Vegas restaurant operations</p>

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
