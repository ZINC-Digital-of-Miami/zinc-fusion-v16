"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Brain, Newspaper, TrendingUp } from "lucide-react"

import { BackendShell } from "@/components/backend-shell"
import type { ApiEnvelope, SentimentOverview, ZlLivePrice } from "@/lib/contracts/api"

type BiasTone = "bullish" | "bearish" | "neutral"

function normalizeBias(raw: string): BiasTone {
  const value = raw.trim().toLowerCase()
  if (value.includes("bull")) return "bullish"
  if (value.includes("bear")) return "bearish"
  return "neutral"
}

function biasStyle(tone: BiasTone): { label: string; chip: string; text: string } {
  if (tone === "bullish") {
    return {
      label: "Bullish",
      chip: "bg-emerald-500/10 border-emerald-500/20",
      text: "text-emerald-400",
    }
  }
  if (tone === "bearish") {
    return {
      label: "Bearish",
      chip: "bg-red-500/10 border-red-500/20",
      text: "text-red-400",
    }
  }
  return {
    label: "Neutral",
    chip: "bg-slate-500/10 border-slate-500/20",
    text: "text-slate-300",
  }
}

function scoreLabel(score: number): string {
  if (score >= 25) return "Positive Momentum"
  if (score <= -25) return "Defensive Momentum"
  return "Balanced Momentum"
}

function scoreTextColor(score: number): string {
  if (score >= 25) return "text-emerald-400"
  if (score <= -25) return "text-red-400"
  return "text-amber-400"
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function MetricCard({
  title,
  value,
  subtext,
  icon: Icon,
}: {
  title: string
  value: string | number
  subtext: string
  icon: typeof Activity
}) {
  return (
    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all duration-300">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="text-xs text-white uppercase tracking-widest font-bold">{title}</div>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="text-3xl font-bold font-mono text-white mb-1">{value}</div>
      <div className="text-xs text-slate-500 leading-relaxed">{subtext}</div>
    </div>
  )
}

export default function SentimentPage() {
  const [overview, setOverview] = useState<SentimentOverview | null>(null)
  const [live, setLive] = useState<ZlLivePrice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [overviewRes, liveRes] = await Promise.all([
          fetch("/api/sentiment/overview", { cache: "no-store" }),
          fetch("/api/zl/live", { cache: "no-store" }),
        ])

        const overviewBody = (await overviewRes.json()) as ApiEnvelope<SentimentOverview | null> & {
          error?: string
        }
        const liveBody = (await liveRes.json()) as ApiEnvelope<ZlLivePrice | null> & {
          error?: string
        }

        if (!active) return

        if (overviewRes.ok && overviewBody.ok && overviewBody.data) {
          setOverview(overviewBody.data)
        } else {
          setOverview(null)
        }

        if (liveRes.ok && liveBody.ok && liveBody.data) {
          setLive(liveBody.data)
        } else {
          setLive(null)
        }
      } catch {
        if (active) {
          setOverview(null)
          setLive(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const sentimentScore = overview?.sentimentScore ?? 0
  const clampedScore = Math.max(-100, Math.min(100, sentimentScore))
  const meterPercent = ((clampedScore + 100) / 200) * 100
  const cotTone = normalizeBias(overview?.cotBias ?? "neutral")
  const cot = biasStyle(cotTone)
  const scoreLabelText = scoreLabel(clampedScore)

  const narrativeItems = useMemo(
    () => [
      {
        title: "Macro Narrative",
        body: "Awaiting GPT-driven narrative classification for macro and policy context.",
      },
      {
        title: "Flow Narrative",
        body: "Awaiting positioning and participation narrative from CFTC-linked sentiment signals.",
      },
      {
        title: "Procurement Narrative",
        body: "Awaiting buyer-facing interpretation for contract timing and risk posture.",
      },
    ],
    [],
  )

  return (
    <BackendShell>
      <div className="w-full space-y-8">
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
              CoT Bias {cot.label}
            </span>
            {!loading && overview?.updatedAt && (
              <span className="text-xs text-slate-500 font-mono">
                Updated {formatTimestamp(overview.updatedAt)}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Headlines (7d)"
            value={overview?.headlineCount ?? "—"}
            subtext="Count from approved source feed"
            icon={Newspaper}
          />
          <MetricCard
            title="Sentiment Score"
            value={overview ? `${clampedScore > 0 ? "+" : ""}${clampedScore}` : "—"}
            subtext="Pipeline-backed aggregate score"
            icon={TrendingUp}
          />
          <MetricCard
            title="CoT Bias"
            value={overview?.cotBias ?? "—"}
            subtext="Latest managed-money positioning bias"
            icon={Activity}
          />
          <MetricCard
            title="ZL Live"
            value={live?.price != null ? live.price.toFixed(2) : "—"}
            subtext={live?.observedAt ? `Observed ${formatTimestamp(live.observedAt)}` : "Awaiting live price feed"}
            icon={Brain}
          />
        </div>

        <section className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 md:p-10 hover:border-white/20 transition-all duration-300">
          <div className="text-sm font-semibold text-white uppercase tracking-widest border-l-2 border-cyan-500 pl-3 mb-8">
            Sentiment Composite
          </div>

          {loading ? (
            <div className="space-y-4">
              <div className="h-3 rounded-full bg-white/5 animate-pulse" />
              <div className="h-12 rounded-lg bg-white/5 animate-pulse" />
            </div>
          ) : (
            <>
              <div className="w-full mb-4">
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${meterPercent}%`,
                      background:
                        clampedScore >= 25
                          ? "#22c55e"
                          : clampedScore <= -25
                            ? "#ef4444"
                            : "#eab308",
                    }}
                  />
                </div>
              </div>
              <div className={`text-2xl font-bold ${scoreTextColor(clampedScore)}`}>
                {overview ? `${clampedScore > 0 ? "+" : ""}${clampedScore}` : "No current signal"}
              </div>
              <div className="text-sm text-slate-400 mt-1">{scoreLabelText}</div>
            </>
          )}
        </section>

        <section className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 md:p-10 hover:border-white/20 transition-all duration-300">
          <div className="text-sm font-semibold text-white uppercase tracking-widest border-l-2 border-emerald-500 pl-3 mb-8">
            Narrative Matrix
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {narrativeItems.map((item) => (
              <div
                key={item.title}
                className="bg-black/20 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  {item.title}
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 md:p-10 hover:border-white/20 transition-all duration-300">
          <div className="text-sm font-semibold text-white uppercase tracking-widest border-l-2 border-amber-500 pl-3 mb-8">
            Positioning and Flow
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/20 border border-white/10 rounded-xl p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Managed Money Positioning
              </div>
              <div className={`text-2xl font-bold ${cot.text}`}>{cot.label}</div>
              <p className="text-sm text-slate-500 mt-2">
                Bias is derived from the latest CFTC-linked positioning payload.
              </p>
            </div>
            <div className="bg-black/20 border border-white/10 rounded-xl p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Headline Flow
              </div>
              <div className="text-2xl font-bold text-white">
                {overview ? overview.headlineCount : "—"}
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Active feed count used to drive sentiment update cadence.
              </p>
            </div>
          </div>
        </section>
      </div>
    </BackendShell>
  )
}
