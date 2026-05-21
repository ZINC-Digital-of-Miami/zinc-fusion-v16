import { NextResponse } from "next/server";

import type { AiCardContent, AiCardProvenance, StrategicSpecialInstructions } from "@/lib/contracts/ai-card";
import type { ApiEnvelope, LegislationItem } from "@/lib/contracts/api";
import { readAiSnapshot, toAiEnvelopeMeta, type AiSnapshotMeta } from "@/lib/server/ai-snapshot";
import { withAudienceInstructionGuardrails } from "@/lib/server/ai-instruction-guardrails";
import { createServerDataClient } from "@/lib/server/server-data-client";
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
    cardTopic: "Policy Feed Operational Impact Briefing",
    strategicObjective:
      "Translate current legislation flow into procurement, pricing, compliance, and sourcing impact so buyer decisions stay operationally grounded.",
    neuralConnectionThesis:
      "Policy only matters to procurement when it changes timing, cost, compliance burden, or supply-chain friction.",
    quantResearchProtocol: [
      "Rank items by operational transmission speed and enforcement likelihood.",
      "Separate confirmed action, proposed action, and administrative noise.",
      "Classify each top item as immediate, near-term, or deferred risk.",
      "Convert each risk into buyer-facing execution implications.",
    ],
    inferenceConstraints: [
      "Do not provide political, partisan, or ideological commentary.",
      "Do not use doom language, hype language, or speculative certainty.",
      "Do not issue urgent posture without implementation evidence.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "State top operational risks and impact horizon.",
      "Provide one monitoring trigger for escalation.",
    ],
  },
  sourcePressure: {
    cardTopic: "Source Reliability and Concentration Risk",
    strategicObjective:
      "Assess whether source concentration supports confidence or increases policy-interpretation risk for procurement decisions.",
    neuralConnectionThesis:
      "Narrow source breadth increases interpretation error risk unless corroborated by independent channels.",
    quantResearchProtocol: [
      "Measure lead-source share and breadth across active items.",
      "Detect source-dominance shifts against recent baseline.",
      "Flag corroboration gaps in high-impact lanes.",
      "Map source structure into confidence posture.",
    ],
    inferenceConstraints: [
      "Do not overstate confidence when source breadth is narrow.",
      "Do not reduce reliability analysis to raw counts alone.",
      "Do not blur confirmed evidence with unconfirmed narrative.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "State concentration regime and confidence effect.",
      "Explain operational consequence of low corroboration.",
    ],
  },
  tagPressure: {
    cardTopic: "Policy Theme Pressure Ranking",
    strategicObjective:
      "Identify which policy themes are most likely to propagate into procurement pressure and compliance workload.",
    neuralConnectionThesis:
      "Theme concentration is useful only when linked to concrete operational transmission channels.",
    quantResearchProtocol: [
      "Rank tags by frequency, persistence, and transmission relevance.",
      "Separate trade, compliance, energy, and agriculture theme lanes.",
      "Differentiate structural pressure from temporary bursts.",
      "Map top themes to watch priorities for buyers.",
    ],
    inferenceConstraints: [
      "Do not equate high frequency with high impact without context.",
      "Do not collapse distinct theme channels into one generic category.",
      "Do not claim certainty without implementation detail.",
    ],
    outputRequirements: [
      "Keep output to 1-3 concise sentences.",
      "Report top themes with impact horizon.",
      "Provide concrete watchlist priorities tied to operations.",
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

function stacyFeedSummaryBody(params: {
  latestItem: LegislationItem | null;
  topTagSet: string;
}): string {
  if (!params.latestItem) {
    return "Hard stop: no verified agriculture/soy policy rows are available across active feeds.";
  }
  const themes = params.topTagSet || "no ranked tags yet";
  return `Lead policy item: "${params.latestItem.title}" (${params.latestItem.source}). Active themes: ${themes}. Operational takeaway: treat this as active watch-risk until implementation language is confirmed.`;
}

function stacySourcePressureBody(params: {
  topSource: [string, number] | undefined;
  topSourceShare: number | null;
  concentrationClass: string;
}): string {
  if (!params.topSource) {
    return "Hard stop: source-pressure read is blocked because verified feed records are missing.";
  }
  return `Source mix is ${params.concentrationClass}; ${params.topSource[0]} carries ${params.topSourceShare?.toFixed(1) ?? "n/a"}% of current flow. Confidence should stay moderated until corroborating agencies confirm the same risk lane.`;
}

function stacyTagPressureBody(params: { sortedTags: Array<[string, number]>; topTagSet: string }): string {
  if (params.sortedTags.length === 0) {
    return "Hard stop: no verified policy tags are present, so tag-pressure ranking is blocked.";
  }
  return `Top pressure tags: ${params.topTagSet}. Keep watch priority on these lanes for import/export friction, compliance workload, and procurement timing pressure.`;
}

export async function GET() {
  try {
    const supabase = await createServerDataClient();
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
        body: stacyFeedSummaryBody({
          latestItem,
          topTagSet,
        }),
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.feedSummary,
        provenance: buildProvenance(generatedAt, asOf, "feedSummary", trustedUrls),
      },
      sourcePressure: {
        title: "Source Activity",
        body: stacySourcePressureBody({
          topSource,
          topSourceShare,
          concentrationClass,
        }),
        strategicSpecialInstructions: LEGISLATION_INSTRUCTIONS.sourcePressure,
        provenance: buildProvenance(generatedAt, asOf, "sourcePressure", trustedUrls),
      },
      tagPressure: {
        title: "Policy Tag Pressure",
        body: stacyTagPressureBody({
          sortedTags,
          topTagSet,
        }),
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
          withAudienceInstructionGuardrails(
            rawCards.feedSummary?.strategicSpecialInstructions ??
              fallbackCards.feedSummary.strategicSpecialInstructions,
            "chris",
          ),
        provenance: rawCards.feedSummary?.provenance ?? fallbackCards.feedSummary.provenance,
      },
      sourcePressure: {
        ...fallbackCards.sourcePressure,
        ...rawCards.sourcePressure,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.sourcePressure?.strategicSpecialInstructions ??
              fallbackCards.sourcePressure.strategicSpecialInstructions,
            "chris",
          ),
        provenance: rawCards.sourcePressure?.provenance ?? fallbackCards.sourcePressure.provenance,
      },
      tagPressure: {
        ...fallbackCards.tagPressure,
        ...rawCards.tagPressure,
        strategicSpecialInstructions:
          withAudienceInstructionGuardrails(
            rawCards.tagPressure?.strategicSpecialInstructions ??
              fallbackCards.tagPressure.strategicSpecialInstructions,
            "chris",
          ),
        provenance: rawCards.tagPressure?.provenance ?? fallbackCards.tagPressure.provenance,
      },
    };

    const voicedCards: LegislationCards = {
      feedSummary: {
        ...cards.feedSummary,
        body: stacyFeedSummaryBody({
          latestItem,
          topTagSet,
        }),
      },
      sourcePressure: {
        ...cards.sourcePressure,
        body: stacySourcePressureBody({
          topSource,
          topSourceShare,
          concentrationClass,
        }),
      },
      tagPressure: {
        ...cards.tagPressure,
        body: stacyTagPressureBody({
          sortedTags,
          topTagSet,
        }),
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
      cards: voicedCards,
      ai: toAiEnvelopeMeta(aiSnapshot),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, data: [], asOf: new Date().toISOString(), error: String(err) },
      { status: 500 },
    );
  }
}
