"""Adjusted prices, session calendars, and causal features.

The row at t is observable after the NYSE close on t. The target is exactly
the five returns at t+1,...,t+5. Missing sessions are errors, never filled.
"""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import exchange_calendars as xcals
import numpy as np
import pandas as pd

FEATURES = [
    "rv5",
    "rv10",
    "rv21",
    "rv63",
    "return_0",
    "return_1",
    "return_2",
    "return_5",
    "abs_return",
    "abs_mean_5",
    "abs_mean_21",
    "momentum_5",
    "momentum_21",
    "mean_21",
]


class DataError(ValueError):
    pass


def nyse_calendar(start: str, end: str):
    return xcals.get_calendar("XNYS", start=start, end=end)


def completed_sessions(start: str, now: pd.Timestamp | None = None) -> pd.DatetimeIndex:
    now = pd.Timestamp.now(tz="UTC") if now is None else pd.Timestamp(now)
    if now.tzinfo is None:
        now = now.tz_localize("UTC")
    cal = nyse_calendar(start, (now + pd.Timedelta(days=10)).strftime("%Y-%m-%d"))
    schedule = cal.schedule.loc[start : now.strftime("%Y-%m-%d")]
    # Allow 20 minutes for vendor publication, including early closing sessions.
    closed = schedule[schedule["close"] + pd.Timedelta(minutes=20) <= now]
    return pd.DatetimeIndex(closed.index).tz_localize(None).normalize()


def future_sessions(origin: str | pd.Timestamp, horizon: int = 5) -> list[str]:
    day = pd.Timestamp(origin).tz_localize(None).normalize()
    cal = nyse_calendar(
        day.strftime("%Y-%m-%d"), (day + pd.Timedelta(days=60)).strftime("%Y-%m-%d")
    )
    sessions = cal.sessions_in_range(day + pd.Timedelta(days=1), day + pd.Timedelta(days=45))
    return [s.strftime("%Y-%m-%d") for s in sessions[:horizon]]


def validate_prices(prices: pd.DataFrame, expected: pd.DatetimeIndex | None = None) -> None:
    if len(prices) < 70:
        raise DataError("At least 70 completed trading sessions are required.")
    if not isinstance(prices.index, pd.DatetimeIndex):
        raise DataError("Prices must use a DatetimeIndex.")
    if prices.index.has_duplicates or not prices.index.is_monotonic_increasing:
        raise DataError("Trading dates must be unique and sorted.")
    for column in ("adjusted_close", "close"):
        values = prices[column].to_numpy()
        if not np.isfinite(values).all() or (values <= 0).any():
            raise DataError(f"{column} must contain finite, positive prices.")
    if expected is not None:
        missing = expected.difference(prices.index)
        if len(missing):
            raise DataError(f"Missing {len(missing)} NYSE sessions; first: {missing[0].date()}.")


def process_prices(prices: pd.DataFrame) -> pd.DataFrame:
    validate_prices(prices)
    frame = prices.copy()
    r = np.log(frame["adjusted_close"] / frame["adjusted_close"].shift(1))
    frame["return"] = r
    for window in (5, 10, 21, 63):
        frame[f"rv{window}"] = np.sqrt(252 / window * r.pow(2).rolling(window).sum())
    # trailing RV at t+5 uses exactly r[t+1],...,r[t+5].
    frame["target"] = frame["rv5"].shift(-5)
    frame["target_end"] = pd.Series(frame.index, index=frame.index).shift(-5)
    for lag in (0, 1, 2, 5):
        frame[f"return_{lag}"] = r.shift(lag)
    frame["abs_return"] = r.abs()
    for window in (5, 21):
        frame[f"abs_mean_{window}"] = r.abs().rolling(window).mean()
        frame[f"momentum_{window}"] = r.rolling(window).sum()
    frame["mean_21"] = r.rolling(21).mean()
    # Regime threshold is available at the origin; no full-sample quantiles.
    frame["regime_threshold"] = frame["rv5"].expanding(min_periods=63).median()
    frame["regime"] = np.where(frame["rv5"] > frame["regime_threshold"], "volatile", "calm")
    frame.index.name = "date"
    return frame


def frame_fingerprint(frame: pd.DataFrame) -> str:
    return hashlib.sha256(
        pd.util.hash_pandas_object(frame, index=True).values.tobytes()
    ).hexdigest()


def download_prices(data_dir: Path, force: bool = False) -> tuple[pd.DataFrame, dict]:
    import yfinance as yf

    raw = data_dir / "raw"
    processed = data_dir / "processed"
    raw.mkdir(parents=True, exist_ok=True)
    processed.mkdir(parents=True, exist_ok=True)
    now = pd.Timestamp.now(tz="UTC")
    expected = completed_sessions("2015-01-01", now)
    if expected.empty:
        raise DataError("No completed sessions found.")
    path = raw / "spy.parquet"
    metadata_path = raw / "provenance.json"
    cached_meta = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
    if (
        path.exists()
        and not force
        and cached_meta.get("last_session") == expected[-1].strftime("%Y-%m-%d")
    ):
        prices = pd.read_parquet(path)
        validate_prices(prices, expected)
        frame = process_prices(prices)
        frame.to_parquet(processed / "spy.parquet")
        return frame, cached_meta
    # end is exclusive; auto_adjust=False preserves raw close and total-return adjusted close.
    downloaded = yf.download(
        "SPY",
        start="2015-01-01",
        end=(expected[-1] + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        auto_adjust=False,
        progress=False,
        threads=False,
        timeout=30,
    )
    if downloaded.empty:
        raise DataError(
            "Yahoo Finance returned no SPY data. Retry refresh; no synthetic fallback is used."
        )
    if isinstance(downloaded.columns, pd.MultiIndex):
        downloaded.columns = downloaded.columns.get_level_values(0)
    downloaded.index = pd.to_datetime(downloaded.index).tz_localize(None).normalize()
    prices = downloaded.rename(
        columns={"Adj Close": "adjusted_close", "Close": "close", "Volume": "volume"}
    )
    prices = prices[["adjusted_close", "close", "volume"]].loc[lambda x: x.index.isin(expected)]
    prices = prices.sort_index()
    validate_prices(prices, expected)
    prices.index.name = "date"
    fingerprint = frame_fingerprint(prices)
    metadata = {
        "source": "Yahoo Finance via yfinance",
        "symbol": "SPY",
        "start": "2015-01-01",
        "retrieved_at": datetime.now(UTC).isoformat(),
        "rows": len(prices),
        "last_session": prices.index[-1].strftime("%Y-%m-%d"),
        "sha256": fingerprint,
        "price_basis": "adjusted_close for returns; close for displayed market price",
        "point_in_time_note": (
            "Vendor history is a retrieval-time snapshot; historical revisions may occur."
        ),
        "yfinance_version": yf.__version__,
    }
    prices.to_parquet(path)
    # Immutable snapshots permit reproduction after a later vendor refresh.
    prices.to_parquet(raw / f"spy-{fingerprint[:16]}.parquet")
    metadata_path.write_text(json.dumps(metadata, indent=2))
    frame = process_prices(prices)
    frame.to_parquet(processed / "spy.parquet")
    return frame, metadata
