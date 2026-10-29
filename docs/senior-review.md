# Senior engineering and research review — October 29, 2026

The review prioritizes interpretability, scientific consistency, and failure recovery.
Existing model parameters and the final test period were retained; the UI redesign
does not choose a winning model for the next forecast using test errors.

## User experience changes

- Forecast-first overview with an explicit selected model, forecast origin, target
  end date, annualized units, and the difference from recent observed volatility.
- Larger text, improved contrast, clearer layout, and readable mobile controls.
- Plain-language explanations of annualization, realized volatility, forecast
  volatility, MAE/RMSE/bias, and percentage points. Help controls are interactive.
- A price/volatility toggle and nearby model controls; chart zoom persists during
  ordinary updates. Plotly loads separately, so the initial JavaScript payload
  falls from approximately 1,399 KB to 272 KB (before compression).
- Forecast history has year shortcuts, selection-specific error summaries,
  filtered exports with explicit units, and pagination through all observations.
- Clear separation of full-experiment export and filtered-forecast export.
- Browser back/forward navigation, keyboard skip link, Escape-to-close navigation,
  and inert offscreen navigation on mobile.
- Independent loading/recovery: available market data remain useful if research
  results fail. Old CSV data cannot be exported during a pending reload.
- Data freshness is based on the latest completed exchange session, rather than
  calendar-day age. Saved experiment dates are displayed in the browser's timezone.

## Confirmed formulas and information timing

Returns are log(adjusted_close[t] / adjusted_close[t-1]). Trailing RV5 is the square
root of 252/5 times the sum of the most recent five squared log returns. The forward
target at t uses exactly t+1 through t+5, and equals trailing RV5 at t+5.

This is realized quadratic variation as specified in the brief, not demeaned sample
standard deviation. A constant nonzero log-return path therefore has nonzero RV;
an explicit regression test protects this distinction. No formula substitution was
necessary. The fifth TimesFM forecast remains the common five-session endpoint.
Intermediate TimesFM points forecast rolling trailing volatility; compare models
at the final target date.

Only labels whose complete target horizon has ended by the refit origin enter
training. Validation selects the same three preset XGBoost candidates. No new
parameters were selected against final test errors. Regimes remain defined using
information known at the origin.

## Corrected engineering and research defects

1. **Unverified processed data:** experiments could consume a modified processed
   cache without confirming it against raw provenance. Experiments and market API
   reads now derive features from fingerprint-verified raw prices.
2. **Mixed experiment reads:** independent reads of "latest" could refer to different
   experiments if a run completed between requests. The client resolves the run once
   and pins history and market-snapshot requests to its immutable ID.
3. **Historical snapshot mismatch:** selecting an old experiment previously left
   current prices in the overview. `/api/market?run_id=...` now loads that run's
   verified immutable snapshot. Missing/corrupt snapshots return a clear 503.
4. **Interrupted cache writes:** direct overwrites could leave partial Parquet/JSON.
   Files now write to same-directory temporary files and are atomically replaced;
   fingerprints prevent accepting inconsistent raw/provenance pairs.
5. **Weak schema validation:** missing/duplicated/reordered columns, nonnumeric
   prices, invalid volume, missing dates, and unnormalized trading dates are rejected.
   Canonical raw-column order also prevents renamed columns bypassing legacy row-value
   fingerprints without changing those existing snapshot IDs.
6. **Compressed TimesFM contexts:** dropping every missing value could turn an
   internal missing session into a shorter false history. Only initial warmup is
   removed; nonfinite context values are rejected before downloading/loading weights.
7. **Unstable evaluation grid:** dropping invalid rows before sampling could shift
   all later forecast origins. Origins are now selected on the original session
   grid first, then unavailable labels/features are excluded.
8. **Unchecked comparison inputs:** metrics now require one-dimensional arrays;
   rankings reject duplicates, unequal origins, inconsistent realized outcomes or
   target dates, nonfinite predictions, and invalid published volatility.
9. **Configuration traps:** split dates must be ISO dates; XGBoost candidates reject
   unknown/invalid parameters. Relative data paths resolve against the project.
   Environment context/batch defaults apply when experiment JSON omits those fields.
10. **Untraceable selection details:** each run exports validation predictions by
    candidate, origin, target end, and matured training-label cutoff, plus broader
    package versions and an explicit protocol version/target definition.
11. **Column-order persistence risk:** SQLite inserts explicitly select the expected
    prediction columns instead of relying on DataFrame construction order.
12. **Outdated frontend at launch:** the PowerShell launcher checks source/build-input
    timestamps and rebuilds when necessary. API docs work through Vite and under
    custom production ports via same-origin paths.

## Verification

The added regression tests cover corruption, schema ambiguity, interrupted writes,
historical snapshot selection, grid stability, strict config validation, mismatched
outcomes, context gaps, column-order-independent persistence, consistent run IDs,
partial-data UI, exports, model/price switches, reload safety, browser history, and
forecast pagination. Mocked UI/model tests remain separate from genuine checkpoint
inference and real-data research replay. Final measured verification is recorded in
the review delivery and `reports/reference/` artifacts.

## Remaining scientific limits

This remains a retrospective single-asset study. TimesFM pretraining overlap is not
known; vendor-adjusted historical prices are not archived point-in-time vintages.
Non-overlapping targets do not remove volatility clustering or establish statistical
significance. Earlier test labels enter later causal expanding fits after maturation;
they never choose hyperparameters. Model inputs differ. Quantiles are uncalibrated.
Inference timings exclude loading/training and differ in batching/input preparation;
they are implementation measurements, not a controlled throughput benchmark.

The next research improvements should be prospective evaluation, a common-input
ablation, and predeclared uncertainty analysis. Repeated optimization against the
same final test window would weaken the research, so it was deliberately avoided.

Official references consulted:
[scikit-learn time-series splitting](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
and [XGBoost's Python API](https://xgboost.readthedocs.io/en/stable/python/python_api.html).
