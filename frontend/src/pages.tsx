import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  FlaskConical,
  History,
  Layers3,
} from "lucide-react";
import type { Data } from "plotly.js";
import Chart from "./Chart";
import type { MarketRow, Model, Research } from "./types";
import {
  colors,
  dateLabel,
  dollar,
  Metric,
  names,
  order,
  pct,
  pp,
  ScoreTable,
} from "./ui";
export { default as Backtesting } from "./Backtesting";
export { default as Methodology } from "./Methodology";

export function Overview({
  market,
  research,
  onMethodology,
}: {
  market: MarketRow[];
  research: Research;
  onMethodology: () => void;
}) {
  const [window, setWindow] = useState("6M");
  const [visible, setVisible] = useState<Model[]>(order);
  const latest = market.at(-1);
  const best = research.metrics
    .filter((s) => s.regime === "all")
    .sort((a, b) => a.mae - b.mae)[0];
  const model = research.forecasts.models.timesfm3 ? "timesfm3" : "xgboost";
  const forecast = research.forecasts;
  const traces = useMemo((): Data[] => {
    const lengths: Record<string, number> = {
      "1M": 21,
      "3M": 63,
      "6M": 126,
      "1Y": 252,
      ALL: 10000,
    };
    const history = market.slice(-lengths[window]);
    const series: Data[] = [
      {
        x: history.map((r) => r.date),
        y: history.map((r) => r.rv5),
        type: "scatter",
        mode: "lines",
        name: "Observed RV · 5d",
        line: { color: "#8e9eaf", width: 1.5 },
        fill: "tozeroy",
        fillcolor: "rgba(142,158,175,0.035)",
      },
    ];
    for (const m of visible) {
      const result = forecast.models[m];
      if (!result) continue;
      const x =
        m === "timesfm3" && result.path
          ? forecast.sessions
          : [forecast.sessions.at(-1)!];
      series.push({
        x,
        y: m === "timesfm3" && result.path ? result.path : [result.value],
        name: names[m],
        type: "scatter",
        mode: x.length > 1 ? "lines+markers" : "markers",
        line: { color: colors[m], width: 2, dash: "dot" },
        marker: {
          color: colors[m],
          size: 7,
          symbol: m === "persistence" ? "diamond" : "circle",
        },
      });
      if (m === "timesfm3" && result.lower && result.upper) {
        series.push({
          x: forecast.sessions,
          y: result.upper,
          type: "scatter",
          mode: "lines",
          line: { width: 0 },
          showlegend: false,
          hoverinfo: "skip",
        });
        series.push({
          x: forecast.sessions,
          y: result.lower,
          type: "scatter",
          mode: "lines",
          line: { width: 0 },
          fill: "tonexty",
          fillcolor: "rgba(117,223,178,0.10)",
          name: "TimesFM 10–90% quantiles",
          hoverinfo: "skip",
        });
      }
    }
    return series;
  }, [market, window, visible, forecast]);
  return (
    <>
      <div className="metrics-grid">
        <Metric
          title="SPY LAST CLOSE"
          value={dollar(latest?.close)}
          caption="adjusted daily return"
          change={
            latest?.log_return != null ? Math.expm1(latest.log_return) : null
          }
        />
        <Metric
          title="REALIZED VOLATILITY"
          value={pct(latest?.rv5)}
          caption="5-session trailing · annualized"
        />
        <Metric
          title="5-SESSION FORECAST"
          value={pct(forecast.models[model]?.value)}
          caption={`${names[model]} · annualized`}
          accent
        />
        <Metric
          title="LOWEST TEST MAE"
          value={best ? `${pp(best.mae)} pp` : "—"}
          caption={
            best
              ? `${names[best.model]} · ${best.n} origins`
              : "No evaluated origins"
          }
        />
      </div>
      <section className="panel main-chart">
        <div className="panel-heading">
          <div>
            <h2>
              Volatility outlook <span className="label">ANNUALIZED</span>
            </h2>
            <p>Observed risk and the next five trading sessions</p>
          </div>
          <div className="segmented" aria-label="Historical window">
            {["1M", "3M", "6M", "1Y", "ALL"].map((w) => (
              <button
                key={w}
                className={window === w ? "selected" : ""}
                onClick={() => setWindow(w)}
                aria-pressed={window === w}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <Chart
          data={traces}
          label="Historical realized volatility and model forecasts"
          layout={{
            shapes: [
              {
                type: "line",
                x0: forecast.origin,
                x1: forecast.origin,
                y0: 0,
                y1: 1,
                yref: "paper",
                line: { color: "#4b6174", dash: "dot", width: 1 },
              },
            ],
            annotations: [
              {
                x: forecast.sessions[2],
                y: 1,
                yref: "paper",
                text: "FORECAST",
                showarrow: false,
                font: { size: 9, color: "#75dfb2" },
              },
            ],
          }}
        />
        <div className="chart-footer">
          <span>Origin · {dateLabel(forecast.origin)}</span>
          <span>Target ends · {dateLabel(forecast.sessions.at(-1))}</span>
          <span>10–90% quantiles · uncalibrated</span>
        </div>
      </section>
      <div className="model-toggles">
        {order.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={visible.includes(m)}
              onChange={() =>
                setVisible((v) =>
                  v.includes(m) ? v.filter((i) => i !== m) : [...v, m],
                )
              }
            />
            <span style={{ color: colors[m] }}>{names[m]}</span>
          </label>
        ))}
      </div>
      <div className="two-columns">
        <section className="panel forecast-panel">
          <div className="panel-heading">
            <div>
              <h2>Forecast signals</h2>
              <p>Same target. Different approaches.</p>
            </div>
            <span className="label">5 SESSIONS</span>
          </div>
          {order.map((m) => (
            <div className="forecast-row" key={m}>
              <span className="forecast-icon" style={{ color: colors[m] }}>
                {m === "timesfm3" ? (
                  <Activity size={17} />
                ) : m === "xgboost" ? (
                  <Layers3 size={17} />
                ) : (
                  <History size={17} />
                )}
              </span>
              <div>
                <b>{names[m]}</b>
                <small>
                  {m === "timesfm3"
                    ? "Pretrained foundation model"
                    : m === "xgboost"
                      ? "Supervised gradient boosting"
                      : "Last observed volatility"}
                </small>
              </div>
              <div className="forecast-number">
                {pct(forecast.models[m]?.value)}
                <small>
                  {forecast.models[m]
                    ? "annualized RV"
                    : research.metadata.models[m].status}
                </small>
              </div>
            </div>
          ))}
        </section>
        <section className="panel research-note">
          <span className="eyebrow">
            <FlaskConical size={13} /> THE RESEARCH QUESTION
          </span>
          <h3>
            Can a foundation model
            <br />
            forecast financial risk?
          </h3>
          <p>
            We compare TimesFM 3 with XGBoost and a persistence baseline on the
            same forward volatility target.
          </p>
          <div className="note-facts">
            <span>
              <b>{research.metadata.test_origins}</b> test origins
            </span>
            <span>
              <b>5</b> session horizon
            </span>
            <span>
              <b>0</b> fine-tuning steps
            </span>
          </div>
          <button className="text-button" onClick={onMethodology}>
            Explore the methodology <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </>
  );
}

export function Comparison({ research }: { research: Research }) {
  const [regime, setRegime] = useState("all");
  const scores = research.metrics.filter((s) => s.regime === regime);
  return (
    <>
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
