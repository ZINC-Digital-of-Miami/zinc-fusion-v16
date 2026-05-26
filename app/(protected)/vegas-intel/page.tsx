"use client";

import { useEffect, useState } from "react";
import { BackendShell } from "@/components/backend-shell";
import type { VegasIntelDashboardResponse } from "@/app/api/vegas/intel/route";
import type { VegasOpportunityRow } from "@/lib/contracts/api";

import { VegasDemandPulse } from "@/components/vegas/VegasDemandPulse";
import { VegasEventSurge } from "@/components/vegas/VegasEventSurge";
import { VegasOpportunityGrid } from "@/components/vegas/VegasOpportunityGrid";
import { VegasCuisineSignals } from "@/components/vegas/VegasCuisineSignals";
import { VegasCustomerMatrix } from "@/components/vegas/VegasCustomerMatrix";
import { VegasOperationalAlerts } from "@/components/vegas/VegasOperationalAlerts";
import { VegasOutreachPanel } from "@/components/vegas/VegasOutreachPanel";
import { VegasSourceHealthFooter } from "@/components/vegas/VegasSourceHealth";

export default function VegasIntelPage() {
  const [data, setData] = useState<VegasIntelDashboardResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [intelPanelOpen, setIntelPanelOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<VegasOpportunityRow | null>(null);
  const [intelDraft, setIntelDraft] = useState<any>(null);
  const [intelError, setIntelError] = useState<string | undefined>();
  const [intelLoadingId, setIntelLoadingId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/vegas/intel", { cache: "no-store" })
      .then((r) => r.json() as Promise<VegasIntelDashboardResponse>)
      .then((res) => {
        if (res.ok && res.data) {
          setData(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleIntelClick = async (row: VegasOpportunityRow) => {
    setSelectedRow(row);
    setIntelPanelOpen(true);
    setIntelLoadingId(row.id);
    setIntelError(undefined);
    setIntelDraft(null);

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

  if (loading || !data) {
    return (
      <BackendShell>
        <div className="flex min-h-screen items-center justify-center bg-[#05070b] text-cyan-500">
          <div className="animate-pulse text-sm font-bold uppercase tracking-widest">Loading Command Center...</div>
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
