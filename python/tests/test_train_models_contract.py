from __future__ import annotations

import unittest
from decimal import Decimal

import pandas as pd

from fusion.train_models import TrainingContractError, _split_temporal


def _frame_with_target(values: list[object]) -> pd.DataFrame:
    rows = len(values)
    return pd.DataFrame(
        {
            "trade_date": pd.date_range("2020-01-01", periods=rows, freq="D"),
            "close": [50.0 + (idx * 0.01) for idx in range(rows)],
            "volume": [1000 + idx for idx in range(rows)],
            "target_price_30d": values,
        }
    )


class SplitTemporalContractTest(unittest.TestCase):
    def test_decimal_object_target_is_coerced_to_numeric_before_fit(self) -> None:
        frame = _frame_with_target([Decimal("70.25") + Decimal(idx) / Decimal("100") for idx in range(1200)])

        train, validation, test, meta = _split_temporal(frame, label="target_price_30d", horizon=30)

        self.assertEqual(meta["label"], "target_price_30d")
        self.assertTrue(pd.api.types.is_numeric_dtype(train["target_price_30d"]))
        self.assertTrue(pd.api.types.is_numeric_dtype(validation["target_price_30d"]))
        self.assertTrue(pd.api.types.is_numeric_dtype(test["target_price_30d"]))

    def test_non_numeric_target_fails_before_autogluon_fit(self) -> None:
        frame = _frame_with_target(["not-a-price"] * 1200)

        with self.assertRaisesRegex(TrainingContractError, "target_price_30d has no numeric values"):
            _split_temporal(frame, label="target_price_30d", horizon=30)


if __name__ == "__main__":
    unittest.main()
