"use client";

import { Activity } from "lucide-react";

export function VegasDemandPulse({
  score,
  trend,
  metrics,
}: {
  score: number;
  trend: "up" | "down" | "flat";
  metrics: { label: string; value: string; hint: string }[];
}) {
  const isHigh = score > 60;
  const isMed = score > 30;
  const color = isHigh ? "text-cyan-400" : isMed ? "text-violet-400" : "text-slate-400";
  const glow = isHigh ? "shadow-[0_0_30px_rgba(34,211,238,0.2)]" : "";
  const trendLabel = trend === "up" ? "Rising" : trend === "down" ? "Softening" : "Stable";

  return (
    <div className="flex flex-col justify-between rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.01)_100%)] p-8 xl:flex-row xl:items-center">
      <div className="mb-8 max-w-md xl:mb-0">
        <div className="mb-4 flex items-center gap-3 text-cyan-400">
          <Activity className="h-6 w-6" />
          <span className="text-[11px] font-bold uppercase tracking-[0.3em]">
            Vegas Demand Pulse
          </span>
          <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300">
            {trendLabel}
          </span>
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Sales Engine
        </h1>
        <p className="text-sm leading-6 text-slate-400">
          A premium, ultra-modern command center. Aligning high-volume account coverage with event-driven demand spikes across the Las Vegas valley.
        </p>
      </div>

      <div className="flex items-center gap-12">
        <div className={`relative flex h-48 w-48 shrink-0 flex-col items-center justify-center rounded-full border-[4px] border-white/10 bg-black/40 ${glow}`}>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: isHigh
                ? "conic-gradient(from 180deg, transparent 0%, rgba(34,211,238,0.4) 100%)"
                : "none",
              border: isHigh ? "2px solid rgba(34,211,238,0.6)" : "none",
              clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)",
            }}
          />
          <div className={`text-6xl font-bold tracking-tighter ${color}`}>{score}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {isHigh ? "High Demand" : isMed ? "Stable Volume" : "Low Pressure"}
          </div>
        </div>

        <div className="grid gap-6">
          {metrics.map((m, i) => (
            <div key={i}>
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                {m.label}
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-2xl font-bold text-white">{m.value}</div>
                <div className="text-xs font-medium text-cyan-400">{m.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
