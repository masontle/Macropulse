import numpy as np
import pandas as pd
import pytest
from macropulse.data import (
    FEATURES,
    DataError,
    completed_sessions,
    future_sessions,
    process_prices,
    validate_prices,
)


def test_returns_and_annualized_trailing_volatility(prices):
    result = process_prices(prices)
    expected_return = np.log(prices["adjusted_close"].iloc[10] / prices["adjusted_close"].iloc[9])
    assert result["return"].iloc[10] == pytest.approx(expected_return)
    expected_rv = np.sqrt(252 / 5 * np.square(result["return"].iloc[6:11]).sum())
    assert result["rv5"].iloc[10] == pytest.approx(expected_rv)


def test_fifth_trailing_forecast_matches_forward_target(frame):
    for t in (63, 100, 1000, len(frame) - 6):
        expected = np.sqrt(252 / 5 * np.square(frame["return"].iloc[t + 1 : t + 6]).sum())
        assert frame["target"].iloc[t] == pytest.approx(expected)
        assert frame["target"].iloc[t] == frame["rv5"].iloc[t + 5]
        assert frame["target_end"].iloc[t] == frame.index[t + 5]
    assert frame["target"].tail(5).isna().all()


def test_features_and_regimes_are_invariant_to_future_prices(prices):
    before = process_prices(prices)
    changed = prices.copy()
    changed.iloc[1001:, changed.columns.get_loc("adjusted_close")] *= 5
    after = process_prices(changed)
    pd.testing.assert_frame_equal(before[FEATURES].iloc[:1001], after[FEATURES].iloc[:1001])
    pd.testing.assert_series_equal(before["regime"].iloc[:1001], after["regime"].iloc[:1001])
    assert before["target"].iloc[1000] != after["target"].iloc[1000]


@pytest.mark.parametrize("kind", ["duplicate", "unsorted", "negative", "missing"])
def test_invalid_price_data_is_rejected(prices, kind):
    broken = prices.copy()
    expected = None
    if kind == "duplicate":
        broken = pd.concat([broken.iloc[:1], broken])
    elif kind == "unsorted":
        broken = broken.iloc[::-1]
    elif kind == "negative":
        broken.iloc[100, 0] = -1
    elif kind == "missing":
        expected = prices.index
        broken = broken.drop(prices.index[100])
    with pytest.raises(DataError):
        validate_prices(broken, expected)


def test_future_dates_use_exchange_holidays():
    assert future_sessions("2024-07-03") == [
        "2024-07-05",
        "2024-07-08",
        "2024-07-09",
        "2024-07-10",
        "2024-07-11",
    ]


def test_incomplete_market_session_is_excluded():
    before_close = completed_sessions("2024-07-01", pd.Timestamp("2024-07-03T16:00:00Z"))
    after_early_close = completed_sessions("2024-07-01", pd.Timestamp("2024-07-03T17:30:00Z"))
    assert before_close[-1] == pd.Timestamp("2024-07-02")
    assert after_early_close[-1] == pd.Timestamp("2024-07-03")


def test_fingerprint_survives_parquet_timestamp_unit_conversion(prices, frame, tmp_path):
    from macropulse.data import frame_fingerprint

    for name, original in (("prices", prices), ("processed", frame)):
        path = tmp_path / f"{name}.parquet"
        original.to_parquet(path)
        reloaded = pd.read_parquet(path)
        assert frame_fingerprint(original) == frame_fingerprint(reloaded)
        altered = reloaded.copy()
        altered.iloc[100, altered.columns.get_loc("close")] += 1
        assert frame_fingerprint(original) != frame_fingerprint(altered)
