"use client";

import { CalendarDays } from "lucide-react";
import type { VegasEventRow } from "@/lib/contracts/api";

function formatShortDate(value: string | null): string {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function VegasEventSurge({ events }: { events: VegasEventRow[] }) {
  if (!events || events.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
          <CalendarDays className="h-4 w-4" />
          Upcoming Events Timeline
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
          Timeline
        </div>
      </div>

      <div className="relative pt-4 pb-2">
        {/* Horizontal Line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-white/10" />

        <div className="relative flex justify-between gap-4 overflow-x-auto pb-4">
          {events.map((evt) => {
            const urgency = evt.daysUntil <= 14 ? "High" : evt.daysUntil <= 30 ? "Medium" : "Normal";
            const urgencyColor = evt.daysUntil <= 14 ? "text-red-400 border-red-500/30" : "text-violet-400 border-violet-500/30";

            return (
              <div key={evt.id} className="relative flex min-w-[240px] flex-col justify-end">
                {/* Connector Dot */}
                <div 
                  className="absolute bottom-[-5px] left-4 h-3 w-3 rounded-full border-2 border-black"
                  style={{ backgroundColor: evt.color }}
                />
                
                <div className="mb-4 rounded-xl border border-white/5 bg-[#0a0a0a] p-4 shadow-xl transition-all hover:border-white/20">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="truncate font-semibold text-white" title={evt.name}>{evt.name}</h3>
                    <div className="rounded border bg-white/5 px-2 py-0.5 text-[10px] font-semibold" style={{ color: evt.color, borderColor: `${evt.color}40` }}>
                      {evt.category}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      Labels: <span className={`rounded-full border px-2 py-0.5 text-[10px] ${urgencyColor}`}>{urgency}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-400">{formatShortDate(evt.startDate)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
