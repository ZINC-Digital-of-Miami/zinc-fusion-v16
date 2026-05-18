import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, LegislationItem } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { createClient } from "@/lib/supabase/server";
import {
  fetchTrustedMarketSnapshot,
  TRUSTED_MARKET_SOURCE_FEEDS,
  uniqueTrustedMarketUrls,
} from "@/lib/server/trusted-market-sources";

type LegislationCards = {
  feedSummary: AiCardContent;
  sourcePressure: AiCardContent;
  tagPressure: AiCardContent;
};

type LegislationAiSnapshot = {
  items?: LegislationItem[];
  cards?: LegislationCards;
} & AiSnapshotMeta;

const AG_SOY_PRIMARY_TERMS = [
  "soybean oil",
  "soy oil",
  "soybean",
  "soybeans",
  "soyoil",
  "bean oil",
  "oilseed",
  "palm oil",
  "canola oil",
  "rapeseed oil",
  "sunflower oil",
  "vegetable oil",
  "vegetable oils",
  "biofuel",
  "biodiesel",
  "renewable diesel",
  "renewable fuel standard",
  "rfs",
  "biomass-based diesel",
  "feedstock",
  "crush margin",
];

const AG_SOY_CONTEXT_TERMS = [
  "agriculture",
  "agricultural",
  "farm bill",
  "farm",
  "usda",
  "epa",
  "fats and oils",
  "oilseed",
  "commodity crop",
  "clean fuel",
  "lcfs",
  "blender tax credit",
  "carbon intensity",
];

const AG_SOY_POLICY_TERMS = [
  "tariff",
  "trade",
  "import",
  "export",
  "duty",
  "duties",
  "quota",
  "sanction",
  "subsid",
  "mandate",
  "countervailing",
  "antidumping",
  "rule",
  "program",
  "appropriation",
  "act",
];

const AG_SOY_TAG_HINTS = new Set(["crush", "biofuel", "palm", "tariff", "china", "energy"]);

function includesAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return false;
    const escaped = normalized
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return pattern.test(text);
  });
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tag) => String(tag).trim())
    .filter((tag) => tag.length > 0);
}

function isAgSoyPolicyRelevant(params: {
  title: string;
  summary?: string | null;
  tags?: string[];
}): boolean {
  const textBlob = `${params.title} ${params.summary ?? ""}`.toLowerCase();
  const primaryMatch = includesAnyTerm(textBlob, AG_SOY_PRIMARY_TERMS);
  const contextMatch = includesAnyTerm(textBlob, AG_SOY_CONTEXT_TERMS);
  const policyMatch = includesAnyTerm(textBlob, AG_SOY_POLICY_TERMS);
  const tagSet = new Set((params.tags ?? []).map((tag) => tag.toLowerCase()));
  const tagHint = Array.from(tagSet).some((tag) => AG_SOY_TAG_HINTS.has(tag));

  if (primaryMatch) return true;
  if (contextMatch && (policyMatch || tagHint)) return true;
  if (tagHint && includesAnyTerm(textBlob, ["usda", "epa", "farm", "agricult", "renewable", "biofuel"])) {
    return true;
  }
  return false;
}

function dedupeLegislationItems(items: LegislationItem[]): LegislationItem[] {
  const seen = new Set<string>();
  const deduped: LegislationItem[] = [];
  for (const item of items) {
    const key = `${item.source}::${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

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
  trustedUrls: string[],
): AiCardProvenance {
  return {
    asOf,
    generatedAt,
    method: "verified-db-and-trusted-market-pull",
    sourceFeeds: [
      "alt.legislation_1d",
      "alt.executive_actions",
      "alt.congress_bills",
      ...trustedUrls,
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
        source: "trusted-market-pull",
        recordHint: `card=${cardKey}`,
        observedAt: generatedAt,
      },
    ],
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const aiSnapshot = await readAiSnapshot<LegislationAiSnapshot>(
      "app/config/legislation-feed-ai.json",
    );
    const trustedMarket = await fetchTrustedMarketSnapshot();
    const trustedUrls = uniqueTrustedMarketUrls(trustedMarket);

    const [legRes, execRes, billsRes] = await Promise.all([
      supabase
        .schema("alt")
        .from("legislation_1d")
        .select("title, summary, source, published_at, payload")
        .order("published_at", { ascending: false })
        .limit(20),
      supabase
        .schema("alt")
        .from("executive_actions")
        .select("title, summary, source, published_at, payload")
        .order("published_at", { ascending: false })
        .limit(10),
      supabase
        .schema("alt")
        .from("congress_bills")
        .select("title, summary, source, published_at, payload")
        .order("published_at", { ascending: false })
        .limit(10),
    ]);

    const allRows = [...(legRes.data ?? []), ...(execRes.data ?? []), ...(billsRes.data ?? [])];
    allRows.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

    const filteredRows = allRows.filter((row) => {
      const payload = (row.payload as Record<string, unknown> | null) ?? null;
      const tags = normalizeTags(payload?.tags);
      return isAgSoyPolicyRelevant({
        title: String(row.title ?? ""),
        summary: row.summary as string | null | undefined,
        tags,
      });
    });

    const dbItems = dedupeLegislationItems(filteredRows.slice(0, 30).map((row) => {
      const payload = (row.payload as Record<string, unknown> | null) ?? null;
      return {
        source: row.source,
        title: row.title,
        publishedAt: row.published_at,
        tags: normalizeTags(payload?.tags),
      };
    }));

    const snapshotItems = dedupeLegislationItems((aiSnapshot?.items ?? []).filter((item) =>
      isAgSoyPolicyRelevant({
        title: item.title,
        summary: "",
        tags: item.tags ?? [],
      }),
    ));
    const items: LegislationItem[] = dbItems.length > 0 ? dbItems : snapshotItems;
    const generatedAt = aiSnapshot?.generatedAt ?? new Date().toISOString();
    const asOf = items[0]?.publishedAt ?? trustedMarket.fetchedAt;

    const sourceCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();
    for (const item of dbItems) {
      sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
      for (const tag of item.tags) {
        const normalized = String(tag).trim();
        if (!normalized) continue;
        tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
      }
    }
    const sortedSources = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1]);
    const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);
    const topSource = sortedSources[0];
    const topTagSet = sortedTags.slice(0, 3).map(([tag]) => tag).join(", ");
    const topSourceShare =
      dbItems.length > 0 && topSource ? (topSource[1] / dbItems.length) * 100 : null;
    const concentrationClass =
      topSourceShare === null
        ? "unknown"
        : topSourceShare >= 60
          ? "high concentration"
          : topSourceShare >= 40
            ? "moderate concentration"
            : "broadly distributed";
    const latestItem = dbItems[0] ?? null;

    const fallbackCards: LegislationCards = {
      feedSummary: {
        title: "Live Policy Feed",
        body: latestItem
          ? `Most recent verified agriculture/soy policy item: "${latestItem.title}" from ${latestItem.source}. Primary watch themes are ${topTagSet || "not yet tagged"} with procurement impact evaluated on implementation timing and enforcement likelihood.`
          : "Hard stop: no verified agriculture/soy policy rows are available across legislation, executive, or congressional feeds.",
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.feedSummary,
        provenance: buildProvenance(generatedAt, asOf, "feedSummary", trustedUrls),
      },
      sourcePressure: {
        title: "Source Activity",
        body: topSource
          ? `Source structure is ${concentrationClass}; ${topSource[0]} currently leads policy flow coverage at ${topSourceShare?.toFixed(1)}%. Confidence should be discounted when concentration remains high without corroboration breadth.`
          : "Hard stop: source-activity interpretation is blocked because no verified feed records are available.",
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.sourcePressure,
        provenance: buildProvenance(generatedAt, asOf, "sourcePressure", trustedUrls),
      },
      tagPressure: {
        title: "Policy Tag Pressure",
        body: sortedTags.length > 0
          ? `Top verified policy pressure themes: ${topTagSet}. These tags should drive watchlist priority in that order until persistence weakens.`
          : "Hard stop: no verified policy tags are present, so tag-pressure ranking is blocked.",
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.tagPressure,
        provenance: buildProvenance(generatedAt, asOf, "tagPressure", trustedUrls),
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
      source: ["alt.legislation_1d", "alt.executive_actions", "alt.congress_bills", ...TRUSTED_MARKET_SOURCE_FEEDS].join(","),
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
