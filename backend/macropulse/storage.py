import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pandas as pd

from macropulse.data import load_verified_prices, process_prices
from macropulse.evaluation import ExperimentResult, validate_predictions


class ResearchStore:
    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.execute("PRAGMA journal_mode=WAL")
            con.execute(
                "CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, "
                "created_at TEXT NOT NULL, metadata TEXT NOT NULL, scores TEXT NOT NULL, "
                "forecasts TEXT NOT NULL)"
            )
            con.execute(
                "CREATE TABLE IF NOT EXISTS predictions (run_id TEXT NOT NULL, "
                "origin TEXT NOT NULL, target_end TEXT NOT NULL, model TEXT NOT NULL, "
                "prediction REAL NOT NULL, raw_prediction REAL NOT NULL, actual REAL NOT NULL, "
                "latency_ms REAL NOT NULL, regime TEXT NOT NULL, train_label_end TEXT, "
                "PRIMARY KEY (run_id, origin, model), FOREIGN KEY (run_id) REFERENCES runs(run_id))"
            )

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        try:
            with con:
                yield con
        finally:
            con.close()

    def save(self, result: ExperimentResult):
        validate_predictions(result.predictions)
        columns = [
            "origin",
            "target_end",
            "model",
            "prediction",
            "raw_prediction",
            "actual",
            "latency_ms",
            "regime",
            "train_label_end",
        ]
        # One transaction: readers see either the prior complete experiment or this complete one.
        with self.connect() as con:
            con.execute(
                "INSERT INTO runs VALUES (?, ?, ?, ?, ?)",
                (
                    result.metadata["run_id"],
                    result.metadata["created_at"],
                    json.dumps(result.metadata, allow_nan=False),
                    json.dumps(result.scores, allow_nan=False),
                    json.dumps(result.forecasts, allow_nan=False),
                ),
            )
            con.executemany(
                "INSERT INTO predictions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (result.metadata["run_id"], *row)
                    for row in result.predictions[columns].itertuples(index=False, name=None)
                ],
            )

    def latest(self, run_id: str | None = None) -> dict | None:
        with self.connect() as con:
            if run_id:
                row = con.execute("SELECT * FROM runs WHERE run_id=?", (run_id,)).fetchone()
            else:
                row = con.execute("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").fetchone()
        if row is None:
            return None
        return {
            "metadata": json.loads(row["metadata"]),
            "metrics": json.loads(row["scores"]),
            "forecasts": json.loads(row["forecasts"]),
        }

    def runs(self) -> list[dict]:
        with self.connect() as con:
            rows = con.execute(
                "SELECT run_id, created_at FROM runs ORDER BY created_at DESC LIMIT 100"
            ).fetchall()
        return [dict(row) for row in rows]

    def predictions(
        self, run_id: str, start: str | None = None, end: str | None = None
    ) -> list[dict]:
        sql = "SELECT * FROM predictions WHERE run_id=?"
        params = [run_id]
        if start:
            sql += " AND origin>=?"
            params.append(start)
        if end:
            sql += " AND origin<=?"
            params.append(end)
        with self.connect() as con:
            return [dict(r) for r in con.execute(sql + " ORDER BY origin, model", params)]


def read_market(data_dir: Path) -> pd.DataFrame | None:
    if not (data_dir / "raw" / "provenance.json").exists():
        return None
    prices, _ = load_verified_prices(data_dir)
    return process_prices(prices)
