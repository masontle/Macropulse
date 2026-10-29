"""Read-only API over persisted research artifacts; no per-request inference."""

from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from macropulse.config import Settings, settings
from macropulse.storage import ResearchStore, read_market


class MarketRow(BaseModel):
    date: str
    close: float
    adjusted_close: float
    volume: int
    log_return: float | None
    rv5: float | None
    rv21: float | None


class MarketResponse(BaseModel):
    symbol: str
    data: list[MarketRow]
    last_session: str


class StatusResponse(BaseModel):
    status: str
    market_available: bool
    experiment_available: bool
    last_session: str | None
    run_id: str | None
    models: dict[str, Any]


class ResearchResponse(BaseModel):
    metadata: dict[str, Any]
    metrics: list[dict[str, Any]]
    forecasts: dict[str, Any]


class PredictionRow(BaseModel):
    run_id: str
    origin: str
    target_end: str
    model: str
    prediction: float
    raw_prediction: float
    actual: float
    latency_ms: float
    regime: str
    train_label_end: str | None


def create_app(config: Settings | None = None) -> FastAPI:
    config = config or settings
    app = FastAPI(
        title="MacroPulse Research API",
        version="0.1.0",
        description=(
            "Local SPY volatility research. All results come from persisted genuine experiments."
        ),
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    store = ResearchStore(config.database)

    def require_run(run_id: str | None = None):
        run = store.latest(run_id)
        if run is None:
            raise HTTPException(404, "No matching experiment. Run: macropulse experiment")
        return run

    def check_range(start: date | None, end: date | None):
        if start and end and start > end:
            raise HTTPException(422, "start must be on or before end")

    @app.get("/api/status", response_model=StatusResponse)
    def status():
        market = read_market(config.data_dir)
        run = store.latest()
        return {
            "status": "ready" if market is not None and run else "setup_required",
            "market_available": market is not None,
            "experiment_available": run is not None,
            "last_session": market.index[-1].strftime("%Y-%m-%d") if market is not None else None,
            "run_id": run["metadata"]["run_id"] if run else None,
            "models": run["metadata"]["models"] if run else {},
        }

    @app.get("/api/market", response_model=MarketResponse)
    def market(
        start: date | None = None, end: date | None = None, limit: int = Query(4000, ge=1, le=10000)
    ):
        check_range(start, end)
        frame = read_market(config.data_dir)
        if frame is None:
            raise HTTPException(503, "Market data unavailable. Run: macropulse refresh")
        last = frame.index[-1].strftime("%Y-%m-%d")
        if start:
            frame = frame.loc[str(start) :]
        if end:
            frame = frame.loc[: str(end)]
        frame = frame.tail(limit)

        def finite(value):
            return float(value) if np.isfinite(value) else None

        return {
            "symbol": "SPY",
            "last_session": last,
            "data": [
                {
                    "date": idx.strftime("%Y-%m-%d"),
                    "close": float(row["close"]),
                    "adjusted_close": float(row["adjusted_close"]),
                    "volume": int(row["volume"]),
                    "log_return": finite(row["return"]),
                    "rv5": finite(row["rv5"]),
                    "rv21": finite(row["rv21"]),
                }
                for idx, row in frame.iterrows()
            ],
        }

    @app.get("/api/volatility")
    def volatility(start: date | None = None, end: date | None = None):
        payload = market(start, end, 10000)
        return {
            "symbol": "SPY",
            "annualization": 252,
            "data": [{k: row[k] for k in ("date", "rv5", "rv21")} for row in payload["data"]],
        }

    @app.get("/api/research", response_model=ResearchResponse)
    def research(run_id: str | None = None):
        return require_run(run_id)

    @app.get("/api/forecasts")
    def forecasts(run_id: str | None = None):
        return require_run(run_id)["forecasts"]

    @app.get("/api/performance")
    def performance(
        run_id: str | None = None, regime: str = Query("all", pattern="^(all|calm|volatile)$")
    ):
        return {"metrics": [r for r in require_run(run_id)["metrics"] if r["regime"] == regime]}

    @app.get("/api/backtests", response_model=list[PredictionRow])
    def backtests(run_id: str | None = None, start: date | None = None, end: date | None = None):
        check_range(start, end)
        run = require_run(run_id)
        return store.predictions(
            run["metadata"]["run_id"], str(start) if start else None, str(end) if end else None
        )

    @app.get("/api/models")
    def models(run_id: str | None = None):
        return require_run(run_id)["metadata"]["models"]

    @app.get("/api/runs")
    def runs():
        return store.runs()

    # Vite's compiled application can also be served from the same local process.
    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="dashboard")
    return app


app = create_app()
