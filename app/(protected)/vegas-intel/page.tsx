"use client";

import { useEffect, useState } from "react";
import { BackendShell } from "@/components/backend-shell";
import type { VegasIntelDashboardResponse } from "@/app/api/vegas/intel/route";
import type { VegasOpportunityRow } from "@/lib/contracts/api";

import { VegasDemandPulse } from "@/components/vegas/VegasDemandPulse";
import { VegasEventSurge } from "@/components/vegas/VegasEventSurge";
import { VegasAiCards } from "@/components/vegas/VegasAiCards";
import { VegasOpportunityGrid } from "@/components/vegas/VegasOpportunityGrid";
import { VegasCuisineSignals } from "@/components/vegas/VegasCuisineSignals";
import { VegasCustomerMatrix } from "@/components/vegas/VegasCustomerMatrix";
import { VegasOperationalAlerts } from "@/components/vegas/VegasOperationalAlerts";
import { VegasOutreachPanel } from "@/components/vegas/VegasOutreachPanel";
import type { VegasIntelDraft } from "@/components/vegas/VegasOutreachPanel";
import { VegasSourceHealthFooter } from "@/components/vegas/VegasSourceHealth";

export default function VegasIntelPage() {
  const [data, setData] = useState<VegasIntelDashboardResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [intelPanelOpen, setIntelPanelOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<VegasOpportunityRow | null>(null);
  const [intelDraft, setIntelDraft] = useState<VegasIntelDraft | undefined>(undefined);
  const [intelError, setIntelError] = useState<string | undefined>();
  const [intelLoadingId, setIntelLoadingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/vegas/intel", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json()) as VegasIntelDashboardResponse & {
          error?: string;
        };
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? `Vegas Intel load failed (${response.status}).`);
        }
        setData(payload.data);
        setLoadError(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Vegas Intel load failed.");
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  const handleIntelClick = async (row: VegasOpportunityRow) => {
    setSelectedRow(row);
    setIntelPanelOpen(true);
    setIntelLoadingId(row.id);
    setIntelError(undefined);
    setIntelDraft(undefined);

    try {
      const params = new URLSearchParams({ restaurantId: String(row.id) });
      if (row.eventId !== null) params.set("eventId", String(row.eventId));
      
      const response = await fetch(`/api/vegas/intel/draft?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      
      if (!response.ok || !payload.ok || !payload.draft) {
        throw new Error(payload.error ?? "Draft intel generation failed.");
      }
      
      setIntelDraft(payload.draft);
    } catch (error) {
      setIntelError(error instanceof Error ? error.message : "Draft intel generation failed.");
    } finally {
      setIntelLoadingId(null);
    }
  };

  if (loading) {
    return (
      <BackendShell>
        <div className="flex min-h-screen items-center justify-center bg-[#05070b] text-cyan-500">
          <div className="animate-pulse text-sm font-bold uppercase tracking-widest">Loading Command Center...</div>
        </div>
      </BackendShell>
    );
  }

  if (loadError) {
    return (
      <BackendShell>
        <div className="flex min-h-screen items-center justify-center bg-[#05070b] px-6 text-slate-200">
          <div className="w-full max-w-2xl rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-300">
              Vegas Intel Unavailable
            </div>
            <p className="mt-3 text-sm leading-6 text-red-100">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 rounded-lg border border-red-300/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-400/10"
            >
              Retry Load
            </button>
          </div>
        </div>
      </BackendShell>
    );
  }

  if (!data) {
    return (
      <BackendShell>
        <div className="flex min-h-screen items-center justify-center bg-[#05070b] px-6 text-slate-200">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
              Vegas Intel Waiting For Data
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              No live Vegas Intel payload is available yet. This page will render once the backend data flow is present.
            </p>
          </div>
        </div>
      </BackendShell>
    );
  }

  return (
    <BackendShell>
      <div className="relative min-h-screen w-full bg-[#05070b] px-4 pb-20 pt-8 text-slate-200 lg:px-8">
        <div className="mx-auto max-w-[1600px] space-y-6">
          
          {/* Row 1: Hero */}
          <VegasDemandPulse 
            score={data.demandPulse.score} 
            trend={data.demandPulse.trend} 
            metrics={data.demandPulse.metrics} 
          />

          {/* Row 2: Event Timeline */}
          <VegasEventSurge events={data.eventSurge} />

          {/* Row 2b: AI Sales Intelligence cards (Glide-driven snapshot) */}
          <VegasAiCards cards={data.cards} ai={data.ai} />

          <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
            <div className="space-y-6">
              {/* Row 3: Opportunity Grid */}
              <VegasOpportunityGrid 
                opportunities={data.opportunities} 
                onIntel={handleIntelClick} 
                loadingId={intelLoadingId} 
              />
            </div>
            
            <div className="space-y-6">
              {/* Row 4: Cuisine Signals */}
              <VegasCuisineSignals signals={data.cuisineSignals} />
              
              {/* Row 5: Customer Matrix */}
              <VegasCustomerMatrix matrix={data.customerMatrix} />
              
              {/* Row 6: Alerts */}
              <VegasOperationalAlerts alerts={data.alerts} />
            </div>
          </div>

          {/* Row 8: Source Health Footer */}
          <VegasSourceHealthFooter health={data.sourceHealth} />

        </div>
      </div>

      {/* Row 7: Outreach Panel (Overlay) */}
      {intelPanelOpen && selectedRow && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIntelPanelOpen(false)} />
          <VegasOutreachPanel 
            opportunity={selectedRow}
            draft={intelDraft}
            error={intelError}
            onClose={() => setIntelPanelOpen(false)}
          />
        </div>
      )}
    </BackendShell>
  );
}
