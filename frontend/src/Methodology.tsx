import { Database } from "lucide-react";
import type { Research } from "./types";

const explanations = [
  [
    "01",
    "A precisely aligned target",
    "Each origin is after the market close. The target uses only the next five session returns. TimesFM forecasts trailing RV at five future sessions; its fifth prediction matches this forward target exactly.",
  ],
  [
    "02",
    "Chronological evaluation",
    "Training starts in 2015. Parameters are selected on 2022–2023 validation origins only. Testing begins in 2024, with five-session spacing. A training label is eligible only once its entire horizon has ended.",
  ],
  [
    "03",
    "Expanding information",
    "XGBoost refits every 20 forecast origins, using only matured labels at that origin. Earlier test labels can enter later refits; test errors never select hyperparameters. This is a sequential forecasting study.",
  ],
  [
    "04",
    "Different information sets",
    "All models share the same information cutoff. Persistence uses current RV5; TimesFM uses a window of trailing RV5; XGBoost also uses backward-looking returns, momentum, and rolling statistics. This is not an equal-feature ablation.",
  ],
  [
    "05",
    "Regimes known at the origin",
    "An origin is volatile when its observed trailing RV5 exceeds the expanding historical median available at that date. Future realized outcomes do not define market regimes.",
  ],
  [
    "06",
    "Honest limitations",
    "A foundation model released in 2026 is being evaluated retrospectively. Pretraining overlap cannot be excluded. Vendor adjustments may revise historical prices. Rankings are descriptive; no significance claim is made.",
  ],
];

export default function Methodology({ research }: { research: Research }) {
  return (
    <>
      <section className="panel methodology-intro">
        <span className="eyebrow">A REPRODUCIBLE EXPERIMENT</span>
        <h2>
          Forecasting risk.
          <br />
          <span>Testing the evidence.</span>
        </h2>
        <p>
          Can Google's TimesFM 3 outperform conventional methods when predicting
          five-session realized volatility for the S&P 500? MacroPulse
          investigates this question using SPY, genuine market data, and a
          shared forecasting target.
        </p>
        <div className="formula">
          <span>FORWARD REALIZED VOLATILITY</span>
          <code>RV(t, t+5) = √[ (252 / 5) × Σₖ₌₁⁵ r²(t+k) ]</code>
          <small>r(t) = ln(adjusted close(t) / adjusted close(t−1))</small>
        </div>
      </section>
      <div className="method-grid">
        {explanations.map(([number, title, description]) => (
          <article className="panel method-card" key={number}>
            <span className="method-number">{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Experiment manifest</h2>
            <p>A traceable record of the results shown in this workspace.</p>
          </div>
          <Database size={18} />
        </div>
        <dl className="manifest">
          <div>
            <dt>Run ID</dt>
            <dd>{research.metadata.run_id}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{research.metadata.provenance.source}</dd>
          </div>
          <div>
            <dt>Retrieved at</dt>
            <dd>{research.metadata.provenance.retrieved_at}</dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd>
              {research.metadata.provenance.rows.toLocaleString()} sessions ·
              since 2015
            </dd>
          </div>
          <div>
            <dt>Validation origins</dt>
            <dd>{research.metadata.validation_origins}</dd>
          </div>
          <div>
            <dt>Test origins</dt>
            <dd>
              {research.metadata.test_origins}
              {research.metadata.config.max_test_origins
                ? " · limited test window"
                : " · full configured test window"}
            </dd>
          </div>
          <div>
            <dt>TimesFM context</dt>
            <dd>
              {research.metadata.config.context_length} sessions · zero-shot
            </dd>
          </div>
          <div>
            <dt>Random seed</dt>
            <dd>{research.metadata.seed}</dd>
          </div>
          <div>
            <dt>Dataset SHA-256</dt>
            <dd className="hash">{research.metadata.provenance.sha256}</dd>
          </div>
        </dl>
        <div className="panel-footnote">
          TimesFM 3 weights: non-commercial, non-production use only. All
          inference runs locally. Negative predictions are clipped to zero; raw
          forecasts remain in experiment artifacts and raw MAE is recorded.
        </div>
      </section>
    </>
  );
}
