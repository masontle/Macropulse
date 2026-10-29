import sqlite3
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from macropulse.api import create_app
from macropulse.config import Settings
from macropulse.data import atomic_json, atomic_parquet, frame_fingerprint
from macropulse.evaluation import ExperimentConfig, run_experiment
from macropulse.storage import ResearchStore


def seed_prices(frame, directory):
    raw = frame[["adjusted_close", "close", "volume"]]
    digest = frame_fingerprint(raw)
    provenance = {
        "source": "synthetic unit-test fixture",
        "sha256": digest,
        "last_session": raw.index[-1].strftime("%Y-%m-%d"),
        "rows": len(raw),
    }
    atomic_parquet(raw, directory / "raw" / "spy.parquet")
    atomic_parquet(raw, directory / "raw" / f"spy-{digest[:16]}.parquet")
    atomic_json(provenance, directory / "raw" / "provenance.json")
    return provenance


def test_empty_workspace_and_validation(tmp_path):
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    status = client.get("/api/status")
    assert status.status_code == 200
    assert status.json()["status"] == "setup_required"
    assert client.get("/api/market").status_code == 503
    assert client.get("/api/research").status_code == 404
    assert client.get("/api/market?limit=0").status_code == 422
    assert client.get("/api/market?start=not-a-date").status_code == 422
    assert client.get("/api/market?start=2025-01-01&end=2024-01-01").status_code == 422
    assert client.get("/api/performance?regime=future-defined").status_code == 422


@pytest.fixture
def populated(frame, tmp_path, monkeypatch):
    settings = Settings(data_dir=tmp_path)
    provenance = seed_prices(frame, tmp_path)

    def unavailable(*args, **kwargs):
        raise RuntimeError("Checkpoint unavailable in this unit test")

    monkeypatch.setattr("macropulse.models.TimesFM3Forecaster.predict_many", unavailable)
    result = run_experiment(
        frame,
        provenance,
        ExperimentConfig(
            max_test_origins=2,
            candidates=[{"max_depth": 2, "n_estimators": 5, "learning_rate": 0.1}],
        ),
        settings,
    )
    store = ResearchStore(settings.database)
    store.save(result)
    return TestClient(create_app(settings)), result, store


def test_all_data_endpoints_and_unavailable_model(populated):
    client, result, _ = populated
    for endpoint in (
        "status",
        "market",
        "volatility",
        "research",
        "forecasts",
        "performance",
        "backtests",
        "models",
        "runs",
    ):
        response = client.get(f"/api/{endpoint}")
        assert response.status_code == 200, (endpoint, response.text)
    market = client.get("/api/market?limit=10").json()
    assert len(market["data"]) == 10
    assert market["data"][-1]["date"] == "2026-10-28"
    assert client.get("/api/models").json()["timesfm3"]["status"] == "unavailable"
    assert "timesfm3" not in client.get("/api/forecasts").json()["models"]
    rows = client.get("/api/backtests").json()
    assert len(rows) == 4
    assert set(r["model"] for r in rows) == {"persistence", "xgboost"}
    assert client.get("/api/research?run_id=missing").status_code == 404
    origin = result.predictions["origin"].max()
    assert len(client.get(f"/api/backtests?start={origin}&end={origin}").json()) == 2


def test_sqlite_save_is_atomic_and_rejects_duplicate_run(populated):
    _, result, store = populated
    before = store.predictions(result.metadata["run_id"])
    with pytest.raises(sqlite3.IntegrityError):
        store.save(result)
    assert store.predictions(result.metadata["run_id"]) == before
    assert len(store.runs()) == 1


def test_null_warmup_values_are_serialized_as_null(frame, tmp_path):
    seed_prices(frame, tmp_path)
    client = TestClient(create_app(Settings(data_dir=tmp_path)))
    first = frame.index[0].strftime("%Y-%m-%d")
    response = client.get(f"/api/market?start={first}&end={first}")
    assert response.status_code == 200
    assert response.json()["data"][0]["log_return"] is None
    assert response.json()["data"][0]["rv5"] is None


def test_historical_run_uses_its_immutable_price_snapshot(populated, frame):
    client, result, store = populated
    original = float(frame["close"].iloc[-1])
    changed = frame.copy()
    changed.iloc[-1, changed.columns.get_loc("close")] *= 1.2
    seed_prices(changed, store.path.parent)
    current = client.get("/api/market?limit=1").json()
    archived = client.get(f"/api/market?limit=1&run_id={result.metadata['run_id']}").json()
    assert current["data"][0]["close"] != original
    assert archived["data"][0]["close"] == original
    assert archived["snapshot"] == "experiment"


def test_missing_experiment_snapshot_returns_a_clear_error(populated):
    client, result, store = populated
    digest = result.metadata["provenance"]["sha256"]
    (store.path.parent / "raw" / f"spy-{digest[:16]}.parquet").unlink()
    response = client.get(f"/api/market?run_id={result.metadata['run_id']}")
    assert response.status_code == 503
    assert "snapshot" in response.json()["detail"]


def test_persistence_does_not_depend_on_dataframe_column_order(populated):
    _, result, store = populated
    reordered = replace(
        result,
        metadata={**result.metadata, "run_id": "reordered-columns"},
        predictions=result.predictions.loc[:, result.predictions.columns[::-1]],
    )
    store.save(reordered)
    stored = store.predictions("reordered-columns")
    assert len(stored) == len(result.predictions)
    original = result.predictions.set_index(["origin", "model"])
    for row in stored:
        assert row["prediction"] == original.loc[(row["origin"], row["model"]), "prediction"]
        assert row["actual"] == original.loc[(row["origin"], row["model"]), "actual"]
