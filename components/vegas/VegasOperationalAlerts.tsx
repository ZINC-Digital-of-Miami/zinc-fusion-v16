"use client";

import { TriangleAlert } from "lucide-react";
import type { VegasAlert } from "@/lib/contracts/api";

export function VegasOperationalAlerts({ alerts }: { alerts: VegasAlert[] }) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="rounded-[20px] border border-red-500/20 bg-red-500/5 p-6">
      <div className="mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-red-400">
        <TriangleAlert className="h-4 w-4" />
        Operational Risk Alerts
      </div>

      <div className="grid gap-3">
        {alerts.map((alert, idx) => (
          <div key={idx} className="rounded-[12px] border border-red-500/20 bg-[#0a0a0a] p-4">
            <h4 className="mb-1 font-semibold text-white">{alert.message}</h4>
            <div className="text-sm text-slate-400">Action Required: <span className="text-red-300">{alert.recommendedAction}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
