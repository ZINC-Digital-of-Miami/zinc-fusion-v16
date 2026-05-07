import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, LegislationItem } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

type LegislationCards = {
  feedSummary: AiCardContent;
  sourcePressure: AiCardContent;
  tagPressure: AiCardContent;
};

type LegislationAiSnapshot = {
  items?: LegislationItem[];
  cards?: LegislationCards;
} & AiSnapshotMeta;

const LEGISLATION_INSTRUCTIONS: Record<keyof LegislationCards, StrategicSpecialInstructions> = {
  feedSummary: {
    cardTopic: "Policy Feed Procurement Impact Synthesis",
    strategicObjective:
      "Prioritize policy items by transmission speed and cost impact relevance so buyer decisions align with actionable legislative risk.",
    neuralConnectionThesis:
      "Policy updates influence soybean oil procurement through compliance, trade, and subsidy pathways; impact depends on implementation horizon and enforcement likelihood.",
    quantResearchProtocol: [
      "Rank items by urgency, implementation lag, and likely cost pass-through channel.",
      "Separate market-moving policy from informational noise.",
      "Classify each top item by immediate, near-term, or deferred impact horizon.",
      "Translate item-level impact into buyer execution guidance.",
    ],
    inferenceConstraints: [
      "Do not treat all feed items as equal impact.",
      "Do not issue urgent posture without implementation evidence.",
      "Do not omit policy-to-procurement transmission explanation.",
    ],
    outputRequirements: [
      "Identify top policy risks and their impact horizons.",
      "State likely procurement consequence per top risk.",
      "Provide monitoring trigger for each high-impact item class.",
    ],
  },
  sourcePressure: {
    cardTopic: "Source Concentration and Signal Reliability",
    strategicObjective:
      "Measure whether current source concentration increases policy-risk uncertainty or supports high-confidence interpretation.",
    neuralConnectionThesis:
      "When policy flow clusters in a narrow source set, narrative volatility can increase and degrade confidence unless corroborated by independent channels.",
    quantResearchProtocol: [
      "Count source concentration and compare with multi-day baseline.",
      "Detect sudden source dominance shifts and classify reliability risk.",
      "Cross-check high-pressure sources against corroborating outlets.",
      "Score confidence based on breadth and consistency of source coverage.",
    ],
    inferenceConstraints: [
      "Do not overstate confidence when source breadth is narrow.",
      "Do not ignore corroboration gaps on high-impact claims.",
      "Do not reduce source analysis to raw count only.",
    ],
    outputRequirements: [
      "State concentration regime and confidence impact.",
      "Highlight top active sources by relevance.",
      "Explain how source structure affects buyer decision certainty.",
    ],
  },
  tagPressure: {
    cardTopic: "Policy Theme Pressure Ranking",
    strategicObjective:
      "Identify which policy themes (tariff, biofuel, exports, logistics) carry the highest procurement risk contribution in the current window.",
    neuralConnectionThesis:
      "Theme pressure predicts where policy risk is likely to propagate first; concentrated tag clusters can front-run contract-cost repricing.",
    quantResearchProtocol: [
      "Rank tags by frequency, persistence, and historical transmission relevance.",
      "Group related tags into coherent risk themes.",
      "Differentiate structural themes from transient bursts.",
      "Map top themes to buyer-facing procurement actions.",
    ],
    inferenceConstraints: [
      "Do not equate high frequency with high impact without context.",
      "Do not collapse distinct theme channels into one generic category.",
      "Do not provide posture without horizon classification.",
    ],
    outputRequirements: [
      "Report top pressure themes with impact horizon.",
      "Explain transmission pathway to procurement cost/timing.",
      "Provide concrete watchlist priorities.",
    ],
  },
};

function buildProvenance(
  generatedAt: string,
  asOf: string,
  cardKey: keyof LegislationCards,
): AiCardProvenance {
  return {
    asOf,
    generatedAt,
    method: "daily-ai-card-refresh",
    sourceFeeds: [
      "alt.legislation_1d",
      "alt.executive_actions",
      "alt.congress_bills",
      "app/config/legislation-feed-ai.json",
    ],
    sourceRecords: [
      {
        source: "alt.legislation_1d",
        table: "alt.legislation_1d",
        recordHint: "latest policy rows",
        observedAt: asOf,
      },
      {
        source: "alt.executive_actions",
        table: "alt.executive_actions",
        recordHint: "latest executive rows",
        observedAt: asOf,
      },
      {
        source: "alt.congress_bills",
        table: "alt.congress_bills",
        recordHint: "latest congressional rows",
        observedAt: asOf,
      },
      {
        source: "ai-daily-refresh",
        table: "app/config/legislation-feed-ai.json",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
  };
}

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const aiSnapshot = await readAiSnapshot<LegislationAiSnapshot>(
      "app/config/legislation-feed-ai.json",
    );

    const [legRes, execRes, billsRes] = await Promise.all([
      supabase
        .schema("alt")
        .from("legislation_1d")
        .select("title, source, published_at, payload")
        .order("published_at", { ascending: false })
        .limit(20),
      supabase
        .schema("alt")
        .from("executive_actions")
        .select("title, source, published_at, payload")
        .order("published_at", { ascending: false })
        .limit(10),
      supabase
        .schema("alt")
        .from("congress_bills")
        .select("title, source, published_at, payload")
        .order("published_at", { ascending: false })
        .limit(10),
    ]);

    const allRows = [...(legRes.data ?? []), ...(execRes.data ?? []), ...(billsRes.data ?? [])];
    allRows.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

    const dbItems: LegislationItem[] = allRows.slice(0, 30).map((row) => ({
      source: row.source,
      title: row.title,
      publishedAt: row.published_at,
      tags: ((row.payload as Record<string, unknown>)?.tags as string[] | undefined) ?? [],
    }));
    const items: LegislationItem[] = aiSnapshot?.items?.length ? aiSnapshot.items : dbItems;
    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const asOf = items[0]?.publishedAt ?? generatedAt;

    const fallbackCards: LegislationCards = {
      feedSummary: {
        title: "Live Policy Feed",
        body: "Awaiting daily AI pull for policy narrative synthesis and procurement impact framing.",
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.feedSummary,
        provenance: buildProvenance(generatedAt, asOf, "feedSummary"),
      },
      sourcePressure: {
        title: "Source Activity",
        body: "Awaiting daily AI pull for source concentration and intensity interpretation.",
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.sourcePressure,
        provenance: buildProvenance(generatedAt, asOf, "sourcePressure"),
      },
      tagPressure: {
        title: "Policy Tag Pressure",
        body: "Awaiting daily AI pull for policy-theme pressure ranking.",
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.tagPressure,
        provenance: buildProvenance(generatedAt, asOf, "tagPressure"),
      },
    };

    const rawCards = aiSnapshot?.cards ?? fallbackCards;
    const cards: LegislationCards = {
      feedSummary: {
        ...fallbackCards.feedSummary,
        ...rawCards.feedSummary,
        strategicSpecialInstructions:
          rawCards.feedSummary?.strategicSpecialInstructions ??
          fallbackCards.feedSummary.strategicSpecialInstructions,
        provenance: rawCards.feedSummary?.provenance ?? fallbackCards.feedSummary.provenance,
      },
      sourcePressure: {
        ...fallbackCards.sourcePressure,
        ...rawCards.sourcePressure,
        strategicSpecialInstructions:
          rawCards.sourcePressure?.strategicSpecialInstructions ??
          fallbackCards.sourcePressure.strategicSpecialInstructions,
        provenance: rawCards.sourcePressure?.provenance ?? fallbackCards.sourcePressure.provenance,
      },
      tagPressure: {
        ...fallbackCards.tagPressure,
        ...rawCards.tagPressure,
        strategicSpecialInstructions:
          rawCards.tagPressure?.strategicSpecialInstructions ??
          fallbackCards.tagPressure.strategicSpecialInstructions,
        provenance: rawCards.tagPressure?.provenance ?? fallbackCards.tagPressure.provenance,
      },
    };

    const envelope: ApiEnvelope<LegislationItem[]> = {
      ok: true,
      data: items,
      asOf: new Date().toISOString(),
      source: "alt.legislation_1d,alt.executive_actions,alt.congress_bills",
    };

    return NextResponse.json({
      ...envelope,
      cards,
      ai: toAiEnvelopeMeta(aiSnapshot),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
