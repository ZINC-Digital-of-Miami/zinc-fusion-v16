import unittest
from pathlib import Path


class VegasIntelCompletenessSortContractTest(unittest.TestCase):
    def test_route_prioritizes_completeness_before_scores(self) -> None:
        route_path = Path("app/api/vegas/intel/route.ts")
        source = route_path.read_text(encoding="utf-8")

        self.assertIn(
            "const completenessScoreA =",
            source,
            "Expected completeness-first sort score for opportunity rows.",
        )
        self.assertIn(
            "const completenessScoreB =",
            source,
            "Expected completeness-first sort score for opportunity rows.",
        )
        self.assertIn(
            "if (completenessScoreA !== completenessScoreB) return completenessScoreB - completenessScoreA;",
            source,
            "Expected sort comparator to prioritize rows with richer telemetry before zfusion/score ranking.",
        )

    def test_route_enforces_glide_only_restaurant_source(self) -> None:
        route_path = Path("app/api/vegas/intel/route.ts")
        source = route_path.read_text(encoding="utf-8")

        self.assertIn(
            "const activeRestaurantRows = glideRestaurantRows;",
            source,
            "Expected active restaurant rows to be Glide-only.",
        )
        self.assertNotIn(
            "glideRestaurantRows.length > 0 ? glideRestaurantRows : restaurantRows",
            source,
            "Non-Glide fallback is forbidden for Vegas opportunity rows.",
        )

    def test_route_restores_customer_prospect_service_cadence_contract(self) -> None:
        route_path = Path("app/api/vegas/intel/route.ts")
        source = route_path.read_text(encoding="utf-8")

        self.assertIn(
            'const customerStatus = serviceCadence ? "customer" : "prospect";',
            source,
            "Expected customer/prospect split to come from service cadence presence.",
        )

    def test_route_restores_verified_event_window_fallback(self) -> None:
        route_path = Path("app/api/vegas/intel/route.ts")
        source = route_path.read_text(encoding="utf-8")

        self.assertIn(
            "const defaultLinkedEvent = events[0] ?? null;",
            source,
            "Expected next verified event fallback to exist for unlinked rows.",
        )
        self.assertIn(
            "const linkedEvent = topEvent ?? defaultLinkedEvent;",
            source,
            "Expected linked event to use verified impact rows first, then verified upcoming fallback.",
        )

    def test_page_uses_all_customer_prospect_events_segments(self) -> None:
        page_path = Path("app/(protected)/vegas-intel/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        self.assertIn(
            'type VegasSegment = "all" | "customers" | "prospects" | "events";',
            source,
            "Expected vegas segments to include all/customers/prospects/events.",
        )
        self.assertIn(
            'if (segment === "events") return opportunities.slice(0, 15);',
            source,
            "Expected events segment to keep rendering account rows.",
        )
        self.assertIn(
            'if (segment === "prospects") return prospects.slice(0, 15);',
            source,
            "Expected prospects segment to render prospect-classified rows.",
        )
        self.assertIn(
            'row.customerStatus === "prospect"',
            source,
            "Expected prospect badge/color behavior in opportunity rows.",
        )

    def test_page_preserves_turnover_segment_stats_and_prospect_tokens(self) -> None:
        page_path = Path("app/(protected)/vegas-intel/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        self.assertIn(
            "const segmentStats: Record<VegasSegment, Array<{ value: string | number; label: string }>> =",
            source,
            "Expected segment cards to compute per-segment turnover stats instead of one shared event metric set.",
        )
        self.assertIn(
            "totalFryers",
            source,
            "Expected account segment cards to retain fryer-total math from opportunities.",
        )
        self.assertIn(
            "totalCapacity",
            source,
            "Expected account segment cards to retain capacity-total math from opportunities.",
        )
        self.assertIn(
            'const accent = row.customerStatus === "customer" ? "#2dd4bf" : "#b91c1c";',
            source,
            "Expected opportunity prospect accent bar to use the locked V15 dark red.",
        )
        self.assertIn(
            'background: "rgba(185, 28, 28, 0.2)"',
            source,
            "Expected prospect badge background to match the turnover token.",
        )
        self.assertIn(
            'color: "#f87171"',
            source,
            "Expected prospect badge text color to match the turnover token.",
        )

    def test_draft_route_is_verified_glide_only_and_read_only(self) -> None:
        draft_path = Path("app/api/vegas/intel/draft/route.ts")
        source = draft_path.read_text(encoding="utf-8")

        self.assertIn(
            'pickString(meta, ["source"]) !== "glide"',
            source,
            "Expected draft intel route to reject non-Glide restaurant rows.",
        )
        self.assertNotIn(
            "GLIDE_BEARER_TOKEN",
            source,
            "Draft intel route must not call Glide or expose Glide credentials.",
        )
        self.assertNotIn(
            ".insert(",
            source,
            "Draft intel route must return draft collateral without creating sent/stored records.",
        )

    def test_draft_route_rejects_explicit_missing_event_ids(self) -> None:
        source = Path("app/api/vegas/intel/draft/route.ts").read_text(encoding="utf-8")

        self.assertIn(
            "if (requestedEventId !== null && !selectedEvent) {",
            source,
            "Expected explicit eventId requests to fail closed instead of falling back to another event.",
        )
        self.assertIn(
            "Requested event was not found.",
            source,
            "Expected explicit missing event requests to return a clear 404 message.",
        )

    def test_draft_route_uses_direct_openrouter_not_vercel_ai_gateway(self) -> None:
        draft_source = Path("app/api/vegas/intel/draft/route.ts").read_text(encoding="utf-8")
        openrouter_source = Path("lib/server/openrouter.ts").read_text(encoding="utf-8")
        package_source = Path("package.json").read_text(encoding="utf-8")

        self.assertIn(
            "generateVegasIntelReport",
            draft_source,
            "Expected Intel button route to generate direct AI report payloads.",
        )
        self.assertIn(
            "https://openrouter.ai/api/v1/chat/completions",
            openrouter_source,
            "Expected OpenRouter direct API endpoint, not Vercel model routing.",
        )
        self.assertIn(
            "OPENROUTER_API_KEY",
            openrouter_source,
            "Expected personal OpenRouter API key path to be server-side only.",
        )
        self.assertIn(
            "google/gemini-2.5-flash",
            openrouter_source,
            "Expected Gemini 2.5 Flash default through OpenRouter direct API.",
        )
        self.assertNotIn("@ai-sdk/gateway", package_source + draft_source + openrouter_source)
        self.assertNotIn("AI_GATEWAY_API_KEY", package_source + draft_source + openrouter_source)
        self.assertNotIn("VERCEL_OIDC_TOKEN", package_source + draft_source + openrouter_source)

    def test_openrouter_snapshot_source_is_trusted_without_gateway(self) -> None:
        source = Path("lib/server/ai-snapshot.ts").read_text(encoding="utf-8")

        self.assertIn(
            '"openrouter-daily-refresh"',
            source,
            "Expected direct OpenRouter daily refresh snapshots to validate as trusted.",
        )


class SentimentTurnoverContractTest(unittest.TestCase):
    def test_sentiment_page_renders_all_turnover_sections_in_order(self) -> None:
        page_path = Path("app/(protected)/sentiment/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        sections = [
            "Fear & Greed Composite",
            "Hero Price Strip",
            "Impact on Soybean Oil Futures",
            "Market Snapshot",
            "Market Volatility",
            "Market Participants",
            "Segmented Policy News Lanes",
        ]
        positions = [source.index(section) for section in sections]
        self.assertEqual(
            positions,
            sorted(positions),
            "Expected sentiment body to preserve the seven-section turnover order.",
        )

    def test_sentiment_page_uses_turnover_visual_primitives(self) -> None:
        page_path = Path("app/(protected)/sentiment/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        for required in (
            "viewBox=\"0 0 300 170\"",
            "M 30 150 A 120 120 0 0 1 270 150",
            "linearGradient id=\"sentimentGaugeGradient\"",
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
            "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6",
            "grid grid-cols-1 md:grid-cols-2 gap-6",
        ):
            with self.subTest(required=required):
                self.assertIn(required, source)


if __name__ == "__main__":
    unittest.main()
