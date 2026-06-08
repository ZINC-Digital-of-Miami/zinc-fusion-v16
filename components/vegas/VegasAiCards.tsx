"use client";

import { useState } from "react";
import { Brain, CalendarDays, ChevronDown, Flame, Store, Sparkles } from "lucide-react";
import type { AiCardContent } from "@/lib/contracts/ai-card";
import type { AiEnvelopeMeta } from "@/lib/contracts/api";

type VegasAiCardKey =
  | "upcomingEvents"
  | "aiSalesStrategy"
  | "restaurantAccounts"
  | "fryerTracking";

const CARD_ORDER: { key: VegasAiCardKey; icon: typeof Brain }[] = [
  { key: "upcomingEvents", icon: CalendarDays },
  { key: "aiSalesStrategy", icon: Brain },
  { key: "restaurantAccounts", icon: Store },
  { key: "fryerTracking", icon: Flame },
];

function formatAsOf(value: string | null | undefined): string {
  if (!value) return "unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function VegasAiCard({ card, Icon }: { card: AiCardContent; Icon: typeof Brain }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
        <Icon className="h-4 w-4" />
        {card.title}
      </div>

      <p className="text-sm leading-6 text-slate-300">{card.body}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
          As of {formatAsOf(card.provenance?.asOf)}
        </span>
        {card.provenance?.sourceFeeds?.slice(0, 3).map((feed) => (
          <span key={feed} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            {feed}
          </span>
        ))}
      </div>

      {card.strategicSpecialInstructions ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 transition hover:text-cyan-300"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            Strategic rationale
          </button>
          {open ? (
            <div className="mt-3 space-y-2 rounded-xl border border-white/5 bg-[#0a0a0a] p-4 text-xs leading-5 text-slate-400">
              <div>
                <span className="font-semibold text-slate-300">Objective: </span>
                {card.strategicSpecialInstructions.strategicObjective}
              </div>
              <div>
                <span className="font-semibold text-slate-300">Thesis: </span>
                {card.strategicSpecialInstructions.neuralConnectionThesis}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function VegasAiCards({
  cards,
  ai,
}: {
  cards: Partial<Record<VegasAiCardKey, AiCardContent>> | null;
  ai: AiEnvelopeMeta;
}) {
  const available = CARD_ORDER.filter(({ key }) => Boolean(cards?.[key]));
  if (available.length === 0) return null;

  return (
    <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.01)_100%)] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-400">
          <Sparkles className="h-4 w-4" />
          AI Sales Intelligence
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {ai.model ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{ai.model}</span>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
            Generated {formatAsOf(ai.generatedAt)}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {available.map(({ key, icon }) => (
          <VegasAiCard key={key} card={cards![key]!} Icon={icon} />
        ))}
      </div>
    </div>
  );
}
