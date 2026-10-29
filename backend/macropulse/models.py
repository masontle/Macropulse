"""Common forecast contract; downloaded TimesFM weights stay local."""

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from macropulse.data import FEATURES

CHECKPOINT = "google/timesfm-3.0-pytorch"
TIMESFM_SOURCE_REVISION = "e51928e27119cb17bebc005be2696b75e0a9e688"


@dataclass
class Forecast:
    value: float
    raw_value: float
    latency_ms: float
    path: list[float] | None = None
    lower: list[float] | None = None
    upper: list[float] | None = None

    def __post_init__(self):
        if not np.isfinite([self.value, self.raw_value, self.latency_ms]).all():
            raise ValueError("Forecasts and inference latency must be finite.")
        if self.value < 0 or self.latency_ms < 0:
            raise ValueError("Published volatility and latency cannot be negative.")


class Forecaster(Protocol):
    name: str

    def predict(self, history: pd.DataFrame) -> Forecast: ...


class PersistenceForecaster:
    name = "persistence"

    def predict(self, history: pd.DataFrame) -> Forecast:
        start = time.perf_counter()
        value = float(history["rv5"].iloc[-1])
        return Forecast(value, value, (time.perf_counter() - start) * 1000)


class XGBoostForecaster:
    name = "xgboost"

    def __init__(self, params: dict | None = None):
        self.params = params or {"max_depth": 2, "n_estimators": 150, "learning_rate": 0.03}
        self.model = XGBRegressor(
            **self.params,
            objective="reg:squarederror",
            random_state=42,
            n_jobs=4,
            subsample=1.0,
            colsample_bytree=1.0,
            reg_lambda=10,
        )
        self.last_train_end: str | None = None

    def fit(self, data: pd.DataFrame, origin: pd.Timestamp) -> None:
        # A row at t becomes eligible only after its forward label has fully matured.
        train = data.loc[(data.index < origin) & (data["target_end"] <= origin)]
        train = train.dropna(subset=[*FEATURES, "target"])
        if len(train) < 100:
            raise ValueError("Insufficient causally available training labels.")
        if not (train["target_end"] <= origin).all():
            raise AssertionError("An unmatured label reached training.")
        self.model.fit(train[FEATURES], train["target"])
        self.last_train_end = train["target_end"].max().strftime("%Y-%m-%d")

    def predict(self, history: pd.DataFrame) -> Forecast:
        start = time.perf_counter()
        raw = float(self.model.predict(history[FEATURES].iloc[[-1]])[0])
        return Forecast(max(0.0, raw), raw, (time.perf_counter() - start) * 1000)

    def feature_importance(self) -> list[dict]:
        values = zip(FEATURES, self.model.feature_importances_, strict=True)
        return sorted(
            [{"feature": name, "importance": float(value)} for name, value in values],
            key=lambda item: item["importance"],
            reverse=True,
        )


class TimesFM3Forecaster:
    name = "timesfm3"

    def __init__(
        self,
        cache_dir: Path,
        context_length: int = 256,
        batch_size: int = 4,
        threads: int = 4,
        revision: str | None = None,
    ):
        if not 32 <= context_length <= 15360 or batch_size < 1 or threads < 1:
            raise ValueError("Invalid TimesFM context length, batch size, or thread count.")
        self.cache_dir = cache_dir
        self.context_length = context_length
        self.batch_size = batch_size
        self.threads = threads
        self.revision = revision
        self.device: str | None = None
        self.load_ms: float | None = None
        self._model = None

    def load(self) -> None:
        if self._model is not None:
            return
        start = time.perf_counter()
        import torch
        from huggingface_hub import HfApi
        from timesfm3 import ModelConfig, TimesFM3Evaluator

        torch.set_num_threads(self.threads)
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        revision_path = self.cache_dir / "checkpoint_revision.json"
        if self.revision is None:
            if revision_path.exists():
                saved = json.loads(revision_path.read_text())
                if saved.get("checkpoint") != CHECKPOINT:
                    raise ValueError("Cached checkpoint identity does not match TimesFM 3.")
                self.revision = saved["revision"]
            else:
                self.revision = HfApi().model_info(CHECKPOINT).sha
                revision_path.write_text(
                    json.dumps({"checkpoint": CHECKPOINT, "revision": self.revision})
                )
        if not re.fullmatch(r"[a-f0-9]{40}", self.revision or ""):
            self.revision = HfApi().model_info(CHECKPOINT, revision=self.revision).sha
        self._model = TimesFM3Evaluator(
            ModelConfig(
                checkpoint_path=CHECKPOINT,
                device=self.device,
                per_core_batch_size=self.batch_size,
                cache_dir=str(self.cache_dir),
                revision=self.revision,
            )
        )
        self.load_ms = (time.perf_counter() - start) * 1000

    def predict_many(self, histories: list[pd.DataFrame]) -> list[Forecast]:
        if not histories:
            return []
        contexts = []
        for history in histories:
            values = history["rv5"].to_numpy(dtype=np.float32)
            positions = np.flatnonzero(~np.isnan(values))
            context = (
                values[positions[0] :][-self.context_length :] if len(positions) else values[:0]
            )
            contexts.append(context)
        if any(len(c) < 32 or not np.isfinite(c).all() for c in contexts):
            raise ValueError(
                "TimesFM requires at least 32 finite trailing-volatility observations."
            )
        self.load()
        predictions = []
        for offset in range(0, len(contexts), self.batch_size):
            batch = contexts[offset : offset + self.batch_size]
            start = time.perf_counter()
            outputs = list(
                self._model.predict_batch(
                    batch,
                    horizon=5,
                    return_quantiles=True,
                    use_symmetric_averaging=False,
                    make_positive=False,
                )
            )
            latency = (time.perf_counter() - start) * 1000 / len(batch)
            if len(outputs) != len(batch):
                raise ValueError("TimesFM returned an unexpected batch size.")
            for output in outputs:
                path = np.asarray(output.forecast, dtype=float)
                quantiles = np.asarray(output.quantiles, dtype=float)
                if path.shape != (5,) or quantiles.shape != (5, 9):
                    raise ValueError(
                        f"Unexpected TimesFM output shapes: {path.shape}, {quantiles.shape}"
                    )
                if not np.isfinite(path).all() or not np.isfinite(quantiles).all():
                    raise ValueError("TimesFM returned nonfinite predictions.")
                predictions.append(
                    Forecast(
                        value=float(max(0, path[4])),
                        raw_value=float(path[4]),
                        latency_ms=latency,
                        path=np.maximum(path, 0).tolist(),
                        lower=np.maximum(quantiles[:, 0], 0).tolist(),
                        upper=np.maximum(quantiles[:, -1], 0).tolist(),
                    )
                )
        return predictions

    def predict(self, history: pd.DataFrame) -> Forecast:
        return self.predict_many([history])[0]

    def metadata(self) -> dict:
        return {
            "checkpoint": CHECKPOINT,
            "checkpoint_revision": self.revision,
            "source_revision": TIMESFM_SOURCE_REVISION,
            "context_length": self.context_length,
            "batch_size": self.batch_size,
            "device": self.device,
            "load_ms": self.load_ms,
            "license": "timesfm-non-commercial-license-v1.0",
            "negative_handling": (
                "clip point forecast and quantiles at zero; retain raw endpoint for evaluation"
            ),
            "interval": "10th–90th model quantiles, not a calibrated confidence interval",
        }
