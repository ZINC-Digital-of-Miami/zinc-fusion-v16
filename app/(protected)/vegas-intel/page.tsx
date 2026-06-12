"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  Clock3,
  Flame,
  MapPin,
  PhoneCall,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { BackendShell } from "@/components/backend-shell";
import type { AiCardContent } from "@/lib/contracts/ai-card";
import type {
  ApiEnvelope,
  VegasEventRow,
  VegasGlideTableCounts,
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
  glideTables?: VegasGlideTableCounts;
};

type VegasIntelDraft = {
  status: string;
  aiGenerated?: boolean;
  provider?: string | null;
  model?: string | null;
  executiveBrief?: string | null;
  pitchAngle: string | null;
  salesScript: string | null;
  emailDraft?: string | null;
  callPlan?: string[];
  objectionHandling?: string[];
  riskFlags?: string[];
  evidenceSummary?: string[];
  nextAction: string | null;
  aiWarning?: string | null;
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

const SEGMENTS: Array<{ id: VegasSegment; label: string; accent: string }> = [
  { id: "all", label: "Sales Universe", accent: "#3b82f6" },
  { id: "prospects", label: "Lead Opportunities", accent: "#ef4444" },
  { id: "customers", label: "Customer Coverage", accent: "#2dd4bf" },
  { id: "events", label: "Event Windows", accent: "#a855f7" },
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

function formatShortDate(value: string | null): string {
  if (!value) return "n/a";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatAttendance(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString() : "0";
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : "n/a";
}

function formatScore(value: number | null): string {
  if (value === null) return "n/a";
  return value.toFixed(1);
}

function urgencyColor(daysUntil: number): string {
  if (daysUntil <= 7) return "#ef4444";
  if (daysUntil <= 21) return "#f59e0b";
  return "#22c55e";
}

function cardTone(status: "customer" | "prospect"): {
  accent: string;
  badgeBg: string;
  badgeText: string;
} {
  if (status === "prospect") {
    return {
      accent: "#ef4444",
      badgeBg: "rgba(239, 68, 68, 0.18)",
      badgeText: "#fca5a5",
    };
  }
  return {
    accent: "#2dd4bf",
    badgeBg: "rgba(45, 212, 191, 0.16)",
    badgeText: "#99f6e4",
  };
}

function sourceLabel(row: VegasOpportunityRow): string {
  const source = row.metadata?.source;
  return typeof source === "string" && source.trim() ? source : "unknown-source";
}

function missingFields(row: VegasOpportunityRow): string[] {
  const gaps: string[] = [];
  if (!row.contactPerson) gaps.push("contact");
  if (!row.oilType) gaps.push("oil");
  if (row.fryerCount === null) gaps.push("fryers");
  if (row.totalCapacityLbs === null) gaps.push("capacity");
  if (!row.eventDate) gaps.push("event link");
  return gaps;
}

function opportunitySummary(row: VegasOpportunityRow): string {
  if (row.customerStatus === "prospect") {
    return row.eventName
      ? `${row.name} is unserviced, linked to ${row.eventName}, and belongs in Kevin's active lead queue.`
      : `${row.name} is unserviced and stays in the lead queue until event linkage is real.`;
  }
  return row.eventName
    ? `${row.name} is an active customer aligned to ${row.eventName}; keep this in coverage mode, not spray-and-pray mode.`
    : `${row.name} is an active customer with no verified event linkage in this payload.`;
}

export default function VegasIntelPage() {
  const [snapshot, setSnapshot] = useState<VegasIntelSnapshot | null>(null);
  const [stats, setStats] = useState<VegasIntelStats | null>(null);
  const [cards, setCards] = useState<VegasCards | null>(null);
  const [events, setEvents] = useState<VegasEventRow[]>([]);
  const [opportunities, setOpportunities] = useState<VegasOpportunityRow[]>([]);
  const [glideTables, setGlideTables] = useState<VegasGlideTableCounts | null>(null);
  const [segment, setSegment] = useState<VegasSegment>("prospects");
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
        setGlideTables(res.glideTables ?? null);
        setEvents([...(res.events ?? [])].sort((a, b) => a.daysUntil - b.daysUntil).slice(0, 8));
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
  const eventLinked = useMemo(
    () => opportunities.filter((row) => row.eventDate !== null),
    [opportunities],
  );
  const highPriorityLeads = useMemo(
    () => prospects.filter((row) => row.opportunityScore !== null && row.opportunityScore >= 65),
    [prospects],
  );
  const serviceGaps = useMemo(
    () =>
      opportunities
        .map((row) => ({ row, gaps: missingFields(row) }))
        .filter((entry) => entry.gaps.length > 0)
        .sort((a, b) => b.gaps.length - a.gaps.length)
        .slice(0, 6),
    [opportunities],
  );

  const displayedOpportunities = useMemo(() => {
    if (segment === "customers") return customers.slice(0, 12);
    if (segment === "prospects") return prospects.slice(0, 12);
    if (segment === "events") return eventLinked.slice(0, 12);
    return opportunities.slice(0, 12);
  }, [customers, eventLinked, opportunities, prospects, segment]);

  const segmentValues: Record<VegasSegment, number> = {
    all: opportunities.length,
    prospects: prospects.length,
    customers: customers.length,
    events: events.length || snapshot?.activeEvents || 0,
  };

  const leadScoreAverage = useMemo(() => {
    const values = prospects
      .map((row) => row.opportunityScore)
      .filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [prospects]);

  const eventAttendanceTotal = useMemo(
    () => events.reduce((sum, row) => sum + row.attendance, 0),
    [events],
  );

  const telemetryCoverage = useMemo(() => {
    const populated = opportunities.filter(
      (row) => row.fryerCount !== null && row.totalCapacityLbs !== null,
    );
    return {
      populated: populated.length,
      total: opportunities.length,
    };
  }, [opportunities]);

  const estimatedOilTotal = useMemo(
    () =>
      opportunities.reduce((sum, row) => sum + (row.estimatedOilLbsPerWeek ?? 0), 0),
    [opportunities],
  );

  const leadDataSourceSummary = useMemo(() => {
    const glideCustomers = customers.filter((row) => sourceLabel(row) === "glide").length;
    const eventReadyCustomers = customers.filter((row) => row.eventDate !== null).length;
    return { glideCustomers, eventReadyCustomers };
  }, [customers]);

  const shiftLinkedAccounts = useMemo(
    () =>
      opportunities
        .filter((row) => (row.shiftCount ?? 0) > 0)
        .sort((a, b) => (b.shiftCount ?? 0) - (a.shiftCount ?? 0))
        .slice(0, 8),
    [opportunities],
  );

  const shiftAssignmentTotal = useMemo(
    () => opportunities.reduce((sum, row) => sum + (row.shiftCount ?? 0), 0),
    [opportunities],
  );

  const scheduledReportAccountTotal = useMemo(
    () => opportunities.reduce((sum, row) => sum + (row.scheduledReportCount ?? 0), 0),
    [opportunities],
  );

  const opportunityHeading =
    segment === "prospects"
      ? `Lead Opportunities (${displayedOpportunities.length})`
      : segment === "customers"
        ? `Customer Coverage (${displayedOpportunities.length})`
        : segment === "events"
          ? `Event-Linked Accounts (${displayedOpportunities.length})`
          : `Sales Universe (${displayedOpportunities.length})`;

  return (
    <BackendShell>
      <div className="min-h-screen w-full bg-[#05070b] px-3 pb-20 text-slate-200 md:px-6">
        <div className="mx-auto flex w-full max-w-none flex-col gap-8 py-6">
          <header className="rounded-[20px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.18),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6 md:p-8">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <div className="mb-3 flex items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <Building2 className="h-7 w-7 text-cyan-300" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">
                      Vegas Sales Workspace
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
                      Vegas Intel
                    </h1>
                  </div>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
                  Event-driven customer coverage, service timing, and fryer-readiness for Kevin&apos;s live Las Vegas account book.
                  Net-new lead discovery remains intentionally blank until a verified non-customer restaurant universe is landed.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[480px]">
                <HeroMetric
                  label="Active events"
                  value={snapshot?.activeEvents ?? events.length}
                  tone="violet"
                  detail={`${events.filter((event) => event.daysUntil <= 14).length} inside 14 days`}
                />
                <HeroMetric
                  label="Lead opportunities"
                  value={prospects.length}
                  tone="red"
                  detail={`${highPriorityLeads.length} score >= 65`}
                />
                <HeroMetric
                  label="Customer accounts"
                  value={customers.length}
                  tone="teal"
                  detail={`telemetry ${telemetryCoverage.populated}/${telemetryCoverage.total}`}
                />
              </div>
            </div>
          </header>

          <section className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              <Building2 className="h-4 w-4" />
              Glide Table Coverage
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
              <GlideTableCard label="restaurants" value={glideTables?.restaurants} />
              <GlideTableCard label="casinos" value={glideTables?.casinos} />
              <GlideTableCard label="fryers" value={glideTables?.fryers} />
              <GlideTableCard label="export_list" value={glideTables?.exportList} />
              <GlideTableCard label="scheduled_reports" value={glideTables?.scheduledReports} />
              <GlideTableCard label="shifts" value={glideTables?.shifts} />
              <GlideTableCard label="shift_casinos" value={glideTables?.shiftCasinos} />
              <GlideTableCard label="shift_restaurants" value={glideTables?.shiftRestaurants} />
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {SEGMENTS.map((item) => {
              const active = segment === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSegment(item.id)}
                  className="rounded-[18px] border p-5 text-left transition hover:-translate-y-0.5"
                  style={{
                    borderColor: active ? item.accent : "rgba(255,255,255,0.10)",
                    background: active ? `${item.accent}14` : "rgba(255,255,255,0.03)",
                    boxShadow: active ? `inset 0 0 0 1px ${item.accent}40` : "none",
                  }}
                >
                  <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                    {item.label}
                  </div>
                  <div className="mb-2 text-4xl font-semibold text-white">{segmentValues[item.id]}</div>
                  <div className="text-sm text-slate-300">
                    {item.id === "prospects"
                      ? `${highPriorityLeads.length} qualified by score in the current real-data lane.`
                      : item.id === "customers"
                        ? `${leadDataSourceSummary.glideCustomers} Glide service accounts in current response.`
                        : item.id === "events"
                          ? `${events.filter((event) => event.daysUntil <= 14).length} events inside 14 days.`
                          : `${eventLinked.length} event-linked rows across the current sales universe.`}
                  </div>
                </button>
              );
            })}
          </section>

          <section className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-300/80">
                  <Clock3 className="h-4 w-4" />
                  Shift Service Coverage
                </div>
                <h2 className="text-2xl font-semibold text-white">Real Glide shift links now visible</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  The shift lane is sourced from the Glide operational tables plus restaurant-level shift metadata; missing rows stay explicit instead of being filled.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
                <MiniStat label="Shift rows" value={formatCompactNumber(stats?.shifts ?? glideTables?.shifts)} />
                <MiniStat
                  label="Restaurant links"
                  value={formatCompactNumber(stats?.shiftRestaurants ?? glideTables?.shiftRestaurants ?? shiftAssignmentTotal)}
                />
                <MiniStat label="Scheduled reports" value={formatCompactNumber(stats?.scheduledReports ?? scheduledReportAccountTotal)} />
              </div>
            </div>

            {shiftLinkedAccounts.length === 0 ? (
              <LoadingCard message="No shift-linked account rows are visible in the current Glide response." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {shiftLinkedAccounts.map((row) => (
                  <article key={row.id} className="rounded-[16px] border border-white/10 bg-[#0b0f16] p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-white">{row.name}</h3>
                        <div className="mt-1 text-xs text-slate-400">{row.casino ?? "Casino unavailable"}</div>
                      </div>
                      <div className="rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-200">
                        {row.shiftCount} shifts
                      </div>
                    </div>
                    <div className="space-y-2 text-xs leading-5 text-slate-300">
                      <div>{row.serviceFrequency ?? "No service cadence listed"}</div>
                      <div>Reports: {row.scheduledReportCount ?? "n/a"} · Export list: {row.exportListed === null ? "n/a" : row.exportListed ? "yes" : "no"}</div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-red-300/80">
                <Flame className="h-4 w-4" />
                Lead View
              </div>
              <div className="mb-4 text-3xl font-semibold text-white">
                {highPriorityLeads.length > 0 ? `${highPriorityLeads.length} verified leads ready for outreach` : "Net-new lead lane intentionally blank"}
              </div>
              <p className="text-sm leading-6 text-slate-300">
                {cards?.aiSalesStrategy?.body ??
                  "Hard stop: AI sales strategy card is unavailable."}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <MiniStat
                  label="Avg lead score"
                  value={leadScoreAverage === null ? "n/a" : leadScoreAverage.toFixed(1)}
                />
                <MiniStat
                  label="Glide service accounts"
                  value={leadDataSourceSummary.glideCustomers}
                />
                <MiniStat
                  label="Event-linked accounts"
                  value={leadDataSourceSummary.eventReadyCustomers}
                />
              </div>
            </div>

            <InfoPanel
              icon={<CalendarDays className="h-4 w-4 text-violet-300" />}
              title="Event Pressure"
              body={cards?.upcomingEvents?.body ?? "Hard stop: upcoming events card unavailable."}
            />
            <InfoPanel
              icon={<Wrench className="h-4 w-4 text-cyan-300" />}
              title="Service Gaps"
              body={cards?.fryerTracking?.body ?? "Hard stop: fryer tracking card unavailable."}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AiBriefCard title={cards?.upcomingEvents?.title ?? "Upcoming Events"} body={cards?.upcomingEvents?.body} />
            <AiBriefCard title={cards?.aiSalesStrategy?.title ?? "AI Sales Strategy"} body={cards?.aiSalesStrategy?.body} />
            <AiBriefCard title={cards?.restaurantAccounts?.title ?? "Restaurant Accounts"} body={cards?.restaurantAccounts?.body} />
            <AiBriefCard title={cards?.fryerTracking?.title ?? "Fryer Tracking"} body={cards?.fryerTracking?.body} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300/80">
                    Event Windows
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-white">What is driving the next demand wave</h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                  {formatAttendance(eventAttendanceTotal)} projected attendance across visible events
                </div>
              </div>

              {loading ? (
                <LoadingCard message="Loading event windows..." />
              ) : events.length === 0 ? (
                <LoadingCard
                  message={cards?.upcomingEvents?.body ?? "Hard stop: upcoming events card has no verified data."}
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {events.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-[18px] border border-white/10 bg-[#0b0f16] p-5"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <span
                              className="rounded-[4px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
                              style={{ background: `${event.color}20`, color: event.color }}
                            >
                              {event.category}
                            </span>
                            <span className="text-xs text-slate-400">{event.venue ?? "Venue unavailable"}</span>
                          </div>
                          <h3 className="text-lg font-semibold text-white">{event.name}</h3>
                        </div>
                        <div
                          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-[3px]"
                          style={{ borderColor: urgencyColor(event.daysUntil) }}
                        >
                          <div className="text-xl font-semibold text-white">{event.daysUntil}</div>
                          <div className="text-[9px] uppercase tracking-[0.24em] text-white/55">days</div>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <MiniStat label="Start" value={formatShortDate(event.startDate)} />
                        <MiniStat label="Duration" value={`${event.durationDays}d`} />
                        <MiniStat label="Attendance" value={formatAttendance(event.attendance)} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <SideMetricCard
                icon={<Clock3 className="h-4 w-4 text-amber-300" />}
                title="Timing posture"
                body={cards?.upcomingEvents?.body ?? "Upcoming timing brief unavailable."}
              />
              <SideMetricCard
                icon={<TriangleAlert className="h-4 w-4 text-red-300" />}
                title="Lead source truth"
                body={`Current response is anchored to ${leadDataSourceSummary.glideCustomers} live Glide service accounts, with ${leadDataSourceSummary.eventReadyCustomers} already tied to upcoming event windows. Net-new lead discovery stays blank until a verified non-customer restaurant universe is ingested.`}
              />
              <SideMetricCard
                icon={<Sparkles className="h-4 w-4 text-cyan-300" />}
                title="Telemetry coverage"
                body={`${telemetryCoverage.populated} of ${telemetryCoverage.total} visible rows currently have both fryer and capacity telemetry populated. Verified weekly oil estimate across the book: ${estimatedOilTotal > 0 ? `${estimatedOilTotal.toLocaleString()} lbs` : "not yet computable"}.`}
              />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-red-300/80">
                    Account Workspace
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-white">{opportunityHeading}</h2>
                </div>
                <div className="text-sm text-slate-400">
                  {segment === "prospects"
                    ? "Verified net-new lane only"
                    : segment === "customers"
                      ? "Coverage and service context"
                      : segment === "events"
                        ? "Rows with event linkage"
                        : "Full ranked universe"}
                </div>
              </div>

              {loading ? (
                <LoadingCard message="Loading opportunity workspace..." />
              ) : displayedOpportunities.length === 0 ? (
                <LoadingCard
                  message={
                    cards?.restaurantAccounts?.body ??
                    "Hard stop: restaurant-accounts card has no verified account data."
                  }
                />
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {displayedOpportunities.map((row) => (
                    <OpportunityCard
                      key={row.id}
                      row={row}
                      intelDraft={intelDraftByRow[row.id]}
                      intelError={intelErrorByRow[row.id]}
                      isLoadingIntel={intelLoadingId === row.id}
                      onIntel={() => void requestIntelDraft(row)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
                  Service Gaps
                </div>
                <div className="space-y-3">
                  {serviceGaps.length === 0 ? (
                    <div className="rounded-[16px] border border-white/8 bg-white/[0.02] p-4 text-sm text-slate-300">
                      No service-gap rows in the current response.
                    </div>
                  ) : (
                    serviceGaps.map(({ row, gaps }) => (
                      <div
                        key={row.id}
                        className="rounded-[16px] border border-white/8 bg-[#0b0f16] p-4"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-white">{row.name}</div>
                          <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                            {row.customerStatus}
                          </div>
                        </div>
                        <div className="text-xs text-slate-300">
                          Missing: {gaps.join(", ")}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
                <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-300/80">
                  Coverage Notes
                </div>
                <div className="space-y-3 text-sm leading-6 text-slate-300">
                  <div>
                    Customer rows are real Glide service accounts; sparse cadence fields stay visible as missing telemetry instead of demoting live accounts to invented leads.
                  </div>
                  <div>
                    Prospect rows appear only once a verified non-customer restaurant universe is landed, so the lead lane stays empty rather than fabricated.
                  </div>
                  <div>
                    The current dataset still lacks venue and restaurant geometry, so this page cannot yet compute true distance-to-event routing.
                  </div>
                </div>
              </div>
            </div>
          </section>

          {stats?.lastSync ? (
            <footer className="rounded-[18px] border border-white/10 bg-white/[0.02] px-5 py-4 text-xs text-slate-400">
              Last sync {formatDate(stats.lastSync)}. Glide groups: export list {formatCompactNumber(stats.exportList)},
              shifts {formatCompactNumber(stats.shifts)}, shift restaurants {formatCompactNumber(stats.shiftRestaurants)}, shift casinos {formatCompactNumber(stats.shiftCasinos)}, scheduled reports {formatCompactNumber(stats.scheduledReports)}.
            </footer>
          ) : null}
        </div>
      </div>
    </BackendShell>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "violet" | "red" | "teal";
}) {
  const palette =
    tone === "violet"
      ? { text: "text-violet-300", bg: "bg-violet-500/10" }
      : tone === "red"
        ? { text: "text-red-300", bg: "bg-red-500/10" }
        : { text: "text-teal-300", bg: "bg-teal-500/10" };

  return (
    <div className={`rounded-[18px] border border-white/10 ${palette.bg} p-4`}>
      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${palette.text}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-300">{detail}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-3">
      <div className="text-[10px] uppercase tracking-[0.24em] text-white/45">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function GlideTableCard({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-[#0b0f16] p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">
        {value === null || value === undefined ? "n/a" : value.toLocaleString()}
      </div>
    </div>
  );
}

function InfoPanel({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
        {icon}
        {title}
      </div>
      <p className="text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

function AiBriefCard({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#0b0f16] p-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
        AI Brief
      </div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{body ?? "Card unavailable."}</p>
    </div>
  );
}

function SideMetricCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#0b0f16] p-5">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
        {icon}
        {title}
      </div>
      <div className="text-sm leading-6 text-slate-300">{body}</div>
    </div>
  );
}

function OpportunityCard({
  row,
  intelDraft,
  intelError,
  isLoadingIntel,
  onIntel,
}: {
  row: VegasOpportunityRow;
  intelDraft?: VegasIntelDraft;
  intelError?: string;
  isLoadingIntel: boolean;
  onIntel: () => void;
}) {
  const tone = cardTone(row.customerStatus);
  const gaps = missingFields(row);

  return (
    <article
      className="overflow-hidden rounded-[18px] border border-white/10 bg-[#0b0f16]"
      style={{ boxShadow: `inset 0 0 0 1px ${tone.accent}18` }}
    >
      <div className="border-b border-white/8 p-5" style={{ borderLeft: `4px solid ${tone.accent}` }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="rounded-[4px] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
                style={{ background: tone.badgeBg, color: tone.badgeText }}
              >
                {row.customerStatus}
              </span>
              {row.opportunityScore !== null && row.opportunityScore >= 65 ? (
                <span className="rounded-[4px] bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-200">
                  qualified
                </span>
              ) : null}
              <span className="rounded-[4px] bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/50">
                {sourceLabel(row)}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white">{row.name}</h3>
            <div className="mt-1 text-sm text-slate-400">{row.casino ?? "Casino unavailable"}</div>
          </div>
          <button
            type="button"
            onClick={onIntel}
            disabled={isLoadingIntel}
            className="rounded-[8px] border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-white/30 disabled:opacity-50"
          >
            {isLoadingIntel ? "Loading..." : "Intel"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Lead score" value={formatScore(row.opportunityScore)} />
          <MiniStat label="Event pressure" value={formatScore(row.eventPressure)} />
          <MiniStat label="Fryers" value={row.fryerCount ?? "n/a"} />
          <MiniStat
            label="Capacity"
            value={row.totalCapacityLbs === null ? "n/a" : `${Math.round(row.totalCapacityLbs).toLocaleString()} lbs`}
          />
          <MiniStat
            label="Est. oil/wk"
            value={
              row.estimatedOilLbsPerWeek === null
                ? "n/a"
                : `${row.estimatedOilLbsPerWeek.toLocaleString()} lbs`
            }
          />
          <MiniStat
            label="Changes/wk"
            value={row.changesPerWeek === null ? "n/a" : row.changesPerWeek.toString()}
          />
          <MiniStat label="Shifts" value={row.shiftCount ?? "n/a"} />
          <MiniStat label="Reports" value={row.scheduledReportCount ?? "n/a"} />
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailRow icon={<CalendarDays className="h-4 w-4 text-violet-300" />} label="Event">
            {row.eventName ? `${row.eventName} • ${formatDate(row.eventDate)}` : "No linked event"}
          </DetailRow>
          <DetailRow icon={<MapPin className="h-4 w-4 text-cyan-300" />} label="Schedule">
            {row.serviceFrequency ?? "No service cadence"}
          </DetailRow>
          <DetailRow icon={<PhoneCall className="h-4 w-4 text-emerald-300" />} label="Contact">
            {row.contactPerson ?? "Contact missing"}
          </DetailRow>
          <DetailRow icon={<Wrench className="h-4 w-4 text-amber-300" />} label="Oil">
            {row.oilType ?? "Oil type missing"}
          </DetailRow>
        </div>

        <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-4 text-sm leading-6 text-slate-300">
          {opportunitySummary(row)}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {gaps.length > 0 ? (
            <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-red-200">
              Missing: {gaps.join(", ")}
            </span>
          ) : (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-200">
              Operational fields populated
            </span>
          )}
          {row.exportListed !== null ? (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-slate-300">
              Export list {row.exportListed ? "yes" : "no"}
            </span>
          ) : null}
        </div>

        {intelError ? (
          <div className="rounded-[14px] border border-red-500/20 bg-red-950/30 p-4 text-sm text-red-200">
            {intelError}
          </div>
        ) : null}

        {intelDraft ? (
          <div className="rounded-[14px] border border-cyan-500/20 bg-cyan-500/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
              <Sparkles className="h-4 w-4" />
              Draft Intel
            </div>
            <div className="text-sm font-semibold text-white">
              {intelDraft.pitchAngle ?? "Draft pitch"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {intelDraft.aiGenerated
                ? `OpenRouter ${intelDraft.model ?? ""}`.trim()
                : intelDraft.provider ?? "Structured verification"}
            </div>
            {intelDraft.aiWarning ? (
              <div className="mt-3 rounded-[10px] border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                {intelDraft.aiWarning}
              </div>
            ) : null}
            {intelDraft.executiveBrief ? (
              <div className="mt-3 text-sm leading-6 text-slate-300">{intelDraft.executiveBrief}</div>
            ) : null}
            <div className="mt-3 text-sm leading-6 text-slate-200">
              {intelDraft.salesScript ?? "Draft unavailable."}
            </div>
            {intelDraft.callPlan && intelDraft.callPlan.length > 0 ? (
              <ReportList title="Call Plan" items={intelDraft.callPlan} />
            ) : null}
            {intelDraft.objectionHandling && intelDraft.objectionHandling.length > 0 ? (
              <ReportList title="Objections" items={intelDraft.objectionHandling} />
            ) : null}
            {intelDraft.riskFlags && intelDraft.riskFlags.length > 0 ? (
              <ReportList title="Risk Flags" items={intelDraft.riskFlags} />
            ) : null}
            {intelDraft.nextAction ? (
              <div className="mt-3 text-sm text-slate-300">{intelDraft.nextAction}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-white/8 bg-white/[0.03] p-3">
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
        {icon}
        {label}
      </div>
      <div className="text-sm text-slate-300">{children}</div>
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-white/45">{title}</div>
      <ul className="space-y-1 pl-4 text-sm text-slate-300">
        {items.map((item) => (
          <li key={item} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadingCard({ message }: { message: string }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
      {message}
    </div>
  );
}
