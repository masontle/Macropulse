import { useState } from "react";
import Chart from "./Chart";
import type { Research } from "./types";
import { colors, dateLabel, names, order, pp, ScoreTable } from "./ui";
export default function Comparison({ research }: { research: Research }) {
  const [regime, setRegime] = useState("all");
  const scores = research.metrics.filter((s) => s.regime === regime);
  const best = [...scores].sort((a, b) => a.mae - b.mae)[0];
  return (
    <>
      <section className="panel comparison-takeaway">
        <span className="eyebrow">THE RESULT AT A GLANCE</span>
        <h2>
          {best
            ? `${names[best.model]} was closest on average.`
            : "No forecasts in this market regime."}
        </h2>
        <p>
          {best
            ? `Across ${best.n} matched forecasts, the average absolute error was ${pp(best.mae)} percentage points. This ranks historical accuracy, not future investment performance.`
            : "Choose another regime to compare model accuracy."}
        </p>
        <span className="label">
          {regime === "all"
            ? "Full historical test"
            : `${regime} at the forecast origin`}
        </span>
      </section>
      <div className="section-toolbar">
        <span className="muted">
          TEST · {dateLabel(research.metadata.test_first_origin)} —{" "}
          {dateLabel(research.metadata.test_last_origin)}
        </span>
        <label>
          Market regime{" "}
          <select
            aria-label="Market regime"
            value={regime}
            onChange={(e) => setRegime(e.target.value)}
          >
            <option value="all">All observations</option>
            <option value="calm">Calm at origin</option>
            <option value="volatile">Volatile at origin</option>
          </select>
        </label>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Out-of-sample performance</h2>
            <p>
              Lower error is better. Volatility errors are percentage points.
            </p>
          </div>
          <span className="label">VALIDATION-SELECTED</span>
        </div>
        <ScoreTable scores={scores} />
        <div className="comparison-help">
          <p>
            <strong>MAE</strong> is the average absolute forecast error.{" "}
            <strong>RMSE</strong> penalizes large misses more heavily.{" "}
            <strong>Bias</strong> shows whether forecasts were too high (+) or
            too low (−). An error of 2 pp means 20% forecast versus 18%
            realized, for example.
          </p>
        </div>
        <div className="panel-footnote">
          Positive improvement means lower MAE than persistence. Latency
          excludes training and checkpoint loading.
        </div>
      </section>
      <div className="two-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Accuracy by model</h2>
              <p>Mean absolute error · annualized percentage points</p>
            </div>
          </div>
          <Chart
            height={295}
            label="Model mean absolute error comparison"
            data={[
              {
                x: scores.map((s) => names[s.model]),
                y: scores.map((s) => s.mae * 100),
                type: "bar",
                marker: { color: scores.map((s) => colors[s.model]) },
                width: 0.42,
                text: scores.map((s) => pp(s.mae)),
                textposition: "outside",
                hovertemplate: "%{x}: %{y:.2f} pp<extra></extra>",
              },
            ]}
            layout={{
              yaxis: {
                gridcolor: "#1d2834",
                zeroline: false,
                title: { text: "MAE (pp)" },
              },
              margin: { t: 30, b: 50, l: 50, r: 30 },
            }}
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>XGBoost feature importance</h2>
              <p>Latest fitted model · gain-based, not causal</p>
            </div>
          </div>
          <Chart
            height={295}
            label="XGBoost feature importance"
            data={[
              {
                x: research.metadata.feature_importance
                  .slice(0, 7)
                  .reverse()
                  .map((f) => f.importance),
                y: research.metadata.feature_importance
                  .slice(0, 7)
                  .reverse()
                  .map((f) => f.feature),
                type: "bar",
                orientation: "h",
                marker: { color: "#81aafa" },
                hovertemplate: "%{y}: %{x:.3f}<extra></extra>",
              },
            ]}
            layout={{
              margin: { t: 14, b: 40, l: 105, r: 25 },
              xaxis: { gridcolor: "#1d2834", tickformat: ".0%" },
              yaxis: {
                showgrid: false,
                zeroline: false,
                side: "left",
                type: "category",
              },
            }}
          />
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Model availability & provenance</h2>
            <p>Unavailable models are excluded from rankings.</p>
          </div>
        </div>
        {order.map((m) => (
          <div className="availability-row" key={m}>
            <span>
              <span className="model-dot" style={{ background: colors[m] }} />
              <b>{names[m]}</b>
            </span>
            <span
              className={`status-pill ${research.metadata.models[m].status === "available" ? "ok" : ""}`}
            >
              {research.metadata.models[m].status}
            </span>
            <p>
              {research.metadata.models[m].reason ??
                (m === "timesfm3"
                  ? `${research.metadata.models[m].device?.toUpperCase()} · genuine google/timesfm-3.0-pytorch checkpoint`
                  : m === "xgboost"
                    ? "Expanding-window fits with matured labels"
                    : "Latest observed trailing five-session realized volatility")}
            </p>
          </div>
        ))}
      </section>
    </>
  );
}
