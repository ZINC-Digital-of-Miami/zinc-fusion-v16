"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import type { VegasSourceHealth } from "@/lib/contracts/api";

function formatTime(iso: string | null) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function VegasSourceHealthFooter({ health }: { health: VegasSourceHealth[] }) {
  if (!health || health.length === 0) return null;

  return (
    <div className="mt-8 flex flex-wrap gap-4 border-t border-white/10 pt-6">
      {health.map((h, i) => (
        <div key={i} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-400">
          {h.severity === "ok" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
          )}
          <span>{h.source}</span>
          <span className="text-white/20">•</span>
          <span>{formatTime(h.lastUpdated)}</span>
        </div>
      ))}
    </div>
  );
}
