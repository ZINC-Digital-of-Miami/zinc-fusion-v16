"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  Brain,
  Newspaper,
  ShieldAlert,
  Users,
  Waves,
} from "lucide-react";

import { BackendShell } from "@/components/backend-shell";
import type { AiCardContent } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, SentimentOverview, ZlLivePrice } from "@/lib/contracts/api";

type BiasTone = "bullish" | "bearish" | "neutral";

type SentimentCardContent = Pick<AiCardContent, "title" | "body"> & Partial<AiCardContent>;

type SentimentCards = {
  narratives: SentimentCardContent[];
  positioningFlow: SentimentCardContent;
  headlineFlow: SentimentCardContent;
};

type BiasVisual = {
  label: string;
  chip: string;
  text: string;
  color: string;
};

type SectionCardProps = {
  title: string;
  accent: string;
  children: ReactNode;
  className?: string;
};

function normalizeBias(raw: string): BiasTone {
  const value = raw.trim().toLowerCase();
  if (value.includes("bull")) return "bullish";
  if (value.includes("bear")) return "bearish";
  return "neutral";
}

function biasStyle(tone: BiasTone): BiasVisual {
  if (tone === "bullish") {
    return {
      label: "Bullish",
      chip: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-400",
      color: "#34d399",
    };
  }
  if (tone === "bearish") {
    return {
      label: "Bearish",
      chip: "bg-red-500/10 border-red-500/20",
      text: "text-red-400",
      color: "#f87171",
    };
  }
  return {
    label: "Neutral",
    chip: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-300",
    color: "#94a3b8",
  };
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatSigned(value: number | null): string {
  if (value === null) return "missing";
  return `${value > 0 ? "+" : ""}${value}`;
}

function deriveGaugeScore(overview: SentimentOverview | null): number | null {
  if (!overview) return null;
  return Math.round((Math.max(-100, Math.min(100, overview.sentimentScore)) + 100) / 2);
}

function zoneForGauge(score: number | null): { label: string; color: string; interpretation: string } {
  if (score === null) {
    return {
      label: "No current signal",
      color: "#94a3b8",
      interpretation: "Hard stop: verified sentiment payload is unavailable.",
    };
  }
  if (score <= 20) {
    return {
      label: "Extreme Fear",
      color: "#ef4444",
      interpretation: "Buyer risk posture is defensive until verified inputs recover.",
    };
  }
  if (score <= 40) {
    return {
      label: "Fear",
      color: "#fb923c",
      interpretation: "Procurement timing should stay cautious and evidence-led.",
    };
  }
  if (score <= 55) {
    return {
      label: "Neutral",
      color: "#facc15",
      interpretation: "Market psychology is mixed; preserve optionality.",
    };
  }
  if (score <= 75) {
    return {
      label: "Greed",
      color: "#a3e635",
      interpretation: "Risk appetite is supportive but still needs price confirmation.",
    };
  }
  return {
    label: "Extreme Greed",
    color: "#34d399",
    interpretation: "Strong sentiment requires tighter invalidation checks.",
  };
}

function componentBarColor(value: number | null): string {
  if (value === null) return "#334155";
  if (value <= 25) return "#ef4444";
  if (value <= 40) return "#f97316";
  if (value <= 55) return "#f59e0b";
  if (value <= 70) return "#84cc16";
  return "#10b981";
}

function statusColor(status: "elevated" | "moderate" | "calm"): string {
  if (status === "elevated") return "#ef4444";
  if (status === "moderate") return "#f59e0b";
  return "#10b981";
}

function SectionCard({ title, accent, children, className = "" }: SectionCardProps) {
  return (
    <section
      className={`mb-8 bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all duration-300 ${className}`}
    >
      <div
        className="text-sm font-semibold text-slate-400 uppercase tracking-widest pl-3 mb-8"
        style={{ borderLeft: `2px solid ${accent}` }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function SnapshotCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 hover:border-white/20 transition-colors">
      <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">{label}</div>
      <div className="text-3xl font-bold font-mono text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{subtext}</div>
    </div>
  );
}

function HeadlineBadge({ tone }: { tone: BiasTone }) {
  const visual = biasStyle(tone);
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${visual.chip} ${visual.text}`}>
      {visual.label}
    </span>
  );
}

export default function SentimentPage() {
  const [overview, setOverview] = useState<SentimentOverview | null>(null);
  const [live, setLive] = useState<ZlLivePrice | null>(null);
  const [cards, setCards] = useState<SentimentCards | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [overviewRes, liveRes] = await Promise.all([
          fetch("/api/sentiment/overview", { cache: "no-store" }),
          fetch("/api/zl/live", { cache: "no-store" }),
        ]);

        const overviewBody = (await overviewRes.json()) as ApiEnvelope<SentimentOverview | null> & {
          cards?: SentimentCards;
          error?: string;
        };
        const liveBody = (await liveRes.json()) as ApiEnvelope<ZlLivePrice | null> & {
          error?: string;
        };

        if (!active) return;

        if (overviewRes.ok && overviewBody.ok && overviewBody.data) {
          setOverview(overviewBody.data);
          setCards(overviewBody.cards ?? null);
        } else {
          setOverview(null);
          setCards(null);
        }

        if (liveRes.ok && liveBody.ok && liveBody.data) {
          setLive(liveBody.data);
        } else {
          setLive(null);
        }
      } catch {
        if (active) {
          setOverview(null);
          setLive(null);
          setCards(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const clampedScore = overview ? Math.max(-100, Math.min(100, overview.sentimentScore)) : null;
  const gaugeScore = deriveGaugeScore(overview);
  const gaugeZone = zoneForGauge(gaugeScore);
  const needleAngle = gaugeScore === null ? 0 : (gaugeScore - 50) * 1.8;
  const cotTone = normalizeBias(overview?.cotBias ?? "neutral");
  const cot = biasStyle(cotTone);
  const headlinePressure =
    overview === null ? null : Math.min(100, Math.max(0, Math.round(overview.headlineCount * 4)));
  const cotComponent = overview === null ? null : cotTone === "bullish" ? 70 : cotTone === "bearish" ? 30 : 50;
  const priceComponent = live === null ? null : gaugeScore;
  const volatilityLevel =
    gaugeScore === null ? null : Math.min(100, Math.abs(gaugeScore - 50) * 2);
  const volatilityStatus =
    volatilityLevel === null || volatilityLevel >= 60
      ? "elevated"
      : volatilityLevel >= 30
        ? "moderate"
        : "calm";
  const bullishShare = gaugeScore === null ? 0 : Math.max(0, Math.min(100, gaugeScore - 35));
  const bearishShare = gaugeScore === null ? 0 : Math.max(0, Math.min(100, 65 - gaugeScore));
  const neutralShare = Math.max(0, 100 - bullishShare - bearishShare);
  const trendTone = gaugeScore === null ? "mixed" : gaugeScore >= 60 ? "strong" : gaugeScore <= 40 ? "down" : "mixed";
  const trendClass =
    trendTone === "strong"
      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
      : trendTone === "down"
        ? "bg-red-500/10 border-red-500/20 text-red-400"
        : "bg-amber-500/10 border-amber-500/20 text-amber-300";
  const trendLabel =
    trendTone === "strong" ? "Supportive" : trendTone === "down" ? "Defensive" : "Mixed";

  const narrativeItems = useMemo(() => {
    if (cards?.narratives?.length) return cards.narratives;
    return [
      {
        title: "Macro Narrative",
        body: "Hard stop: macro narrative unavailable because verified sentiment inputs were not returned.",
      },
      {
        title: "Flow Narrative",
        body: "Hard stop: flow narrative unavailable because verified sentiment inputs were not returned.",
      },
      {
        title: "Procurement Narrative",
        body: "Hard stop: procurement narrative unavailable because verified sentiment inputs were not returned.",
      },
    ];
  }, [cards]);

  const componentRows = [
    { label: "News Flow", value: headlinePressure, tilt: `${overview?.headlineCount ?? 0} rows` },
    { label: "Managed-Money Bias", value: cotComponent, tilt: cot.label },
    { label: "Price Pulse", value: priceComponent, tilt: live ? "live" : "missing" },
  ];

  const volatilityRows = [
    {
      label: "Sentiment Swing",
      value: volatilityLevel,
      status: volatilityStatus,
    },
    {
      label: "Headline Pressure",
      value: headlinePressure,
      status: headlinePressure === null || headlinePressure >= 60 ? "elevated" : headlinePressure >= 30 ? "moderate" : "calm",
    },
    {
      label: "Positioning Stress",
      value: cotComponent === null ? null : Math.abs(cotComponent - 50) * 2,
      status:
        cotComponent === null || Math.abs(cotComponent - 50) * 2 >= 60
          ? "elevated"
          : Math.abs(cotComponent - 50) * 2 >= 30
            ? "moderate"
            : "calm",
    },
  ] as const;

  return (
    <BackendShell>
      <div className="w-full bg-[#0a0a0a] text-slate-200 pb-20">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Brain className="w-8 h-8" />
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
                Market Psychology
              </h1>
            </div>
            <p className="text-slate-400 text-sm font-mono">
              Quantitative sentiment, narrative clustering, and positioning context
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${cot.chip} ${cot.text}`}>
              Managed-Money Bias {cot.label}
            </span>
            {!loading && overview?.updatedAt && (
              <span className="text-xs text-slate-500 font-mono">
                Updated {formatTimestamp(overview.updatedAt)}
              </span>
            )}
          </div>
        </header>

        <div className="pt-8">
        <SectionCard title="Fear & Greed Composite" accent="#3b82f6" className="p-8 md:p-10">
          {loading ? (
            <div className="flex flex-col items-center py-12">
              <div className="h-32 w-64 rounded-full bg-white/5 mb-6 animate-pulse" />
              <div className="h-12 w-24 rounded bg-white/5 mb-3 animate-pulse" />
              <div className="h-6 w-32 rounded bg-white/5 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="mx-auto max-w-md text-center">
                <svg viewBox="0 0 300 170" className="w-full" role="img" aria-label="Fear and greed gauge">
                  <defs>
                    <linearGradient id="sentimentGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="25%" stopColor="#f97316" />
                      <stop offset="50%" stopColor="#eab308" />
                      <stop offset="75%" stopColor="#84cc16" />
                      <stop offset="100%" stopColor="#22c55e" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M 30 150 A 120 120 0 0 1 270 150"
                    fill="none"
                    stroke="url(#sentimentGaugeGradient)"
                    strokeLinecap="round"
                    strokeWidth="24"
                  />
                  <line
                    x1="150"
                    y1="150"
                    x2="150"
                    y2="54"
                    stroke="#ffffff"
                    strokeLinecap="round"
                    strokeWidth="3"
                    transform={`rotate(${needleAngle} 150 150)`}
                  />
                  <circle cx="150" cy="150" r="8" fill="#ffffff" />
                </svg>
                <div className="text-6xl font-bold text-white mt-4">
                  {gaugeScore !== null ? gaugeScore : "—"}
                </div>
                <div className="text-2xl font-semibold mt-2" style={{ color: gaugeZone.color }}>
                  {gaugeZone.label}
                </div>
                <p className="text-lg text-slate-300 mt-2 mx-auto max-w-lg">{gaugeZone.interpretation}</p>
              </div>
              <div className="border-t border-white/5 pt-6 mt-8">
                <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-4">
                  Component Breakdown
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {componentRows.map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-28 shrink-0 text-sm text-slate-400">{row.label}</div>
                      <div className="h-2.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${row.value ?? 0}%`,
                            background: componentBarColor(row.value),
                          }}
                        />
                      </div>
                      <div className="w-9 text-right font-mono text-sm text-slate-300">
                        {row.value !== null ? row.value : "—"}
                      </div>
                      <div className="w-14 text-right text-[10px] text-slate-500 uppercase tracking-wide">
                        {row.tilt}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard title="Hero Price Strip" accent="#22d3ee">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">
                Soybean-Oil Futures Contract Price
              </div>
              <div className="text-5xl md:text-6xl font-bold font-mono text-white">
                {live?.price != null ? live.price.toFixed(2) : "—"}
              </div>
              <div className="text-sm text-slate-500 mt-2">
                {live?.observedAt ? `Observed ${formatTimestamp(live.observedAt)}` : "Awaiting live price feed"}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
              <span className={`px-4 py-2 rounded-full text-base font-bold border ${trendClass}`}>
                {trendLabel}
              </span>
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2">Sentiment</div>
                <div className="text-3xl font-bold font-mono text-white">{formatSigned(clampedScore)}</div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Impact on Soybean Oil Futures" accent="#f59e0b">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <div className="text-xs text-slate-500 pl-5">
                Procurement psychology, positioning, and headline-pressure read
              </div>
            </div>
            <div className="text-4xl font-bold text-white font-mono">{formatSigned(clampedScore)}</div>
          </div>
          <div className="mb-6 border border-cyan-500/30 rounded-xl p-5 bg-white/[0.02]">
            <div className="text-xs text-cyan-300 uppercase tracking-widest font-bold mb-3">
              Procurement Outlook
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {narrativeItems[2]?.body ??
                "Hard stop: procurement outlook unavailable because verified sentiment inputs were not returned."}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SnapshotCard
              label="Fear/Greed"
              value={gaugeScore !== null ? String(gaugeScore) : "—"}
              subtext={gaugeZone.label}
            />
            <SnapshotCard
              label="Headlines"
              value={overview ? String(overview.headlineCount) : "—"}
              subtext="Verified 7-day feed rows"
            />
            <SnapshotCard label="Managed-Money Bias" value={cot.label} subtext={overview?.cotBias ?? "missing"} />
            <SnapshotCard
              label="Soybean-Oil Live"
              value={live?.price != null ? live.price.toFixed(2) : "—"}
              subtext={live ? "Current read" : "missing"}
            />
          </div>
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5">
            <p className="text-sm text-slate-300 leading-relaxed">
              {narrativeItems[0]?.body ??
                "Hard stop: macro narrative unavailable because verified sentiment inputs were not returned."}
            </p>
          </div>
        </SectionCard>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">Market Snapshot</h2>
            {overview?.updatedAt ? (
              <span className="text-xs text-slate-500 ml-2">{formatTimestamp(overview.updatedAt)}</span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <SnapshotCard label="Headline Count" value={overview ? String(overview.headlineCount) : "—"} subtext="7-day verified news feed" />
            <SnapshotCard label="Sentiment Score" value={formatSigned(clampedScore)} subtext={gaugeZone.label} />
            <SnapshotCard label="Managed-Money Bias" value={cot.label} subtext={cards?.positioningFlow?.title ?? "Managed money"} />
            <SnapshotCard label="AI Refresh" value={overview?.updatedAt ? formatTimestamp(overview.updatedAt) : "—"} subtext="Snapshot timestamp" />
            <SnapshotCard label="Soybean-Oil Live" value={live?.price != null ? live.price.toFixed(2) : "—"} subtext={live?.observedAt ? formatTimestamp(live.observedAt) : "Awaiting live price"} />
            <SnapshotCard label="Headline Flow" value={headlinePressure !== null ? `${headlinePressure}` : "—"} subtext="Derived from verified row count" />
          </div>
          <div className="mt-6 bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-colors">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
              <div>
                <div className="text-sm font-bold text-white">Crude Oil / Soybean Oil Cross</div>
                <div className="text-xs text-slate-500 mt-1">
                  Current page payload exposes cross-market narrative but not raw crude-oil or volatility-feed fields.
                </div>
              </div>
              <Activity className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              {narrativeItems[0]?.body ??
                "Hard stop: cross-market narrative is unavailable because verified trusted-market context was not returned."}
            </p>
          </div>
        </div>

        <SectionCard title="Market Volatility" accent="#a855f7">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {volatilityRows.map((row) => {
              const color = statusColor(row.status);
              return (
                <div key={row.label} className="text-center">
                  <div className="text-sm text-slate-400 font-bold mb-2">{row.label}</div>
                  <div className="text-3xl font-bold font-mono text-white mb-2">
                    {row.value !== null ? Math.round(row.value) : "—"}
                  </div>
                  <div className="h-2.5 bg-slate-800 rounded-full max-w-[200px] mx-auto mb-2 overflow-hidden">
                    <div className="h-full" style={{ width: `${row.value ?? 0}%`, background: color }} />
                  </div>
                  <div className="text-sm font-medium capitalize" style={{ color }}>
                    {row.value === null ? "missing" : row.status}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-white">Market Participants</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {[
              {
                title: "Managed Money",
                subtitle: cards?.positioningFlow?.title ?? "Managed-money bias",
                net: cot.label,
                detail: overview?.cotBias ?? "missing",
                value: cotComponent,
                color: cot.color,
              },
              {
                title: "Headline Participation",
                subtitle: cards?.headlineFlow?.title ?? "Verified news breadth",
                net: overview ? `${overview.headlineCount} rows` : "missing",
                detail: "7-day source window",
                value: headlinePressure,
                color: componentBarColor(headlinePressure),
              },
              {
                title: "Buyer Psychology",
                subtitle: narrativeItems[2]?.title ?? "Procurement narrative",
                net: gaugeZone.label,
                detail: gaugeScore !== null ? `${gaugeScore}/100` : "missing",
                value: gaugeScore,
                color: gaugeZone.color,
              },
            ].map((participant) => (
              <div
                key={participant.title}
                className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-colors"
              >
                <div className="mb-5">
                  <div className="text-base font-bold text-white">{participant.title}</div>
                  <div className="text-xs text-slate-500">{participant.subtitle}</div>
                </div>
                <div className="text-2xl font-bold mb-1" style={{ color: participant.color }}>
                  {participant.net}
                </div>
                <div className="text-lg font-mono text-slate-300 mb-3">{participant.detail}</div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-l-full"
                    style={{ width: `${participant.value ?? 0}%`, background: "#10b981" }}
                  />
                </div>
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Low</span>
                  <span>High</span>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
            <div className="flex justify-between mb-3">
              <div className="text-sm font-bold text-white">Fund Percentile Proxy</div>
              <div className="text-sm text-slate-400">{gaugeScore !== null ? `${gaugeScore}/100` : "missing"}</div>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full"
                style={{
                  width: `${gaugeScore ?? 0}%`,
                  background: "linear-gradient(90deg, #ef4444, #f59e0b, #10b981)",
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500">
              <span>Defensive</span>
              <span className="text-slate-400">Verified sentiment proxy</span>
              <span>Supportive</span>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Newspaper className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Segmented Policy News Lanes</h2>
          </div>
          <div className="mb-6 bg-[#0a0a0a] border border-white/10 rounded-xl p-4">
            <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
              <div style={{ width: `${bullishShare}%`, background: "#10b981" }} />
              <div style={{ width: `${neutralShare}%`, background: "#475569" }} />
              <div style={{ width: `${bearishShare}%`, background: "#ef4444" }} />
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-emerald-400">Bullish {Math.round(bullishShare)}%</span>
              <span className="text-slate-500">Neutral {Math.round(neutralShare)}%</span>
              <span className="text-red-400">Bearish {Math.round(bearishShare)}%</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[cards?.headlineFlow, ...narrativeItems].filter(Boolean).map((item, index) => (
              <article
                key={`${item?.title ?? "headline"}-${index}`}
                className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-colors"
              >
                <div className="flex justify-between items-start gap-3 mb-3">
                  <HeadlineBadge tone={index === 0 ? cotTone : "neutral"} />
                  <span className="px-2 py-0.5 rounded text-xs text-cyan-300 border border-cyan-500/20 bg-cyan-500/10">
                    {index === 0 ? "flow" : "policy"}
                  </span>
                </div>
                <div className="text-sm text-slate-500 mb-1">
                  {overview?.updatedAt ? formatTimestamp(overview.updatedAt) : "timestamp missing"}
                </div>
                <h3 className="text-base font-bold text-white mb-2 leading-tight">
                  {item?.title ?? "Verified Headline Lane"}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed line-clamp-3">
                  {item?.body ??
                    "Hard stop: headline lane unavailable because verified sentiment inputs were not returned."}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["soybean oil", "policy", "sentiment"].map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded bg-white/5 text-xs text-slate-400 font-mono border border-white/5"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-slate-400" />
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {cards?.positioningFlow?.title ?? "Managed Money Positioning"}
              </div>
            </div>
            <div className={`text-2xl font-bold ${cot.text}`}>{cot.label}</div>
            <p className="text-sm text-slate-500 mt-2">
              {cards?.positioningFlow?.body ?? "Bias is derived from the latest CFTC-linked positioning payload."}
            </p>
          </div>
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Waves className="w-4 h-4 text-slate-400" />
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {cards?.headlineFlow?.title ?? "Headline Flow"}
              </div>
            </div>
            <div className="text-2xl font-bold text-white">{gaugeZone.label}</div>
            <p className="text-sm text-slate-500 mt-2">
              {cards?.headlineFlow?.body ?? "Active feed count used to drive sentiment update cadence."}
            </p>
          </div>
        </div>
        </div>
      </div>
    </BackendShell>
  );
}
