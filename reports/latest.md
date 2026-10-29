# MacroPulse measured results

Run: `20261029T172722Z-e5e6cb51`

Data: Yahoo Finance via yfinance; through 2026-10-28.
Test: 2024-01-02 to 2026-10-16 (141 non-overlapping origins).

All volatility errors below are annualized percentage points (decimal errors × 100).

| Model | MAE (pp) | RMSE (pp) | Bias (pp) | MAE improvement | Prediction ms |
|---|---:|---:|---:|---:|---:|
| xgboost | 4.118 | 7.351 | 0.431 | 22.82% | 9.74 |
| timesfm3 | 4.810 | 7.384 | -0.517 | 9.85% | 144.06 |
| persistence | 5.335 | 8.380 | -0.036 | 0.00% | 0.05 |

## Model availability

```json
{
  "persistence": {
    "status": "available",
    "information_set": "latest observed trailing RV5"
  },
  "xgboost": {
    "status": "available",
    "params": {
      "max_depth": 2,
      "n_estimators": 250,
      "learning_rate": 0.02
    },
    "information_set": "backward-looking price-return features"
  },
  "timesfm3": {
    "status": "available",
    "checkpoint": "google/timesfm-3.0-pytorch",
    "checkpoint_revision": "43046b85ec22d584a13f8098c2ed39c889e129c2",
    "source_revision": "e51928e27119cb17bebc005be2696b75e0a9e688",
    "context_length": 256,
    "batch_size": 4,
    "device": "cpu",
    "load_ms": 31511.504199996125,
    "license": "timesfm-non-commercial-license-v1.0",
    "negative_handling": "clip point forecast and quantiles at zero; retain raw endpoint for evaluation",
    "interval": "10th\u201390th model quantiles, not a calibrated confidence interval"
  }
}
```

## Interpretation

Expanding-window, labels matured by refit origin; validation-only selection; no test-based tuning.

TimesFM was released in 2026. This retrospective study cannot rule out pretraining overlap with historical financial observations.

Prediction only; excludes model load and training. Batched TimesFM wall time is amortized per origin.

Results describe this dataset and evaluation window. They do not establish statistical significance or investment performance.
Model rankings were not used to retune test-period hyperparameters. Repeated experiments on the same test period are exploratory.


## Calm and volatile origins

| Regime at origin | Model | N | MAE (pp) | RMSE (pp) |
|---|---|---:|---:|---:|
| calm | persistence | 69 | 3.938 | 5.345 |
| calm | timesfm3 | 69 | 3.382 | 4.427 |
| calm | xgboost | 69 | 3.034 | 3.931 |
| volatile | persistence | 72 | 6.673 | 10.494 |
| volatile | timesfm3 | 72 | 6.178 | 9.381 |
| volatile | xgboost | 72 | 5.156 | 9.539 |

## Nonnegative handling

| Model | Negative endpoints clipped | Raw MAE (pp) | Clipped MAE (pp) |
|---|---:|---:|---:|
| persistence | 0 | 5.335 | 5.335 |
| timesfm3 | 0 | 4.810 | 4.810 |
| xgboost | 0 | 4.118 | 4.118 |

## Paired model cases

TimesFM has smaller absolute error than XGBoost at 56 of 141 common origins; XGBoost wins at 85.
TimesFM beats persistence at 77 origins.

### Largest TimesFM advantages over XGBoost

| Origin | TimesFM absolute error (pp) | XGBoost absolute error (pp) |
|---|---:|---:|
| 2025-04-11 | 37.581 | 57.908 |
| 2025-04-21 | 3.785 | 11.363 |
| 2025-11-21 | 0.701 | 3.852 |
| 2025-07-10 | 3.296 | 6.386 |
| 2025-07-02 | 0.977 | 4.033 |

### Largest XGBoost advantages over TimesFM

| Origin | TimesFM absolute error (pp) | XGBoost absolute error (pp) |
|---|---:|---:|
| 2025-04-04 | 32.155 | 8.936 |
| 2026-02-05 | 7.558 | 1.693 |
| 2025-03-21 | 8.214 | 3.025 |
| 2025-05-19 | 6.935 | 1.796 |
| 2026-03-27 | 5.439 | 0.418 |
