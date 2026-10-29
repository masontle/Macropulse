import numpy as np
import pandas as pd
import pytest
from macropulse.config import Settings
from macropulse.data import FEATURES
from macropulse.evaluation import ExperimentConfig, forecast_origins, metrics, run_experiment
from macropulse.models import XGBoostForecaster


def test_nonoverlapping_origins_and_purged_validation_boundary(frame):
    validation = forecast_origins(frame, "2022-01-01", "2024-01-01")
    test = forecast_origins(frame, "2024-01-01", None)
    assert (frame.loc[validation, "target_end"] < pd.Timestamp("2024-01-01")).all()
    assert validation.max() < test.min()
    assert np.all(np.diff(frame.index.get_indexer(test)) == 5)
    assert (frame.loc[test[:-1], "target_end"].to_numpy() <= test[1:].to_numpy()).all()


def test_training_excludes_unmatured_labels(frame, monkeypatch):
    model = XGBoostForecaster({"max_depth": 2, "n_estimators": 5, "learning_rate": 0.1})
    seen = {}

    def record_fit(x, y):
        seen["dates"] = x.index
        assert list(x.columns) == FEATURES
        assert x.index.equals(y.index)

    monkeypatch.setattr(model.model, "fit", record_fit)
    origin = pd.Timestamp("2024-01-02")
    model.fit(frame, origin)
    assert (frame.loc[seen["dates"], "target_end"] <= origin).all()
    assert (seen["dates"] < origin).all()
    assert frame.loc[origin, "target_end"] > origin


def test_metric_values_and_invalid_inputs():
    score = metrics(np.array([0.1, 0.2]), np.array([0.12, 0.18]))
    assert score["mae"] == pytest.approx(0.02)
    assert score["rmse"] == pytest.approx(0.02)
    assert score["bias"] == pytest.approx(0)
    for a, b in (([], []), ([1], [1, 2]), ([np.nan], [1])):
        with pytest.raises(ValueError):
            metrics(np.array(a), np.array(b))


def test_complete_baseline_experiment_is_reproducible(frame, tmp_path):
    config = ExperimentConfig(
        include_timesfm=False,
        max_test_origins=3,
        candidates=[{"max_depth": 2, "n_estimators": 5, "learning_rate": 0.1}],
    )
    settings = Settings(data_dir=tmp_path)
    provenance = {"source": "synthetic unit-test fixture", "last_session": "2026-10-28"}
    first = run_experiment(frame, provenance, config, settings)
    second = run_experiment(frame, provenance, config, settings)
    assert len(first.predictions) == 6
    assert first.metadata["models"]["timesfm3"]["status"] == "disabled"
    pd.testing.assert_series_equal(
        first.predictions["prediction"], second.predictions["prediction"]
    )
    assert first.predictions.groupby("origin")["actual"].nunique().eq(1).all()
    assert set(first.predictions["model"]) == {"persistence", "xgboost"}
    for row in first.predictions.query("model == 'xgboost'").itertuples():
        assert row.train_label_end <= row.origin


def test_experiment_config_requires_valid_splits():
    with pytest.raises(ValueError):
        ExperimentConfig(validation_start="2025-01-01", test_start="2024-01-01")
    with pytest.raises(ValueError):
        ExperimentConfig(origin_stride=1)
