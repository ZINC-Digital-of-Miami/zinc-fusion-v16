"use client";

import { Sparkles, Mail, Phone, Map } from "lucide-react";
import type { VegasOpportunityRow } from "@/lib/contracts/api";

type VegasIntelDraft = {
  status: string;
  executiveBrief?: string | null;
  pitchAngle: string | null;
  salesScript: string | null;
  emailDraft?: string | null;
  nextAction: string | null;
};

export function VegasOutreachPanel({
  opportunity,
  draft,
  error,
  onClose
}: {
  opportunity: VegasOpportunityRow;
  draft?: VegasIntelDraft;
  error?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-xl border-l border-white/10 bg-[#05070b] p-6 shadow-2xl transition-transform">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            <Sparkles className="mr-2 inline h-3 w-3" />
            AI Outreach Generator
          </div>
          <h2 className="text-2xl font-bold text-white">{opportunity.name}</h2>
          <div className="text-sm text-slate-400">{opportunity.casino ?? "Free-standing"}</div>
        </div>
        <button onClick={onClose} className="rounded-full bg-white/5 p-2 text-slate-400 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : !draft ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-500">
          No draft available.
        </div>
      ) : (
        <div className="space-y-6 overflow-y-auto pb-20">
          <div className="rounded-[16px] border border-cyan-500/20 bg-cyan-500/5 p-5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-cyan-400">Executive Brief</div>
            <p className="text-sm leading-relaxed text-slate-300">{draft.executiveBrief}</p>
          </div>

          <div className="rounded-[16px] border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-violet-400">
              <Phone className="h-3 w-3" /> Call Script
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{draft.salesScript}</p>
          </div>

          <div className="rounded-[16px] border border-white/10 bg-white/[0.02] p-5">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <Mail className="h-3 w-3" /> Email Draft
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{draft.emailDraft}</p>
          </div>

          <div className="rounded-[16px] border border-white/10 bg-[#0a0a0a] p-5">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">
              <Map className="h-3 w-3" /> Next Action
            </div>
            <p className="text-sm font-medium text-white">{draft.nextAction}</p>
          </div>
        </div>
      )}
    </div>
  );
}
