# Third-party notices

The MIT license covers MacroPulse's original source code only. It does not relicense
dependencies, market data, or pretrained model weights.

- Official TimesFM source: [google-research/timesfm](https://github.com/google-research/timesfm),
  Apache-2.0. Pinned to commit `e51928e27119cb17bebc005be2696b75e0a9e688`.
- Genuine TimesFM 3 checkpoint: [google/timesfm-3.0-pytorch](https://huggingface.co/google/timesfm-3.0-pytorch).
  Its [TimesFM Non-Commercial License v1.0](https://huggingface.co/google/timesfm-3.0-pytorch/blob/main/LICENSE)
  restricts downloaded weights to non-commercial, non-production use. MacroPulse runs
  these weights locally for educational research; weights are neither committed nor redistributed.
- SPY history is retrieved from Yahoo Finance using yfinance. The provider's data
  terms apply. Cached prices and model weights are excluded from Git.
- Python and frontend dependencies retain their respective licenses; see the
  exact package manifests and lockfiles for installed versions.
