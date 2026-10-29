import os
from types import SimpleNamespace

import numpy as np
import pytest
from macropulse.config import settings
from macropulse.data import future_sessions
from macropulse.models import TimesFM3Forecaster
from macropulse.storage import read_market


def test_timesfm_adapter_shape_fifth_step_and_negative_handling(frame, tmp_path):
    calls = []

    class FakeOfficialModel:
        def predict_batch(self, contexts, **kwargs):
            calls.append((contexts, kwargs))
            return [
                SimpleNamespace(
                    forecast=np.array([0.1, 0.2, 0.3, 0.4, -0.05]),
                    quantiles=np.tile(np.linspace(-0.1, 0.7, 9), (5, 1)),
                )
                for _ in contexts
            ]

    model = TimesFM3Forecaster(tmp_path, context_length=64)
    model._model = (
        FakeOfficialModel()
    )  # Mocked unit test; never reported as genuine model inference.
    result = model.predict_many([frame.iloc[:200], frame.iloc[:210]])
    assert len(result) == 2
    assert result[0].raw_value == -0.05
    assert result[0].value == 0
    assert len(result[0].path) == 5
    assert len(calls[0][0][0]) == 64
    assert calls[0][1]["horizon"] == 5
    assert calls[0][1]["make_positive"] is False
    np.testing.assert_allclose(calls[0][0][0], frame["rv5"].iloc[:200].dropna().to_numpy()[-64:])


def test_timesfm_rejects_incorrect_official_output(frame, tmp_path):
    model = TimesFM3Forecaster(tmp_path)
    model._model = SimpleNamespace(
        predict_batch=lambda *a, **k: [
            SimpleNamespace(forecast=np.ones(4), quantiles=np.ones((5, 9)))
        ]
    )
    with pytest.raises(ValueError, match="shapes"):
        model.predict(frame.iloc[:200])


@pytest.mark.integration
@pytest.mark.skipif(
    os.environ.get("MACROPULSE_RUN_TIMESFM_TEST") != "1",
    reason="Opt-in real pretrained-weight inference",
)
def test_genuine_timesfm_checkpoint_on_actual_market_history():
    frame = read_market(settings.data_dir)
    assert frame is not None, "Run macropulse refresh first"
    model = TimesFM3Forecaster(settings.data_dir / "model_cache", context_length=64, batch_size=1)
    result = model.predict(frame)
    assert np.isfinite(result.value) and result.value >= 0
    assert len(result.path) == 5
    assert len(future_sessions(frame.index[-1])) == len(result.path)
    assert model.metadata()["checkpoint"] == "google/timesfm-3.0-pytorch"
