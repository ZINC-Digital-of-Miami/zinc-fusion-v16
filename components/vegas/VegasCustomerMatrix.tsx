"use client";

import { Users } from "lucide-react";
import type { VegasCustomerMatrixBucket } from "@/lib/contracts/api";

export function VegasCustomerMatrix({ matrix }: { matrix: VegasCustomerMatrixBucket[] }) {
  if (!matrix || matrix.length === 0) return null;

  const maxAccounts = Math.max(...matrix.map(b => b.accounts.length), 1);

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
          <Users className="h-4 w-4" />
          Customer Relationship Matrix
        </div>
      </div>

      <div className="grid gap-4">
        {matrix.map((bucket, idx) => {
          const width = `${Math.max(5, (bucket.accounts.length / maxAccounts) * 100)}%`;
          const isLead = bucket.bucket.includes("Leads");
          const isVuln = bucket.bucket.includes("Vulnerable");
          const color = isLead ? "bg-violet-500" : isVuln ? "bg-red-500" : "bg-teal-500";
          const glow = isLead ? "shadow-[0_0_10px_rgba(139,92,246,0.5)]" : isVuln ? "shadow-[0_0_10px_rgba(239,68,68,0.5)]" : "";

          return (
            <div key={idx} className="flex items-center justify-between rounded-[12px] border border-white/5 bg-[#0a0a0a] p-4">
              <div className="w-1/3 pr-4">
                <div className="font-semibold text-white">{bucket.bucket}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{bucket.suggestedAction}</div>
              </div>
              
              <div className="flex flex-1 items-center gap-4">
                <div className="h-2 w-full rounded-full bg-white/10">
                  <div 
                    className={`h-full rounded-full ${color} ${glow}`}
                    style={{ width }}
                  />
                </div>
                <div className="w-12 text-right font-bold text-white">
                  {bucket.accounts.length}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
