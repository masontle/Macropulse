import argparse
import json
import platform
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd

from macropulse.config import ROOT, settings
from macropulse.data import DataError, download_prices, load_verified_prices, process_prices
from macropulse.evaluation import ExperimentConfig, export_experiment, run_experiment
from macropulse.storage import ResearchStore


def write_report(run: dict, path: Path, predictions: list[dict] | None = None):
    meta = run["metadata"]
    lines = [
        "# MacroPulse measured results",
        "",
        f"Run: `{meta['run_id']}`",
        "",
        f"Data: {meta['provenance']['source']}; through {meta['provenance']['last_session']}.",
        f"Test: {meta['test_first_origin']} to {meta['test_last_origin']} "
        f"({meta['test_origins']} non-overlapping origins).",
        "",
        "All volatility errors below are annualized percentage points (decimal errors × 100).",
        "",
        "| Model | MAE (pp) | RMSE (pp) | Bias (pp) | MAE improvement | Prediction ms |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in sorted((r for r in run["metrics"] if r["regime"] == "all"), key=lambda r: r["mae"]):
        improvement = (
            f"{row['improvement_pct']:.2f}%" if row["improvement_pct"] is not None else "N/A"
        )
        lines.append(
            f"| {row['model']} | {100 * row['mae']:.3f} | {100 * row['rmse']:.3f} "
            f"| {100 * row['bias']:.3f} | {improvement} | {row['latency_ms']:.2f} |"
        )
    lines += [
        "",
        "## Model availability",
        "",
        "```json",
        json.dumps(meta["models"], indent=2),
        "```",
        "",
        "## Interpretation",
        "",
        meta["methodology"],
        "",
        meta["pretraining_caveat"],
        "",
        meta["latency_note"],
        "",
        "Results describe this dataset and evaluation window. "
        "They do not establish statistical significance or investment performance.",
        "Model rankings were not used to retune test-period hyperparameters. "
        "Repeated experiments on the same test period are exploratory.",
        "",
    ]
    lines += [
        "",
        "## Calm and volatile origins",
        "",
        "| Regime at origin | Model | N | MAE (pp) | RMSE (pp) |",
        "|---|---|---:|---:|---:|",
    ]
    for row in run["metrics"]:
        if row["regime"] != "all":
            lines.append(
                f"| {row['regime']} | {row['model']} | {row['n']} "
                f"| {100 * row['mae']:.3f} | {100 * row['rmse']:.3f} |"
            )
    lines += [
        "",
        "## Nonnegative handling",
        "",
        "| Model | Negative endpoints clipped | Raw MAE (pp) | Clipped MAE (pp) |",
        "|---|---:|---:|---:|",
    ]
    for row in run["metrics"]:
        if row["regime"] == "all":
            lines.append(
                f"| {row['model']} | {row['clipped_count']} "
                f"| {100 * row['raw_mae']:.3f} | {100 * row['mae']:.3f} |"
            )
    if predictions:
        table = pd.DataFrame(predictions)
        errors = table.assign(error=(table["prediction"] - table["actual"]).abs())
        errors = errors.pivot(index="origin", columns="model", values="error")
        if {"timesfm3", "xgboost", "persistence"}.issubset(errors.columns):
            delta = errors["xgboost"] - errors["timesfm3"]
            lines += [
                "",
                "## Paired model cases",
                "",
                f"TimesFM has smaller absolute error than XGBoost at {(delta > 0).sum()} "
                f"of {len(delta)} common origins; XGBoost wins at {(delta < 0).sum()}.",
                f"TimesFM beats persistence at "
                f"{(errors['timesfm3'] < errors['persistence']).sum()} origins.",
            ]
            for title, selected in (
                ("Largest TimesFM advantages over XGBoost", delta.nlargest(5)),
                ("Largest XGBoost advantages over TimesFM", delta.nsmallest(5)),
            ):
                lines += [
                    "",
                    f"### {title}",
                    "",
                    "| Origin | TimesFM absolute error (pp) | XGBoost absolute error (pp) |",
                    "|---|---:|---:|",
                ]
                for origin in selected.index:
                    lines.append(
                        f"| {origin} | {100 * errors.loc[origin, 'timesfm3']:.3f} "
                        f"| {100 * errors.loc[origin, 'xgboost']:.3f} |"
                    )
    lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def _main():
    parser = argparse.ArgumentParser(description="MacroPulse local research workflow")
    sub = parser.add_subparsers(dest="command", required=True)
    refresh = sub.add_parser("refresh", help="Download and validate actual SPY prices")
    refresh.add_argument("--force", action="store_true")
    exp = sub.add_parser(
        "experiment", help="Select on validation, evaluate non-overlapping test origins"
    )
    exp.add_argument("--config", type=Path, default=ROOT / "configs" / "default.json")
    exp.add_argument("--no-timesfm", action="store_true")
    exp.add_argument(
        "--quick", action="store_true", help="Use last 40 test origins for every model"
    )
    replay = sub.add_parser(
        "reproduce", help="Replay an experiment using its immutable price snapshot"
    )
    replay.add_argument("run_id")
    serve = sub.add_parser("serve", help="Serve API and built dashboard")
    serve.add_argument("--port", type=int, default=8000)
    serve.add_argument("--reload", action="store_true")
    report = sub.add_parser("report", help="Export latest actual results as Markdown")
    report.add_argument("--output", type=Path, default=ROOT / "reports" / "latest.md")
    sub.add_parser("doctor", help="Inspect resources and installed package versions")
    args = parser.parse_args()
    if args.command == "refresh":
        frame, provenance = download_prices(settings.data_dir, args.force)
        print(json.dumps({**provenance, "processed_rows": len(frame)}, indent=2))
    elif args.command in ("experiment", "reproduce"):
        store = ResearchStore(settings.database)
        if args.command == "reproduce":
            previous = store.latest(args.run_id)
            if previous is None:
                parser.error("Unknown run ID")
            meta = previous["metadata"]
            provenance = meta["provenance"]
            snapshot = settings.data_dir / "raw" / f"spy-{provenance['sha256'][:16]}.parquet"
            if not snapshot.exists():
                parser.error(f"Immutable snapshot is missing: {snapshot}")
            raw_prices, provenance = load_verified_prices(settings.data_dir, provenance)
            frame = process_prices(raw_prices)
            cfg = ExperimentConfig.model_validate(meta["config"])
            cfg.checkpoint_revision = meta["models"].get("timesfm3", {}).get("checkpoint_revision")
        else:
            cfg = ExperimentConfig.model_validate_json(args.config.read_text(encoding="utf-8"))
            if args.no_timesfm:
                cfg.include_timesfm = False
            if args.quick:
                cfg.max_test_origins = 40
            provenance_path = settings.data_dir / "raw" / "provenance.json"
            if not provenance_path.exists():
                frame, provenance = download_prices(settings.data_dir)
            else:
                raw_prices, provenance = load_verified_prices(settings.data_dir)
                frame = process_prices(raw_prices)
        result = run_experiment(frame, provenance, cfg, settings)
        result.metadata["environment"] = {"python": sys.version, "platform": platform.platform()}
        commit = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=False
        )
        result.metadata["git_commit"] = commit.stdout.strip() or None
        result.metadata["git_dirty"] = bool(
            subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
            ).stdout.strip()
        )
        export_experiment(result, settings.data_dir / "experiments" / result.metadata["run_id"])
        store.save(result)
        write_report(
            store.latest(),
            ROOT / "reports" / "latest.md",
            store.predictions(result.metadata["run_id"]),
        )
        print(
            json.dumps(
                {
                    "run_id": result.metadata["run_id"],
                    "metrics": result.scores,
                    "models": result.metadata["models"],
                },
                indent=2,
            )
        )
    elif args.command == "serve":
        import uvicorn

        uvicorn.run("macropulse.api:app", host="127.0.0.1", port=args.port, reload=args.reload)
    elif args.command == "report":
        run = ResearchStore(settings.database).latest()
        if run is None:
            parser.error("No experiment to report")
        write_report(
            run,
            args.output,
            ResearchStore(settings.database).predictions(run["metadata"]["run_id"]),
        )
        print(args.output)
    elif args.command == "doctor":
        import importlib.metadata

        packages = {}
        for package in ["pandas", "numpy", "xgboost", "timesfm", "torch", "fastapi"]:
            try:
                packages[package] = importlib.metadata.version(package)
            except importlib.metadata.PackageNotFoundError:
                packages[package] = "not installed"
        disk = shutil.disk_usage(ROOT)
        print(
            json.dumps(
                {
                    "python": sys.version,
                    "os": platform.platform(),
                    "disk_free_gb": round(disk.free / 1e9, 1),
                    "packages": packages,
                },
                indent=2,
            )
        )


def main():
    try:
        _main()
    except DataError as exc:
        print(f"Market data validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
