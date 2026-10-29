import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from macropulse.api import create_app
from macropulse.config import ROOT, Settings
from macropulse.data import (
    DataError,
    atomic_json,
    atomic_parquet,
    frame_fingerprint,
    load_verified_prices,
)
from macropulse.evaluation import ExperimentConfig, forecast_origins, metrics, validate_predictions
from macropulse.models import Forecast, TimesFM3Forecaster
from macropulse.storage import read_market


def seed(prices, directory):
    digest = frame_fingerprint(prices)
    meta = {
        "source": "unit-test fixture",
        "sha256": digest,
        "rows": len(prices),
        "last_session": prices.index[-1].strftime("%Y-%m-%d"),
    }
    atomic_parquet(prices, directory / "raw" / "spy.parquet")
    atomic_parquet(prices, directory / "raw" / f"spy-{digest[:16]}.parquet")
    atomic_json(meta, directory / "raw" / "provenance.json")
    return meta


def test_modified_raw_cache_cannot_silently_change_results(prices, tmp_path):
    seed(prices, tmp_path)
    changed = prices.copy()
    changed.iloc[100, 0] *= 2
    atomic_parquet(changed, tmp_path / "raw" / "spy.parquet")
    with pytest.raises(DataError, match="fingerprint mismatch"):
        load_verified_prices(tmp_path)
    response = TestClient(create_app(Settings(data_dir=tmp_path))).get("/api/market")
    assert response.status_code == 503
    assert "fingerprint mismatch" in response.json()["detail"]


def test_corrupted_processed_cache_is_not_used_for_research(prices, tmp_path):
    seed(prices, tmp_path)
    (tmp_path / "processed").mkdir()
    (tmp_path / "processed" / "spy.parquet").write_bytes(b"corrupt processed file")
    frame = read_market(tmp_path)
    assert frame["close"].iloc[-1] == prices["close"].iloc[-1]
    assert np.isfinite(frame["rv5"].iloc[-1])


def test_atomic_write_failure_preserves_prior_dataset(prices, tmp_path, monkeypatch):
    destination = tmp_path / "prices.parquet"
    atomic_parquet(prices, destination)
    before = destination.read_bytes()

    def interrupted(self, path):
        path.write_bytes(b"partial")
        raise OSError("disk interrupted")

    monkeypatch.setattr(pd.DataFrame, "to_parquet", interrupted)
    with pytest.raises(OSError):
        atomic_parquet(prices, destination)
    assert destination.read_bytes() == before
    assert not list(tmp_path.glob("*.tmp"))


def test_invalid_rows_do_not_shift_the_forecast_grid(frame):
    original = forecast_origins(frame, "2024-01-01", None)
    changed = frame.copy()
    changed.loc[original[1], "rv21"] = np.nan
    filtered = forecast_origins(changed, "2024-01-01", None)
    assert filtered.equals(original.delete(1))


@pytest.mark.parametrize(
    "values",
    [
        {"test_start": "NaT"},
        {"validation_start": "20220101"},
        {"candidates": [{"max_depth": 0, "n_estimators": 10, "learning_rate": 0.1}]},
        {"candidates": [{"max_depth": 2, "n_estimators": 10, "learning_rate": float("nan")}]},
        {
            "candidates": [
                {"max_depth": 2, "n_estimators": 10, "learning_rate": 0.1, "random_state": 123}
            ]
        },
        {"unexpected_config_typo": True},
    ],
)
def test_bad_experiment_settings_fail_before_inference(values):
    with pytest.raises(ValueError):
        ExperimentConfig(**values)


def test_nan_forecasts_and_two_dimensional_metrics_are_rejected():
    with pytest.raises(ValueError):
        Forecast(0, float("nan"), 1)
    with pytest.raises(ValueError):
        metrics(np.ones((2, 1)), np.ones((2, 1)))


def test_timesfm_does_not_bridge_a_missing_context_session(frame, tmp_path, monkeypatch):
    broken = frame.iloc[:200].copy()
    broken.iloc[-5, broken.columns.get_loc("rv5")] = np.nan
    model = TimesFM3Forecaster(tmp_path)

    def should_not_load():
        pytest.fail("Invalid contexts must be rejected before loading expensive weights")

    monkeypatch.setattr(model, "load", should_not_load)
    with pytest.raises(ValueError, match="finite"):
        model.predict(broken)


def test_relative_data_directory_is_anchored_to_project():
    assert Settings(data_dir="custom-data").data_dir == ROOT / "custom-data"


def test_snapshot_provenance_must_match_dates_and_row_count(prices, tmp_path):
    provenance = seed(prices, tmp_path)
    provenance["rows"] += 1
    atomic_json(provenance, tmp_path / "raw" / "provenance.json")
    with pytest.raises(DataError, match="row count"):
        load_verified_prices(tmp_path)


def test_unmatched_model_targets_are_never_ranked():
    rows = [
        {
            "origin": "2024-01-02",
            "target_end": "2024-01-09",
            "model": m,
            "prediction": 0.2,
            "raw_prediction": 0.2,
            "actual": a,
            "latency_ms": 1,
            "regime": "calm",
        }
        for m, a in (("persistence", 0.1), ("xgboost", 0.3))
    ]
    with pytest.raises(ValueError, match="identical outcomes"):
        validate_predictions(pd.DataFrame(rows))


@pytest.mark.parametrize("value", [[], {"sha256": 123}, {"sha256": "../outside"}])
def test_malformed_provenance_is_rejected_cleanly(prices, tmp_path, value):
    seed(prices, tmp_path)
    (tmp_path / "raw" / "provenance.json").write_text(json.dumps(value), encoding="utf-8")
    with pytest.raises(DataError):
        load_verified_prices(tmp_path)


def test_force_refresh_can_repair_broken_provenance(prices, tmp_path, monkeypatch):
    import yfinance
    from macropulse.data import download_prices

    seed(prices, tmp_path)
    (tmp_path / "raw" / "provenance.json").write_text("{broken", encoding="utf-8")
    monkeypatch.setattr("macropulse.data.completed_sessions", lambda *a, **k: prices.index)
    provider = prices.rename(
        columns={"adjusted_close": "Adj Close", "close": "Close", "volume": "Volume"}
    )
    monkeypatch.setattr(yfinance, "download", lambda *a, **k: provider.copy())
    with pytest.raises(DataError, match="unreadable"):
        download_prices(tmp_path)
    repaired, provenance = download_prices(tmp_path, force=True)
    assert len(repaired) == len(prices)
    assert provenance["sha256"] == frame_fingerprint(prices)


def test_renamed_price_columns_cannot_bypass_a_legacy_value_hash(prices, tmp_path):
    seed(prices, tmp_path)
    renamed = prices.rename(columns={"close": "adjusted_close", "adjusted_close": "close"})
    # The old fingerprint hashes row values, so an explicit schema check is essential.
    assert frame_fingerprint(renamed) == frame_fingerprint(prices)
    atomic_parquet(renamed, tmp_path / "raw" / "spy.parquet")
    with pytest.raises(DataError, match="canonical"):
        load_verified_prices(tmp_path)
