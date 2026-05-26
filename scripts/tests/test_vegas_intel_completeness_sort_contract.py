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
            'const customerStatus = pickString(meta, ["source"]) === "glide"',
            source,
            "Expected Glide service accounts to be treated as customers even when cadence fields are sparse.",
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
            'if (segment === "events") return eventLinked.slice(0, 12);',
            source,
            "Expected events segment to render the event-linked account lane.",
        )
        self.assertIn(
            'if (segment === "prospects") return prospects.slice(0, 12);',
            source,
            "Expected prospects segment to render prospect-classified rows.",
        )
        self.assertIn(
            'row.customerStatus === "prospect"',
            source,
            "Expected prospect badge/color behavior in opportunity rows.",
        )

    def test_page_preserves_glide_truth_and_net_new_fail_closed_copy(self) -> None:
        page_path = Path("app/(protected)/vegas-intel/page.tsx")
        source = page_path.read_text(encoding="utf-8")

        self.assertIn(
            "Glide service accounts",
            source,
            "Expected page to show live Glide service-account coverage.",
        )
        self.assertIn(
            "Net-new lead discovery remains intentionally blank until a verified non-customer restaurant universe is landed.",
            source,
            "Expected page to fail closed on net-new lead discovery until the non-customer universe is verified.",
        )
        self.assertIn(
            "Net-new lead lane intentionally blank",
            source,
            "Expected lead hero copy to acknowledge the real-data gap instead of inventing prospects.",
        )
        self.assertIn(
            "Glide Table Coverage",
            source,
            "Expected compact coverage cards for the eight Glide tables.",
        )
        self.assertIn(
            "Shift Service Coverage",
            source,
            "Expected visible shift-linked account coverage from Glide operational data.",
        )
        self.assertIn(
            "stats?.shiftRestaurants",
            source,
            "Expected shift restaurant link counts to be surfaced in the Vegas UI.",
        )
        self.assertLess(
            source.index("Glide Table Coverage"),
            source.index("Lead View"),
            "Expected Glide coverage to render directly below the hero before the lead/AI body panels.",
        )
        self.assertLess(
            source.index("{SEGMENTS.map"),
            source.index("Lead View"),
            "Expected the four sales segment cards to render directly below the hero before the lead/AI body panels.",
        )
        self.assertNotIn("trusted-fill prospect rows", source)

    def test_route_exposes_full_glide_shift_counts(self) -> None:
        route_path = Path("app/api/vegas/intel/route.ts")
        source = route_path.read_text(encoding="utf-8")
        contract_source = Path("lib/contracts/api.ts").read_text(encoding="utf-8")

        self.assertIn("shiftCasinos: glideCoverageCounts.shiftCasinos", source)
        self.assertIn("shiftRestaurants: glideCoverageCounts.shiftRestaurants", source)
        self.assertIn("shiftCasinos: number | null;", contract_source)
        self.assertIn("shiftRestaurants: number | null;", contract_source)

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
            "nvidia/nemotron-3-super-120b-a12b:free",
            openrouter_source,
            "Expected the selected OpenRouter default model.",
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
