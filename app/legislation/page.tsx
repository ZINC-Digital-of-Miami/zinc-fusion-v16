"use client"

import { useEffect, useState } from "react"
import { BackendShell } from "@/components/backend-shell"

interface LegislationItem {
  source: string
  title: string
  publishedAt: string
  tags: string[]
}

export default function LegislationPage() {
  const [items, setItems] = useState<LegislationItem[]>([])

  useEffect(() => {
    fetch("/api/legislation/feed")
      .then((r) => r.json())
      .then((res) => { if (res.data) setItems(res.data) })
      .catch(() => {})
  }, [])

  return (
    <BackendShell>
      <div className="w-full space-y-6">
        <h1 className="text-2xl font-bold text-white">Legislation</h1>
        <p className="text-slate-400">Federal regulations, executive actions, and congressional activity affecting soy oil and biofuel markets</p>

        {items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 flex justify-between items-start gap-4">
                <div>
                  <h3 className="text-white font-medium mb-2">{item.title}</h3>
                  <div className="flex gap-2 flex-wrap">
                    {item.tags?.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400">{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-xs text-slate-500">{item.source}</div>
                  <div className="text-xs text-slate-500">{new Date(item.publishedAt).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-slate-500">Awaiting legislation data</p>
          </div>
        )}
      </div>
    </BackendShell>
  )
}
