# PROJECT: MACROPULSE — AI-POWERED FINANCIAL RISK FORECASTING PLATFORM

You are an expert AI/ML engineer, financial data scientist, quantitative researcher, full-stack developer, and software architect.

Your task is to autonomously design, implement, test, debug, and complete a professional portfolio-quality application called **MacroPulse**.

I want a fully functional, technically sophisticated financial risk forecasting platform using Google's TimesFM 3 foundation model.

This project will be showcased on my GitHub, resume, and portfolio for competitive AI/ML engineering, data science, financial technology, and software engineering internships.

**IMPORTANT: THIS IS AN END-TO-END IMPLEMENTATION REQUEST.**

Do not stop after planning. Do not simply generate a project scaffold, documentation, or pseudocode.

Your responsibility is to build the actual application, execute it, test it, identify and resolve problems, and deliver the most complete working implementation possible.

Work autonomously through all development phases. Make reasonable engineering decisions without requesting confirmation for routine choices.

---

# 1. PROJECT OBJECTIVE

Build an AI-powered financial analytics platform that forecasts short-term financial market volatility and evaluates modern foundation models against conventional machine-learning techniques.

Primary research question:

**Can Google's TimesFM 3 outperform traditional statistical and machine-learning methods when predicting five-day realized volatility for the S&P 500?**

Use SPY as the initial S&P 500 proxy.

The platform should combine:

- Financial data engineering
- Time-series forecasting
- Foundation-model inference
- Traditional machine learning
- Historical backtesting
- Model evaluation and interpretability
- Interactive financial visualizations
- Full-stack software engineering
- Reproducible ML experimentation

The final result should resemble a polished, professional financial research application rather than a basic student project.

Prioritize actual technical substance and scientific validity over superficial features.

---

# 2. REQUIRED TECHNOLOGY STACK

Backend:
- Python
- FastAPI
- Pandas
- NumPy
- Scikit-learn
- XGBoost
- Google's official TimesFM 3 implementation
- Statsmodels if useful
- SQLite
- Parquet for processed datasets

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- Plotly for interactive charts

Engineering:
- Git
- Pytest
- Ruff
- Type checking where practical
- Reproducible dependency management
- Environment configuration
- GitHub Actions for appropriate automated tests

Use a clean, scalable, modular architecture.

Avoid unnecessary infrastructure such as Kubernetes, microservices, authentication systems, or paid cloud services.

Keep the initial implementation achievable on a developer's local computer.

---

# 3. FINANCIAL DATA ENGINEERING

Implement a reliable financial data pipeline.

Initial asset: SPY.

Historical period: January 2015 through the latest available completed trading session.

Use an established historical market data provider such as Yahoo Finance through yfinance.

Requirements:

1. Retrieve historical adjusted daily closing prices.
2. Normalize timestamps and trading dates.
3. Handle missing observations and market holidays.
4. Calculate daily logarithmic returns.
5. Calculate trailing realized volatility.
6. Calculate forward realized volatility targets.
7. Store raw and processed data separately.
8. Implement caching to avoid unnecessary requests.
9. Record data source and retrieval timestamps.
10. Validate dataset integrity.
11. Provide reproducible data-processing scripts.

Use annualized five-day realized volatility defined as:

RV(t,t+5) = sqrt((252/5) * sum(r(t+k)^2, k=1..5))

where r represents daily logarithmic returns.

The forecasting task is to estimate forward five-day realized volatility using only information available at the forecasting timestamp.

Be exceptionally careful with financial time-series alignment.

Future returns must never be available to the forecasting models at prediction time.

---

# 4. GOOGLE TIMESFM 3 INTEGRATION

Use Google's actual pretrained TimesFM 3 foundation model.

Official repository:
https://github.com/google-research/timesfm

Pretrained checkpoint:
google/timesfm-3.0-pytorch

Consult the current official documentation before implementation.

Do not assume outdated package interfaces.

Requirements:

1. Install and configure the official TimesFM 3 implementation.
2. Load the genuine pretrained checkpoint.
3. Implement a reusable TimesFM3Forecaster class.
4. Support CPU inference where feasible.
5. Automatically detect CUDA availability.
6. Avoid training the foundation model from scratch.
7. Support configurable context lengths.
8. Generate time-series forecasts.
9. Return correctly aligned forecasts.
10. Record model configuration and inference latency.
11. Support batched inference when beneficial.
12. Add tests for forecast shapes and date alignment.

Start by forecasting the trailing five-day realized volatility time series.

Generate five future daily forecasts. The fifth prediction corresponds to the trailing five-day realized volatility ending five sessions after the forecast origin, which has the same mathematical target as the forward five-day realized volatility label.

Verify this alignment mathematically and with automated tests.

If negative volatility predictions occur, use a clearly documented nonnegative handling strategy and assess its effect on evaluation results.

Do not silently substitute TimesFM 2.5 or another model.

If TimesFM 3 cannot execute because of checkpoint access, hardware limitations, or dependency problems:

- Investigate and attempt reasonable fixes.
- Preserve the genuine TimesFM 3 implementation.
- Keep the other models and dashboard functional.
- Clearly identify unavailable inference results.
- Never fabricate TimesFM outputs.

Respect the pretrained weights' non-commercial, non-production license. Keep downloaded model inference local for this educational research application.

---

# 5. BASELINE MACHINE-LEARNING MODELS

Implement three forecasting approaches.

MODEL A: NAÏVE PERSISTENCE

Predict that future realized volatility equals the latest observed trailing five-day realized volatility.

MODEL B: XGBOOST

Build a supervised regression model using historical financial features.

Potential features:
- Lagged daily returns
- Lagged realized volatility
- Rolling return volatility
- Historical absolute returns
- Historical price momentum
- Rolling return statistics

Only use backward-looking features.

Use chronological model training and validation.

MODEL C: TIMESFM 3

Use the pretrained foundation model without fine-tuning.

Ensure all models predict the identical target at identical historical forecasting origins.

Build a common forecasting interface so the evaluation pipeline can compare models consistently.

Do not give XGBoost information that would be unavailable to TimesFM at the same prediction timestamp.

Document the different information sets and modeling approaches.

---

# 6. BACKTESTING AND ML EVALUATION

This is one of the most important components of the project.

Implement a rigorous evaluation framework that prevents look-ahead bias.

Requirements:

1. Chronological train/validation/test separation.
2. Walk-forward or expanding-window evaluation.
3. Strict prevention of future-data leakage.
4. Correct handling of overlapping forward labels.
5. Comparable forecasting origins across models.
6. Validation-only hyperparameter selection.
7. An untouched final test period.
8. Reproducible experiments.
9. Model and experiment configuration tracking.
10. Saved historical predictions and evaluation results.

Suggested initial split:
- Training: 2015–2021
- Validation: 2022–2023
- Final testing: 2024 through the latest available date

Adjust these boundaries only if necessary, and explain why.

Use non-overlapping five-session forecast origins for the primary evaluation to simplify interpretation. Optionally investigate overlapping origins separately.

Implement these metrics:
- Mean Absolute Error
- Root Mean Squared Error
- Forecast bias
- Percentage improvement against naïve persistence
- Model inference latency

Analyze:
- Overall forecasting accuracy
- Performance during volatile markets
- Performance during relatively calm markets
- Historical prediction errors
- Cases where TimesFM outperforms XGBoost
- Cases where XGBoost or naïve persistence outperforms TimesFM

Ensure historical market regimes are defined without using future information.

Create charts and tables summarizing the actual results.

Do not assume TimesFM 3 is superior.

If TimesFM 3 performs worse, clearly report that conclusion.

A scientifically defensible negative finding is more valuable than fabricated positive results.

---

# 7. BACKEND API

Build a FastAPI backend exposing the application's real financial data and forecasting results.

Implement endpoints for:

- Historical market data
- Historical realized volatility
- Latest available forecasts
- Model performance statistics
- Historical backtesting results
- Model metadata
- Application status

Use clean API response schemas.

Requirements:
- Pydantic validation
- Proper error handling
- Meaningful HTTP status codes
- Correct data serialization
- Clear API documentation
- No hardcoded fabricated financial results

Avoid loading large models on every API request.

Use cached or persisted predictions where appropriate.

The backend must remain operational even when TimesFM inference is unavailable.

---

# 8. FRONTEND — PROFESSIONAL FINANCIAL DASHBOARD

Create an exceptional interactive frontend.

Design inspiration:
- Bloomberg-style financial analytics
- Modern institutional investment research platforms
- High-quality fintech dashboards
- Professional quantitative research interfaces

Do not directly copy another company's branding or proprietary interface.

Design direction:

- Dark theme by default
- Clean financial typography
- Sophisticated but restrained color palette
- Excellent spacing and alignment
- Responsive layouts
- Smooth, purposeful interactions
- Information-dense but readable components
- High-quality Plotly visualizations

Avoid excessive gradients, gimmicky animations, or generic AI-dashboard aesthetics.

## DASHBOARD PAGE 1: MARKET OVERVIEW

Display:
- Latest SPY price
- Recent market returns
- Latest historical realized volatility
- Forecasted five-day realized volatility
- Forecast timestamp
- Available model predictions

Include a large interactive chart showing historical volatility and future forecasts.

Clearly separate historical observations from forecast periods.

## DASHBOARD PAGE 2: MODEL COMPARISON

Display:
- TimesFM 3 results
- XGBoost results
- Naïve baseline results
- MAE
- RMSE
- Relative improvements
- Forecast errors
- Model rankings