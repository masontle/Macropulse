import json
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field, model_validator

from macropulse.config import Settings
from macropulse.data import FEATURES, frame_fingerprint, future_sessions
from macropulse.models import Forecast, PersistenceForecaster, TimesFM3Forecaster, XGBoostForecaster


class ExperimentConfig(BaseModel):
    validation_start: str = "2022-01-01"
    test_start: str = "2024-01-01"
    origin_stride: int = Field(default=5, ge=5)
    refit_every: int = Field(default=20, ge=1)
    max_test_origins: int | None = Field(default=None, ge=1)
    include_timesfm: bool = True
    context_length: int = Field(default=256, ge=32, le=15360)
    batch_size: int = Field(default=4, ge=1, le=32)
    checkpoint_revision: str | None = None
    candidates: list[dict] = [
        {"max_depth": 2, "n_estimators": 150, "learning_rate": 0.03},
        {"max_depth": 3, "n_estimators": 200, "learning_rate": 0.03},
        {"max_depth": 2, "n_estimators": 250, "learning_rate": 0.02},
    ]

    @model_validator(mode="after")
    def check_dates(self):
        if pd.Timestamp(self.validation_start) >= pd.Timestamp(self.test_start):
            raise ValueError("Validation must start before testing.")
        if not self.candidates:
            raise ValueError("At least one XGBoost candidate is required.")
        return self


def forecast_origins(
    frame: pd.DataFrame, start: str, end: str | None, stride: int = 5
) -> pd.DatetimeIndex:
    eligible = frame.dropna(subset=[*FEATURES, "target", "target_end"])
    eligible = eligible.loc[start:]
    if end:
        eligible = eligible.loc[
            (eligible.index < pd.Timestamp(end)) & (eligible["target_end"] < pd.Timestamp(end))
        ]
    return eligible.index[::stride]


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    actual, predicted = np.asarray(actual, dtype=float), np.asarray(predicted, dtype=float)
    if actual.shape != predicted.shape or actual.size == 0:
        raise ValueError("Metrics require nonempty aligned arrays.")
    if not np.isfinite(actual).all() or not np.isfinite(predicted).all():
        raise ValueError("Metrics require finite observations.")
    error = predicted - actual
    return {
        "mae": float(np.mean(np.abs(error))),
        "rmse": float(np.sqrt(np.mean(error**2))),
        "bias": float(error.mean()),
    }


def walk_forward_xgb(
    frame: pd.DataFrame, origins: pd.DatetimeIndex, params: dict, refit_every: int
) -> tuple[list[Forecast], list[str]]:
    model = XGBoostForecaster(params)
    predictions, training_ends = [], []
    for i, origin in enumerate(origins):
        if i % refit_every == 0:
            model.fit(frame, origin)
        predictions.append(model.predict(frame.loc[:origin]))
        training_ends.append(model.last_train_end)
    return predictions, training_ends


def summarize(predictions: pd.DataFrame) -> list[dict]:
    output = []
    for regime in ("all", "calm", "volatile"):
        subset = predictions if regime == "all" else predictions[predictions["regime"] == regime]
        for model, rows in subset.groupby("model"):
            baseline = subset[subset["model"] == "persistence"].set_index("origin")
            paired = baseline.loc[rows["origin"]]
            base_mae = metrics(paired["actual"].to_numpy(), paired["prediction"].to_numpy())["mae"]
            values = metrics(rows["actual"].to_numpy(), rows["prediction"].to_numpy())
            raw = metrics(rows["actual"].to_numpy(), rows["raw_prediction"].to_numpy())
            output.append(
                {
                    "model": model,
                    "regime": regime,
                    "n": len(rows),
                    **values,
                    "improvement_pct": 100 * (1 - values["mae"] / base_mae)
                    if base_mae > 0
                    else None,
                    "latency_ms": float(rows["latency_ms"].mean()),
                    "raw_mae": raw["mae"],
                    "clipped_count": int((rows["raw_prediction"] < 0).sum()),
                }
            )
    return output


@dataclass
class ExperimentResult:
    metadata: dict
    predictions: pd.DataFrame
    scores: list[dict]
    forecasts: dict


def run_experiment(
    frame: pd.DataFrame, provenance: dict, cfg: ExperimentConfig, settings: Settings
) -> ExperimentResult:
    started = time.perf_counter()
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ-") + uuid4().hex[:8]
    validation = forecast_origins(frame, cfg.validation_start, cfg.test_start, cfg.origin_stride)
    test = forecast_origins(frame, cfg.test_start, None, cfg.origin_stride)
    if cfg.max_test_origins:
        test = test[-cfg.max_test_origins :]
    if not len(validation) or not len(test):
        raise ValueError(
            "The supplied data do not cover the configured validation and test periods."
        )
    candidates = []
    for params in cfg.candidates:
        predictions, _ = walk_forward_xgb(frame, validation, params, cfg.refit_every)
        score = metrics(
            frame.loc[validation, "target"].to_numpy(), np.array([p.value for p in predictions])
        )
        candidates.append({"params": params, **score})
    best = min(candidates, key=lambda row: row["mae"])["params"]
    print(f"Validation complete: {len(validation)} origins; selected {best}", flush=True)
    xgb_predictions, train_ends = walk_forward_xgb(frame, test, best, cfg.refit_every)
    histories = [frame.loc[:origin] for origin in test]
    persistence = PersistenceForecaster()
    by_model = {
        "persistence": [persistence.predict(h) for h in histories],
        "xgboost": xgb_predictions,
    }
    states = {
        "persistence": {"status": "available", "information_set": "latest observed trailing RV5"},
        "xgboost": {
            "status": "available",
            "params": best,
            "information_set": "backward-looking price-return features",
        },
        "timesfm3": {
            "status": "disabled",
            "reason": "Run with TimesFM enabled to download and execute genuine weights.",
        },
    }
    tfm = None
    if cfg.include_timesfm:
        tfm = TimesFM3Forecaster(
            settings.data_dir / "model_cache",
            cfg.context_length,
            cfg.batch_size,
            settings.torch_threads,
            cfg.checkpoint_revision,
        )
        print(
            f"Loading genuine TimesFM 3; evaluating {len(test)} test origins on local hardware...",
            flush=True,
        )
        try:
            by_model["timesfm3"] = tfm.predict_many(histories)
            states["timesfm3"] = {"status": "available", **tfm.metadata()}
        except Exception as exc:
            states["timesfm3"] = {
                "status": "unavailable",
                "reason": f"{type(exc).__name__}: {exc}",
                **tfm.metadata(),
            }
            print(f"TimesFM unavailable: {exc}", flush=True)
    rows = []
    for model, forecasts in by_model.items():
        for i, (origin, prediction) in enumerate(zip(test, forecasts, strict=True)):
            rows.append(
                {
                    "origin": origin.strftime("%Y-%m-%d"),
                    "target_end": frame.loc[origin, "target_end"].strftime("%Y-%m-%d"),
                    "model": model,
                    "prediction": prediction.value,
                    "raw_prediction": prediction.raw_value,
                    "actual": float(frame.loc[origin, "target"]),
                    "latency_ms": prediction.latency_ms,
                    "regime": str(frame.loc[origin, "regime"]),
                    "train_label_end": train_ends[i] if model == "xgboost" else None,
                }
            )
    table = pd.DataFrame(rows)
    scores = summarize(table)
    latest_origin = frame.index[-1]
    latest_xgb = XGBoostForecaster(best)
    latest_xgb.fit(frame, latest_origin)
    latest = {
        "persistence": asdict(persistence.predict(frame)),
        "xgboost": asdict(latest_xgb.predict(frame)),
    }
    if "timesfm3" in by_model:
        try:
            latest["timesfm3"] = asdict(tfm.predict(frame))
        except Exception as exc:
            states["timesfm3"]["latest_error"] = str(exc)
    payload = {
        "origin": latest_origin.strftime("%Y-%m-%d"),
        "sessions": future_sessions(latest_origin),
        "generated_at": datetime.now(UTC).isoformat(),
        "models": latest,
    }
    metadata = {
        "run_id": run_id,
        "created_at": datetime.now(UTC).isoformat(),
        "config": cfg.model_dump(),
        "provenance": provenance,
        "processed_sha256": frame_fingerprint(frame),
        "models": states,
        "validation_scores": candidates,
        "validation_origins": len(validation),
        "test_origins": len(test),
        "test_first_origin": test[0].strftime("%Y-%m-%d"),
        "test_last_origin": test[-1].strftime("%Y-%m-%d"),
        "seed": 42,
        "feature_importance": latest_xgb.feature_importance(),
        "duration_seconds": time.perf_counter() - started,
        "versions": {
            p: version(p)
            for p in ["macropulse", "pandas", "numpy", "xgboost", "scikit-learn", "yfinance"]
        },
        "methodology": (
            "Expanding-window, labels matured by refit origin; "
            "validation-only selection; no test-based tuning."
        ),
        "pretraining_caveat": (
            "TimesFM was released in 2026. This retrospective study cannot rule out "
            "pretraining overlap with historical financial observations."
        ),
        "latency_note": (
            "Prediction only; excludes model load and training. "
            "Batched TimesFM wall time is amortized per origin."
        ),
    }
    return ExperimentResult(metadata, table, scores, payload)


def export_experiment(result: ExperimentResult, directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    result.predictions.to_parquet(directory / "predictions.parquet", index=False)
    result.predictions.to_csv(directory / "predictions.csv", index=False)
    for name, data in (
        ("metadata", result.metadata),
        ("metrics", result.scores),
        ("forecasts", result.forecasts),
    ):
        (directory / f"{name}.json").write_text(
            json.dumps(data, indent=2, allow_nan=False), encoding="utf-8"
        )
