"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Building2, Gavel, Newspaper, Radio, Tag } from "lucide-react"

import { BackendShell } from "@/components/backend-shell"
import type { AiCardContent } from "@/lib/contracts/ai-card"
import type { ApiEnvelope, LegislationItem } from "@/lib/contracts/api"

type LegislationCards = {
  feedSummary: AiCardContent
  sourcePressure: AiCardContent
  tagPressure: AiCardContent
}

function safeDate(value: string): Date | null {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDisplayDate(value: string): string {
  const parsed = safeDate(value)
  return parsed ? parsed.toLocaleDateString() : value
}

function hoursAgo(value: string, nowMs: number | null): string {
  const parsed = safeDate(value)
  if (!parsed || nowMs === null) return "Unknown"
  const deltaMs = nowMs - parsed.getTime()
  if (deltaMs < 0) return "Now"
  if (deltaMs < 3_600_000) return "Now"
  const hours = Math.floor(deltaMs / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
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
        <div className="text-xs text-white uppercase tracking-widest font-bold">
          {title}
        </div>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="text-3xl font-bold font-mono text-white mb-1">{value}</div>
      <div className="text-xs text-slate-500 leading-relaxed">{subtext}</div>
    </div>
  )
}

export default function LegislationPage() {
  const [items, setItems] = useState<LegislationItem[]>([])
  const [cards, setCards] = useState<LegislationCards | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientNow, setClientNow] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const res = await fetch("/api/legislation/feed", { cache: "no-store" })
        const body = (await res.json()) as ApiEnvelope<LegislationItem[]> & {
          cards?: LegislationCards
          error?: string
        }
        if (!active) return
        if (res.ok && body.ok && Array.isArray(body.data)) {
          setItems(body.data)
          setCards(body.cards ?? null)
        } else {
          setItems([])
          setCards(null)
        }
      } catch {
        if (active) {
          setItems([])
          setCards(null)
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

  useEffect(() => {
    setClientNow(Date.now())
  }, [])

  const analytics = useMemo(() => {
    const timestamps = items
      .map((item) => safeDate(item.publishedAt)?.getTime() ?? null)
      .filter((ts): ts is number => ts !== null)

    const last24h =
      clientNow === null ? 0 : timestamps.filter((ts) => clientNow - ts <= 86_400_000).length
    const last7d =
      clientNow === null ? 0 : timestamps.filter((ts) => clientNow - ts <= 604_800_000).length
    const dailyBaseline = last7d > 0 ? last7d / 7 : 0
    const pulseRatio = dailyBaseline > 0 ? last24h / dailyBaseline : 0

    const sourceMap = new Map<string, number>()
    const tagMap = new Map<string, number>()

    for (const item of items) {
      sourceMap.set(item.source, (sourceMap.get(item.source) ?? 0) + 1)
      for (const tag of item.tags ?? []) {
        tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1)
      }
    }

    const sources = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
    const tags = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)

    return {
      last24h,
      pulseRatio,
      uniqueSources: sourceMap.size,
      uniqueTags: tagMap.size,
      sources,
      tags,
      topSourceCount: sources[0]?.count ?? 0,
      topTagCount: tags[0]?.count ?? 0,
    }
  }, [items, clientNow])

  return (
    <BackendShell>
      <div className="w-full space-y-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Gavel className="w-8 h-8" />
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-white">
                Policy Intelligence
              </h1>
            </div>
            <p className="text-slate-400 text-sm font-mono">
              Federal regulations, executive actions, and congressional activity affecting soybean oil procurement
            </p>
          </div>
        </header>

        {analytics.pulseRatio >= 1.5 && (
          <div className="p-3 rounded-xl border bg-amber-500/5 border-amber-500/20 flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5 text-amber-400">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-current" />
            </div>
            <Radio size={12} className="text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              News Pulse {analytics.pulseRatio.toFixed(1)}x
            </span>
            <span className="text-xs text-slate-500">
              {analytics.last24h} items in 24h
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Policy Items"
            value={items.length}
            subtext="Latest merged federal and congressional feed"
            icon={Newspaper}
          />
          <MetricCard
            title="Active Sources"
            value={analytics.uniqueSources}
            subtext="Distinct source systems in current feed"
            icon={Building2}
          />
          <MetricCard
            title="24h Activity"
            value={analytics.last24h}
            subtext="Items published in the last 24 hours"
            icon={Activity}
          />
          <MetricCard
            title="Tagged Signals"
            value={analytics.uniqueTags}
            subtext="Unique policy tags attached to records"
            icon={Tag}
          />
          <MetricCard
            title="Velocity"
            value={analytics.pulseRatio > 0 ? `${analytics.pulseRatio.toFixed(1)}x` : "0x"}
            subtext="24h publication rate vs 7-day baseline"
            icon={Radio}
          />
        </div>

        <section className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 md:p-10 hover:border-white/20 transition-all duration-300">
          <div className="text-sm font-semibold text-white uppercase tracking-widest border-l-2 border-cyan-500 pl-3 mb-8">
            {cards?.feedSummary?.title ?? "Live Policy Feed"}
          </div>
          {cards?.feedSummary?.body && (
            <p className="text-sm text-slate-400 mb-6">{cards.feedSummary.body}</p>
          )}

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-slate-500 text-sm">Awaiting legislation and executive feed data.</p>
          ) : (
            <div className="space-y-3">
              {items.slice(0, 30).map((item, idx) => (
                <div
                  key={`${item.source}-${item.title}-${idx}`}
                  className="bg-black/20 border border-white/10 rounded-xl p-4 md:p-5 flex flex-col md:flex-row md:items-start md:justify-between gap-4 hover:border-white/20 transition-all"
                >
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold mb-2 leading-snug">{item.title}</h3>
                    <div className="flex gap-2 flex-wrap">
                      {(item.tags ?? []).slice(0, 6).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300 border border-white/10"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap shrink-0">
                    <div className="text-xs text-slate-400 font-mono">{item.source}</div>
                    <div className="text-xs text-slate-500 mt-1">{formatDisplayDate(item.publishedAt)}</div>
                    <div className="text-[10px] text-slate-600 mt-1">
                      {hoursAgo(item.publishedAt, clientNow)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all duration-300">
            <div className="text-sm font-semibold text-white uppercase tracking-widest border-l-2 border-emerald-500 pl-3 mb-6">
              {cards?.sourcePressure?.title ?? "Source Activity"}
            </div>
            {cards?.sourcePressure?.body && (
              <p className="text-sm text-slate-400 mb-6">{cards.sourcePressure.body}</p>
            )}
            {analytics.sources.length === 0 ? (
              <p className="text-slate-500 text-sm">Awaiting source activity data.</p>
            ) : (
              <div className="space-y-4">
                {analytics.sources.slice(0, 10).map((source) => (
                  <div key={source.source}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 truncate pr-3">{source.source}</span>
                      <span className="text-slate-400 font-mono">{source.count}</span>
                    </div>
                    <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400/90 transition-all duration-700"
                        style={{
                          width: `${analytics.topSourceCount > 0 ? (source.count / analytics.topSourceCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all duration-300">
            <div className="text-sm font-semibold text-white uppercase tracking-widest border-l-2 border-amber-500 pl-3 mb-6">
              {cards?.tagPressure?.title ?? "Policy Tag Pressure"}
            </div>
            {cards?.tagPressure?.body && (
              <p className="text-sm text-slate-400 mb-6">{cards.tagPressure.body}</p>
            )}
            {analytics.tags.length === 0 ? (
              <p className="text-slate-500 text-sm">Awaiting policy tagging data.</p>
            ) : (
              <div className="space-y-4">
                {analytics.tags.slice(0, 12).map((tag) => (
                  <div key={tag.tag}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300 truncate pr-3">{tag.tag}</span>
                      <span className="text-slate-400 font-mono">{tag.count}</span>
                    </div>
                    <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400/90 transition-all duration-700"
                        style={{
                          width: `${analytics.topTagCount > 0 ? (tag.count / analytics.topTagCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </BackendShell>
  )
}
