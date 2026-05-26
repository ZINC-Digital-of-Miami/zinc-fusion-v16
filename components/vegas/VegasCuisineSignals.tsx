"use client";

import { UtensilsCrossed } from "lucide-react";
import type { VegasDemandSignal } from "@/lib/contracts/api";

export function VegasCuisineSignals({ signals }: { signals: VegasDemandSignal[] }) {
  if (!signals || signals.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
          <UtensilsCrossed className="h-4 w-4" />
          Cuisine Demand Alignment
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {signals.map((sig, idx) => {
          const width = `${Math.min(100, Math.max(10, sig.demandScore))}%`;
          const isHot = sig.demandScore > 60;
          
          return (
            <div key={idx} className="rounded-[12px] border border-white/5 bg-[#0a0a0a] p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold capitalize text-white">{sig.category}</div>
                <div className={`font-bold ${isHot ? "text-cyan-400" : "text-slate-400"}`}>
                  {sig.demandScore}
                </div>
              </div>
              
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div 
                  className={`h-full rounded-full ${isHot ? "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]" : "bg-white/20"}`}
                  style={{ width }}
                />
              </div>

              <div className="text-xs text-slate-500 line-clamp-2">
                {sig.salesNote}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
