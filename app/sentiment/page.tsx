"use client"

import { BackendShell } from "@/components/backend-shell"

export default function SentimentPage() {
  return (
    <BackendShell>
      <div className="w-full space-y-6">
        <h1 className="text-2xl font-bold text-white">Sentiment</h1>
        <p className="text-slate-400">Market narrative, news sentiment, and CFTC positioning</p>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Headlines</div>
            <div className="text-2xl font-bold text-white mt-1">—</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider">Sentiment Score</div>
            <div className="text-2xl font-bold text-white mt-1">—</div>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5">
            <div className="text-xs text-slate-500 uppercase tracking-wider">CoT Bias</div>
            <div className="text-2xl font-bold text-white mt-1">—</div>
          </div>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">News Feed</div>
          <p className="text-slate-500 text-center py-4">Awaiting news data</p>
        </div>

        <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-4">CFTC Commitments of Traders</div>
          <p className="text-slate-500 text-center py-4">Awaiting CFTC positioning data</p>
        </div>
      </div>
    </BackendShell>
  )
}
