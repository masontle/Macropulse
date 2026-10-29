# MacroPulse

**Local financial risk forecasting research with genuine TimesFM 3, XGBoost, and a persistence baseline.**

MacroPulse asks whether a pretrained time-series foundation model can improve forecasts
of annualized five-session realized volatility for SPY. It combines an audited financial
data pipeline, expanding-window evaluation, a FastAPI research API, and a React/Plotly dashboard.

## Measured research result

All three models were executed on real SPY data downloaded through the **October 28, 2026**
completed session. Validation used 100 origins in 2022–2023; the full test used 141
non-overlapping origins from January 2, 2024 through October 16, 2026. Metrics below
are annualized volatility percentage points, not trading returns.

| Model | MAE ↓ | RMSE ↓ | Bias | MAE improvement vs persistence |
|---|---:|---:|---:|---:|
| XGBoost | 4.118 pp | 7.351 pp | +0.431 pp | 22.82% |
| TimesFM 3 | 4.810 pp | 7.384 pp | −0.517 pp | 9.85% |
| Persistence | 5.335 pp | 8.380 pp | −0.036 pp | baseline |

**TimesFM 3 improved on persistence but did not outperform XGBoost in test MAE.**
This is a descriptive retrospective result. TimesFM pretraining overlap is unknown,
and repeated research on this test period should be treated as exploratory.
See [the measured report](reports/latest.md) for regimes, paired cases, raw/clipped
errors, model revisions, and latency; [reference artifacts](reports/reference/) preserve
the small prediction/metadata outputs. Large datasets and weights stay local.

## Features

- Yahoo Finance adjusted-price history from 2015, Parquet caches, exchange-calendar
  validation, retrieval provenance, and immutable fingerprinted snapshots.
- Exact forward/trailing volatility alignment, causal features, chronological splits,
  matured-label purging, validation-only selection, and expanding-window test fits.
- Genuine `google/timesfm-3.0-pytorch` CPU/CUDA adapter with batched inference and
  transparent availability handling; no replacement model or fabricated predictions.
- SQLite experiment tracking with configuration, package versions, seed, source
  commit, checkpoint revision, saved forecasts, and historical predictions.
- Four responsive dark-theme dashboard views: overview, model comparison,
  backtesting, and research methodology. Interactive Plotly charts, period/model/regime
  filters, experiment selection, CSV export, and chart PNG export.
- Financial/ML/API tests, frontend interaction tests, Ruff, TypeScript/build checks,
  pinned dependency records, and GitHub Actions.

## Run the installed application on this computer

```powershell
Set-Location 'C:\Users\mason\OneDrive\Desktop\Personal Coding Stuff\Macropulse'
.\.venv\Scripts\macropulse.exe serve
```

Open **http://127.0.0.1:8000**. API documentation: **http://127.0.0.1:8000/docs**.
The built dashboard and saved research are served by one process. Stop with Ctrl+C.
Alternatively run `powershell -ExecutionPolicy Bypass -File .\Start-MacroPulse.ps1`.
The launcher uses an existing virtual environment and builds the frontend if needed.

## Fresh setup

Requirements: Python 3.12 (3.13 is also allowed), Node.js 22.20+, Git, and internet
access for packages, market data, and the first checkpoint download. Windows, Linux,
and macOS are supported by the source; local end-to-end validation used Windows 11,
Python 3.12.6, 32 GB RAM, and CPU inference (Intel GPU; no CUDA device).

```powershell
git clone https://github.com/masontle/Macropulse.git
Set-Location Macropulse
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -m pip install -e . --no-deps
npm.cmd ci --prefix frontend
npm.cmd run build --prefix frontend
.\.venv\Scripts\macropulse.exe refresh
.\.venv\Scripts\macropulse.exe experiment
.\.venv\Scripts\macropulse.exe serve
```

On POSIX use `python3.12 -m venv .venv`, `.venv/bin/python`, `.venv/bin/macropulse`,
and `npm` instead of their Windows equivalents. The exact lock records this tested
environment; `pip install -e '.[dev,timesfm]'` resolves compatible platform wheels
when a locked dependency is unavailable. For a lightweight baseline-only installation,
use `pip install -e '.[dev]'` and run experiments with `--no-timesfm`.

The first TimesFM run downloads approximately 1.3 GB of pretrained weights; Windows
cache copies may consume more disk. Weights are reused. The initial measured run
loaded the checkpoint in about 53 seconds, with ~115 ms amortized prediction time
per historical origin (loading excluded). CPU timing depends on the machine.

## Reproduce research

```powershell
# Refresh actual prices; unchanged completed-session data are cached.
.\.venv\Scripts\macropulse.exe refresh
# Full validation + test; all available models use the same test origins.
.\.venv\Scripts\macropulse.exe experiment --config configs/default.json
# Smaller genuine evaluation: last 40 test origins for every model.
.\.venv\Scripts\macropulse.exe experiment --quick
# Keep the platform functional without downloading/loading the foundation model.
.\.venv\Scripts\macropulse.exe experiment --no-timesfm
# Replay an existing local run using its immutable raw snapshot and weight revision.
.\.venv\Scripts\macropulse.exe reproduce <run_id>
# Export the latest actual result and inspect installed resources.
.\.venv\Scripts\macropulse.exe report
.\.venv\Scripts\macropulse.exe doctor
```

`data/experiments/<run_id>/` contains JSON manifests, metrics, latest forecasts, and
CSV/Parquet predictions. `data/research.sqlite3` backs the API. `reproduce` requires
the local run and raw snapshot; it verifies the snapshot hash. Reproduction requires
the recorded source/dependencies and may differ slightly across hardware. Timestamps
and measured latency naturally change. Downloaded snapshots are not included in Git.

Configuration is in [configs/default.json](configs/default.json). Optional settings
are shown in [.env.example](.env.example). Leave `.env` and any Hugging Face token
untracked. No Hugging Face token was required for the verified public checkpoint.

## Development and verification

```powershell
.\.venv\Scripts\ruff.exe check backend tests
.\.venv\Scripts\ruff.exe format --check backend tests
.\.venv\Scripts\pytest.exe -q
npm.cmd run build --prefix frontend
npm.cmd test --prefix frontend
# Opt-in actual pretrained checkpoint integration test, after refresh:
$env:MACROPULSE_RUN_TIMESFM_TEST = '1'
.\.venv\Scripts\pytest.exe -q -m integration
Remove-Item Env:\MACROPULSE_RUN_TIMESFM_TEST
```

Unit tests use explicitly synthetic fixtures and mocked TimesFM responses. They
are separate from genuine inference on actual downloaded SPY history. The ordinary
suite skips the expensive integration test. Frontend tests mock API responses/Plotly;
the compiled application is also checked against the real running backend in a browser.
CI uses requirements-core.lock.txt (excluding torch and timesfm) and runs deterministic
tests/builds without downloading market history or weights.

For frontend hot reload, run `npm.cmd run dev --prefix frontend` in a second terminal
and open http://127.0.0.1:5173. Vite proxies `/api` to the backend on port 8000.
Use the backend's `/docs` at port 8000 directly when running Vite.

## Repository layout

```text
backend/macropulse/
  data.py          # Prices, NYSE calendars, causal features, targets
  models.py        # Common forecast contract and all three genuine model adapters
  evaluation.py    # Validation selection, expanding evaluation, paired metrics
  storage.py       # Atomic SQLite persistence and Parquet reads
  api.py           # Read-only FastAPI + compiled frontend
  cli.py           # Refresh, experiment, reproduce, report, serve, doctor
frontend/src/      # React, TypeScript, Tailwind, Plotly, interaction tests
tests/             # Financial, leakage, model, and API validation
configs/           # Reproducible experiment configuration
docs/              # Architecture and scientific protocol
reports/           # Actual measured results and small reference artifacts
.github/workflows/ # Automated backend and frontend checks
data/              # Ignored local prices, weights, experiments, database
```

## Limitations and next research steps

The final test window is excluded from parameter selection, while matured earlier
test labels can enter later causal expanding fits. TimesFM and XGBoost have different
input representations. Vendor-adjusted history is a retrieval-time snapshot rather
than an archived point-in-time feed. No statistical significance, profitability, or
investment recommendation is implied by error rankings. Quantiles are uncalibrated.

Next steps: a genuinely prospective evaluation after checkpoint release, an
equal-information feature ablation, uncertainty calibration, block-bootstrap error
intervals, additional assets, and longer context-length sensitivity tests selected
using validation data. Avoid optimizing settings repeatedly against this final test.

Original MacroPulse code is MIT licensed. TimesFM source and weights have separate
licenses; downloaded TimesFM 3 weights are **non-commercial and non-production only**.
See [third-party notices](THIRD_PARTY_NOTICES.md) and
[the detailed methodology](docs/architecture.md).

**Portfolio description:** Built a reproducible financial volatility forecasting
platform integrating TimesFM 3 foundation-model inference, XGBoost, causal
walk-forward evaluation, a FastAPI/SQLite research service, and an interactive React dashboard.
