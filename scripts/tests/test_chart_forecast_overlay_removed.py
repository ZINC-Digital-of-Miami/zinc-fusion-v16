from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]


class ChartForecastOverlayRemovedTest(unittest.TestCase):
    def test_chart_has_no_forecast_overlay_wiring(self) -> None:
        chart_source = (ROOT / "components/chart/ZlCandlestickChart.tsx").read_text(
            encoding="utf-8"
        )
        dashboard_source = (
            ROOT / "app/(protected)/dashboard/page.tsx"
        ).read_text(encoding="utf-8")

        self.assertNotIn("ForecastTargetsPrimitive", chart_source)
        self.assertNotIn("SHOW_FORECAST_TARGET_OVERLAY", chart_source)
        self.assertNotRegex(chart_source, r"\btargetZones\b")
        self.assertNotRegex(dashboard_source, r"\btargetZones\b")
        self.assertIsNotNone(
            re.search(r"<ZlCandlestickChart\s+height=\"80vh\"\s*/>", dashboard_source)
        )


if __name__ == "__main__":
    unittest.main()
