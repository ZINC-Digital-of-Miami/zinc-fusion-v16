"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";

import { BackendShell } from "@/components/backend-shell";
import type { AiCardContent } from "@/lib/contracts/ai-card";
import type {
  ApiEnvelope,
  VegasEventRow,
  VegasIntelSnapshot,
  VegasIntelStats,
  VegasOpportunityRow,
} from "@/lib/contracts/api";

type VegasCards = {
  upcomingEvents: AiCardContent;
  aiSalesStrategy: AiCardContent;
  restaurantAccounts: AiCardContent;
  fryerTracking: AiCardContent;
};

type VegasSegment = "all" | "customers" | "prospects" | "events";

type VegasIntelResponse = ApiEnvelope<VegasIntelSnapshot | null> & {
  cards?: VegasCards;
  stats?: VegasIntelStats;
  events?: VegasEventRow[];
  opportunities?: VegasOpportunityRow[];
};

type VegasIntelDraft = {
  status: string;
  pitchAngle: string | null;
  salesScript: string | null;
  nextAction: string | null;
  evidenceBullets?: string[];
  eventName?: string | null;
  eventCategory?: string | null;
  daysUntil?: number | null;
  cuisineType?: string | null;
  cuisineAffinityScore?: number | null;
  cuisineAffinityReason?: string | null;
};

type VegasIntelDraftResponse = {
  ok: boolean;
  error?: string;
  draft?: VegasIntelDraft;
};

const SEGMENTS: Array<{
  id: VegasSegment;
  label: string;
  accent: string;
}> = [
  { id: "all", label: "All Accounts", accent: "#3b82f6" },
  { id: "customers", label: "Customers", accent: "#2dd4bf" },
  { id: "prospects", label: "Prospects", accent: "#ef4444" },
  { id: "events", label: "Upcoming Events", accent: "#a855f7" },
];

function formatDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAttendance(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "missing";
  return Number.isFinite(value) ? value.toLocaleString() : "missing";
}

function urgencyColor(daysUntil: number): string {
  if (daysUntil <= 7) return "#ef4444";
  if (daysUntil <= 21) return "#f59e0b";
  return "#22c55e";
}

export default function VegasIntelPage() {
  const [snapshot, setSnapshot] = useState<VegasIntelSnapshot | null>(null);
  const [stats, setStats] = useState<VegasIntelStats | null>(null);
  const [cards, setCards] = useState<VegasCards | null>(null);
  const [events, setEvents] = useState<VegasEventRow[]>([]);
  const [opportunities, setOpportunities] = useState<VegasOpportunityRow[]>([]);
  const [segment, setSegment] = useState<VegasSegment>("all");
  const [loading, setLoading] = useState(true);
  const [intelLoadingId, setIntelLoadingId] = useState<number | null>(null);
  const [intelDraftByRow, setIntelDraftByRow] = useState<Record<number, VegasIntelDraft>>({});
  const [intelErrorByRow, setIntelErrorByRow] = useState<Record<number, string>>({});

  useEffect(() => {
    fetch("/api/vegas/intel", { cache: "no-store" })
      .then((r) => r.json() as Promise<VegasIntelResponse>)
      .then((res) => {
        if (res.ok && res.data) setSnapshot(res.data);
        setStats(res.stats ?? null);
        setCards(res.cards ?? null);
        const orderedEvents = [...(res.events ?? [])].sort((a, b) => a.daysUntil - b.daysUntil);
        setEvents(orderedEvents.slice(0, 8));
        setOpportunities(res.opportunities ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const requestIntelDraft = async (row: VegasOpportunityRow) => {
    setIntelLoadingId(row.id);
    setIntelErrorByRow((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    try {
      const params = new URLSearchParams({ restaurantId: String(row.id) });
      if (row.eventId !== null) params.set("eventId", String(row.eventId));
      const response = await fetch(`/api/vegas/intel/draft?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as VegasIntelDraftResponse;
      if (!response.ok || !payload.ok || !payload.draft) {
        throw new Error(payload.error ?? "Draft intel generation failed.");
      }
      setIntelDraftByRow((current) => ({ ...current, [row.id]: payload.draft! }));
    } catch (error) {
      setIntelErrorByRow((current) => ({
        ...current,
        [row.id]: error instanceof Error ? error.message : "Draft intel generation failed.",
      }));
    } finally {
      setIntelLoadingId(null);
    }
  };

  const customers = useMemo(
    () => opportunities.filter((row) => row.customerStatus === "customer"),
    [opportunities],
  );
  const prospects = useMemo(
    () => opportunities.filter((row) => row.customerStatus === "prospect"),
    [opportunities],
  );

  const displayedOpportunities = useMemo(() => {
    if (segment === "customers") return customers.slice(0, 15);
    if (segment === "prospects") return prospects.slice(0, 15);
    if (segment === "events") return opportunities.slice(0, 15);
    return opportunities.slice(0, 15);
  }, [customers, opportunities, prospects, segment]);

  const totalFryers = useMemo(
    () =>
      opportunities.reduce((sum, row) => {
        if (row.fryerCount === null) return sum;
        return sum + row.fryerCount;
      }, 0),
    [opportunities],
  );
  const totalCapacity = useMemo(
    () =>
      opportunities.reduce((sum, row) => {
        if (row.totalCapacityLbs === null) return sum;
        return sum + row.totalCapacityLbs;
      }, 0),
    [opportunities],
  );
  const customerFryers = useMemo(
    () =>
      customers.reduce((sum, row) => {
        if (row.fryerCount === null) return sum;
        return sum + row.fryerCount;
      }, 0),
    [customers],
  );
  const customerCapacity = useMemo(
    () =>
      customers.reduce((sum, row) => {
        if (row.totalCapacityLbs === null) return sum;
        return sum + row.totalCapacityLbs;
      }, 0),
    [customers],
  );
  const prospectFryers = useMemo(
    () =>
      prospects.reduce((sum, row) => {
        if (row.fryerCount === null) return sum;
        return sum + row.fryerCount;
      }, 0),
    [prospects],
  );
  const prospectCapacity = useMemo(
    () =>
      prospects.reduce((sum, row) => {
        if (row.totalCapacityLbs === null) return sum;
        return sum + row.totalCapacityLbs;
      }, 0),
    [prospects],
  );
  const segmentValues: Record<VegasSegment, number> = {
    all: opportunities.length || snapshot?.highPriorityAccounts || 0,
    customers: customers.length,
    prospects: prospects.length,
    events: events.length || snapshot?.activeEvents || 0,
  };
  const eventAttendanceTotal = useMemo(
    () => events.reduce((sum, row) => sum + row.attendance, 0),
    [events],
  );
  const eventNext7Days = useMemo(
    () => events.filter((row) => row.daysUntil <= 7).length,
    [events],
  );
  const segmentStats: Record<VegasSegment, Array<{ value: string | number; label: string }>> = {
    all: [
      { value: totalFryers, label: "Fryers" },
      { value: Math.round(totalCapacity).toLocaleString(), label: "Capacity" },
    ],
    customers: [
      { value: customerFryers, label: "Fryers" },
      { value: Math.round(customerCapacity).toLocaleString(), label: "Capacity" },
    ],
    prospects: [
      { value: prospectFryers, label: "Fryers" },
      { value: Math.round(prospectCapacity).toLocaleString(), label: "Capacity" },
    ],
    events: [
      { value: formatAttendance(eventAttendanceTotal), label: "Attendance" },
      { value: eventNext7Days, label: "Next 7 Days" },
    ],
  };

  const opportunityHeading =
    segment === "customers"
      ? `Customers (${displayedOpportunities.length})`
      : segment === "prospects"
        ? `Prospects (${displayedOpportunities.length})`
        : `All Accounts (${displayedOpportunities.length})`;

  return (
    <BackendShell>
      <div className="w-full min-h-screen bg-[#0a0a0a] text-slate-200 px-3 md:px-6 pb-20">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Building2 className="w-8 h-8" />
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">Vegas Intel</h1>
            </div>
            <p className="text-slate-400 text-sm font-mono">
              Sales strategy, event intelligence, and account recommendations for Las Vegas restaurant operations
            </p>
          </div>
        </header>

        <section className="mb-12">
          <div
            className="vegas-segment-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "12px",
              marginBottom: "48px",
            }}
          >
            {SEGMENTS.map((item) => {
              const active = segment === item.id;
              const mainValue = segmentValues[item.id];
              const valueColor = active ? item.accent : "rgba(255,255,255,0.9)";
              const labelColor = active ? item.accent : "rgba(255,255,255,0.5)";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSegment(item.id)}
                  className="text-left min-h-[140px] px-4 py-5 flex flex-col justify-between rounded-none"
                  style={{
                    background: active ? `${item.accent}15` : "rgba(255,255,255,0.02)",
                    border: active
                      ? `2px solid ${item.accent}`
                      : "1px solid rgba(255,255,255,0.08)",
                    borderLeft: `4px solid ${item.accent}`,
                    transition: "all 0.2s ease",
                  }}
                >
                  <div>
                    <div
                      className="text-[36px] font-bold leading-none mb-1.5"
                      style={{ color: valueColor }}
                    >
                      {mainValue}
                    </div>
                    <div
                      className="text-[11px] uppercase tracking-[0.5px] font-semibold"
                      style={{ color: labelColor }}
                    >
                      {item.label}
                    </div>
                  </div>
                  <div
                    className="flex gap-4 mt-4 pt-3"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    {segmentStats[item.id].map((stat) => (
                      <div key={stat.label}>
                        <div className="text-sm font-semibold text-white/80">{stat.value}</div>
                        <div className="text-[9px] uppercase tracking-[0.5px] text-white/40">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-[1px] opacity-60 mb-4">
            Upcoming Events ({events.length})
          </h2>
          <div className="flex flex-col gap-0.5">
            {loading ? (
              <LoadingRow message="Loading..." />
            ) : events.length === 0 ? (
              <div
                className="p-10 text-center opacity-50"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {cards?.upcomingEvents?.body ?? "Hard stop: upcoming-event card has no verified data."}
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="vegas-event-row"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "20px 24px",
                    display: "flex",
                    alignItems: "center",
                    gap: "24px",
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-white/95 mb-1.5">{event.name}</div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[13px] text-white/50">{event.venue ?? "Venue unavailable"}</span>
                      <span
                        className="text-[10px] font-semibold uppercase px-2 py-0.5"
                        style={{
                          background: `${event.color}20`,
                          color: event.color,
                          borderRadius: "2px",
                        }}
                      >
                        {event.category}
                      </span>
                    </div>
                    <div className="text-xs text-white/40">{formatDate(event.startDate)}</div>
                  </div>

                  <div
                    className="vegas-event-stats"
                    style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}
                  >
                    <div className="text-right">
                      <div className="text-xl font-bold text-white/90">{formatAttendance(event.attendance)}</div>
                      <div className="text-[10px] uppercase text-white/40">Attendance</div>
                    </div>

                    <div
                      className="w-[52px] h-[52px] rounded-full border-[3px] flex flex-col items-center justify-center"
                      style={{ borderColor: urgencyColor(event.daysUntil) }}
                    >
                      <div className="text-base font-bold text-white/90 leading-none">{event.daysUntil}</div>
                      <div className="text-[8px] uppercase text-white/50">Days</div>
                    </div>

                    <div
                      className="w-[52px] h-[52px] rounded-full border-[3px] flex flex-col items-center justify-center"
                      style={{ borderColor: "#06b6d4" }}
                    >
                      <div className="text-base font-bold text-white/90 leading-none">
                        {event.durationDays}
                      </div>
                      <div className="text-[8px] uppercase text-white/50">Days</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-xs font-semibold uppercase tracking-[1px] opacity-60 mb-4">
            {opportunityHeading}
          </h2>
          <div className="flex flex-col gap-2">
            {loading ? (
              <LoadingRow message="Loading..." />
            ) : displayedOpportunities.length === 0 ? (
              <div
                className="p-10 text-center opacity-50"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {cards?.restaurantAccounts?.body ??
                  "Hard stop: restaurant-accounts card has no verified account-score data."}
              </div>
            ) : (
              displayedOpportunities.map((row) => {
                const accent = row.customerStatus === "customer" ? "#2dd4bf" : "#b91c1c";
                const fryerLabel = row.fryerCount === null ? "Missing fryer telemetry" : String(row.fryerCount);
                const capacityLabel =
                  row.totalCapacityLbs !== null
                    ? `${Math.round(row.totalCapacityLbs).toLocaleString()} lbs`
                    : "Missing capacity telemetry";
                const scheduleLabel =
                  row.serviceFrequency ??
                  (row.shiftCount !== null || row.scheduledReportCount !== null
                    ? `Shifts ${row.shiftCount ?? 0} | Reports ${row.scheduledReportCount ?? 0}`
                    : "No schedule");
                const fallbackEvent = events[0];
                const eventLabel =
                  row.eventName && row.eventDate
                    ? `${row.eventName} (${formatDate(row.eventDate)})`
                    : fallbackEvent && fallbackEvent.startDate
                      ? `${fallbackEvent.name} (${formatDate(fallbackEvent.startDate)})`
                      : "No linked event window";
                const intelDraft = intelDraftByRow[row.id];
                const intelError = intelErrorByRow[row.id];
                const isLoadingIntel = intelLoadingId === row.id;
                return (
                  <div
                    key={row.id}
                    className="vegas-opp-row"
                    style={{
                      display: "flex",
                      alignItems: "stretch",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    <div className="w-1 shrink-0" style={{ background: accent }} />
                    <div
                      className="flex-1"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          padding: "16px 24px",
                          width: "100%",
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <div className="text-[15px] font-semibold text-white">
                              {(row.casino ?? "Casino unavailable") + " - " + row.name}
                            </div>
                            {row.customerStatus === "prospect" ? (
                              <span
                                className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.5px]"
                                style={{
                                  background: "rgba(185, 28, 28, 0.2)",
                                  color: "#f87171",
                                  borderRadius: "2px",
                                }}
                              >
                                Prospect
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-white/50">
                            {`${fryerLabel} fryers (${capacityLabel}) | ${scheduleLabel}`}
                          </div>
                          <div className="text-xs text-white/35 mt-1">
                            {(row.oilType ?? "Oil type missing") +
                              " | " +
                              (row.contactPerson ?? "Contact missing") +
                              " | " +
                              eventLabel}
                          </div>
                      </div>

                        <button
                          type="button"
                          onClick={() => void requestIntelDraft(row)}
                          disabled={isLoadingIntel}
                          className="px-4 py-2 text-xs font-semibold bg-transparent border border-white/20 text-white/80 shrink-0 disabled:opacity-50"
                          style={{ borderRadius: "2px" }}
                        >
                          {isLoadingIntel ? "Loading..." : "Intel"}
                        </button>
                      </div>
                      {intelError ? (
                        <div
                          className="text-xs text-red-300"
                          style={{
                            width: "100%",
                            padding: "12px 24px",
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(127, 29, 29, 0.20)",
                          }}
                        >
                          {intelError}
                        </div>
                      ) : null}
                      {intelDraft ? (
                        <div
                          className="text-xs text-white/80"
                          style={{
                            width: "100%",
                            padding: "12px 24px",
                            borderTop: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div className="font-semibold text-white/90 mb-1">
                            {intelDraft.pitchAngle ?? "Draft Intel"}
                          </div>
                          <div className="text-white/55 mb-2">
                            {intelDraft.eventName ?? "No linked event"}
                            {intelDraft.daysUntil !== undefined && intelDraft.daysUntil !== null
                              ? ` | ${intelDraft.daysUntil} days out`
                              : ""}
                            {intelDraft.cuisineType ? ` | Cuisine: ${intelDraft.cuisineType}` : ""}
                            {intelDraft.cuisineAffinityScore !== undefined && intelDraft.cuisineAffinityScore !== null
                              ? ` | Affinity: ${intelDraft.cuisineAffinityScore}/100`
                              : ""}
                          </div>
                          <div className="text-white/75">{intelDraft.salesScript ?? "Draft unavailable."}</div>
                          <div className="text-white/50 mt-1">{intelDraft.nextAction}</div>
                          {intelDraft.evidenceBullets && intelDraft.evidenceBullets.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-white/60 list-disc pl-4">
                              {intelDraft.evidenceBullets.map((bullet) => (
                                <li key={bullet}>{bullet}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {stats?.lastSync ? (
          <div className="space-y-1">
            <div className="text-xs text-slate-500 font-mono">Last sync: {formatDate(stats.lastSync)}</div>
            <div className="text-xs text-slate-500 font-mono">
              Glide groups - export list: {formatCount(stats.exportList)}, shifts: {formatCount(stats.shifts)},
              scheduled reports: {formatCount(stats.scheduledReports)}
            </div>
          </div>
        ) : null}
      </div>
    </BackendShell>
  );
}

function LoadingRow({ message }: { message: string }) {
  return (
    <div
      className="p-10 text-center opacity-50"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {message}
    </div>
  );
}
