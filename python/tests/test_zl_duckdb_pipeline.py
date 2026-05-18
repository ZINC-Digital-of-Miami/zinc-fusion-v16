from datetime import datetime, timezone
from pathlib import Path

import duckdb

from fusion import zl_duckdb_pipeline as pipeline


def test_parse_databento_ndjson_accepts_partial_content_payload() -> None:
    payload = "\n".join(
        [
            '{"hd":{"ts_event":"1779120000000000000"},"open":"74000000000","high":"74100000000","low":"73900000000","close":"74050000000","volume":"12"}',
            '{"hd":{"ts_event":"1779123600000000000"},"open":"74050000000","high":"74200000000","low":"74000000000","close":"74150000000","volume":"18"}',
        ]
    )

    bars = pipeline.parse_databento_ndjson(payload, http_status=206)

    assert len(bars) == 2
    assert bars[0].close == 74.05
    assert bars[1].bucket_ts == datetime(2026, 5, 18, 17, tzinfo=timezone.utc)


def test_parse_databento_ndjson_keeps_valid_rows_when_partial_tail_is_malformed() -> None:
    payload = "\n".join(
        [
            '{"hd":{"ts_event":"1779120000000000000"},"open":"74000000000","high":"74100000000","low":"73900000000","close":"74050000000","volume":"12"}',
            '{"hd":{"ts_event":"1779123600000000000"},"open":',
        ]
    )

    bars = pipeline.parse_databento_ndjson(payload, http_status=206)

    assert len(bars) == 1
    assert bars[0].bucket_ts == datetime(2026, 5, 18, 16, tzinfo=timezone.utc)


def test_duckdb_store_rolls_hourly_rows_to_daily_and_latest(tmp_path: Path) -> None:
    db_path = tmp_path / "raw.duckdb"
    conn = duckdb.connect(str(db_path))
    try:
        pipeline.initialize_duckdb(conn)
        bars = [
            pipeline.HourlyBar("ZL", "ZL.n.0", datetime(2026, 5, 18, 14, tzinfo=timezone.utc), 73.0, 74.0, 72.5, 73.5, 60),
            pipeline.HourlyBar("ZL", "ZL.n.0", datetime(2026, 5, 18, 15, tzinfo=timezone.utc), 73.5, 75.0, 73.0, 74.5, 70),
            pipeline.HourlyBar("ZL", "ZL.n.0", datetime(2026, 5, 19, 14, tzinfo=timezone.utc), 74.5, 76.0, 74.0, 75.5, 130),
        ]

        inserted = pipeline.upsert_hourly_bars(
            conn,
            bars,
            http_status=206,
            source_url="https://hist.databento.com/v0/timeseries.get_range",
        )
        daily_rows = pipeline.rollup_daily_rows(conn)
        latest = pipeline.latest_hourly_bar(conn)

        assert inserted == 3
        assert daily_rows[0].bucket_ts == datetime(2026, 5, 18, tzinfo=timezone.utc)
        assert daily_rows[0].open == 73.0
        assert daily_rows[0].high == 75.0
        assert daily_rows[0].low == 72.5
        assert daily_rows[0].close == 74.5
        assert daily_rows[0].volume == 130
        assert latest is not None
        assert latest.close == 75.5
    finally:
        conn.close()


def test_duckdb_workspace_can_stage_then_copy_back_to_project_folder(tmp_path: Path) -> None:
    db_path = tmp_path / "project" / "zinc_fusion_raw.duckdb"
    workspace = pipeline.open_duckdb_workspace(db_path, force_staged=True)
    try:
        inserted = pipeline.upsert_hourly_bars(
            workspace.conn,
            [
                pipeline.HourlyBar(
                    "ZL",
                    "ZL.n.0",
                    datetime(2026, 5, 18, 14, tzinfo=timezone.utc),
                    73.0,
                    74.0,
                    72.5,
                    73.5,
                    120,
                )
            ],
            http_status=206,
            source_url="https://hist.databento.com/v0/timeseries.get_range",
        )
        assert inserted == 1
    finally:
        workspace.close()

    conn = duckdb.connect(str(db_path), read_only=True)
    try:
        latest = pipeline.latest_hourly_bar(conn)
        assert latest is not None
        assert latest.close == 73.5
    finally:
        conn.close()


def test_cli_contract_keeps_duckdb_raw_store_and_supabase_promote_boundary() -> None:
    source = Path(pipeline.__file__).read_text(encoding="utf-8")

    assert "data/duckdb/zinc_fusion_raw.duckdb" in source
    assert "RAW_HOURLY_RELATION" in source
    assert "databento_zl_ohlcv_1h" in source
    assert "mkt.price_1h" in source
    assert "mkt.price_1d" in source
    assert "mkt.latest_price" in source
    assert "supabase db push" not in source.lower()
