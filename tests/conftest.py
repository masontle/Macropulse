import numpy as np
import pandas as pd
import pytest
from macropulse.data import process_prices


@pytest.fixture
def prices():
    # Synthetic deterministic fixture ONLY for unit tests; never used by the application.
    dates = pd.bdate_range("2015-01-01", "2026-10-28")
    rng = np.random.default_rng(42)
    close = 200 * np.exp(np.cumsum(rng.normal(0.0002, 0.01, len(dates))))
    return pd.DataFrame({"adjusted_close": close, "close": close, "volume": 100000}, index=dates)


@pytest.fixture
def frame(prices):
    return process_prices(prices)
