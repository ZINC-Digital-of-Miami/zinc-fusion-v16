"use client";

import { Flame, Info, MapPin } from "lucide-react";
import type { VegasOpportunityRow } from "@/lib/contracts/api";

export function VegasOpportunityGrid({
  opportunities,
  onIntel,
  loadingId,
}: {
  opportunities: VegasOpportunityRow[];
  onIntel: (row: VegasOpportunityRow) => void;
  loadingId: number | null;
}) {
  if (!opportunities || opportunities.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
          <Flame className="h-4 w-4" />
          Top Growth Opportunities (Ranked)
        </div>
      </div>

      <div className="grid gap-4">
        {opportunities.slice(0, 5).map((row, index) => {
          const rank = index + 1;
          const isLead = row.customerStatus === "prospect";
          const color = isLead ? "border-red-500/30 text-red-400" : "border-cyan-500/30 text-cyan-400";
          const bgHover = isLead ? "hover:bg-red-500/5" : "hover:bg-cyan-500/5";

          return (
            <div
              key={row.id}
              className={`group flex items-center justify-between rounded-[16px] border border-white/5 bg-[#0a0a0a] p-4 transition-all hover:border-white/20 ${bgHover}`}
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-black/50 text-lg font-bold ${color}`}>
                  {rank}
                </div>
                
                <div>
                  <h3 className="font-semibold text-white">{row.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="h-3 w-3" />
                    {row.casino ?? "Free-standing"}
                    <span className="text-white/20">•</span>
                    <span className="capitalize">{row.cuisineType ?? "Unknown cuisine"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="hidden text-right md:block">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Target Lift</div>
                  <div className="font-semibold text-green-400">
                    +{row.zfusionScore ? row.zfusionScore.toFixed(0) : "12"}%
                  </div>
                </div>
                
                <div className="hidden text-right md:block">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Avg Ticket</div>
                  <div className="font-semibold text-white">
                    ${row.expectedSpend ? row.expectedSpend.toLocaleString() : "n/a"}
                  </div>
                </div>

                <button
                  onClick={() => onIntel(row)}
                  disabled={loadingId === row.id}
                  className="flex items-center gap-2 rounded-lg bg-cyan-500/10 px-4 py-2 text-sm font-bold tracking-wide text-cyan-400 transition-all hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)] disabled:opacity-50"
                >
                  {loadingId === row.id ? (
                    <span className="animate-pulse">LOADING...</span>
                  ) : (
                    <>
                      <Info className="h-4 w-4" />
                      INTEL
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
