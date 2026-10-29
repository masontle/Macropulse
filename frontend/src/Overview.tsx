import { useMemo, useState } from "react";
import { ArrowRight, Activity, ChevronRight, Sparkles } from "lucide-react";
import type { Data } from "plotly.js";
import Chart from "./Chart";
import type { MarketRow, Model, Research } from "./types";
import { colors, dateLabel, dollar, Metric, names, order, pct, pp } from "./ui";

export default function Overview({
  market,
  research,
  onMethodology,
}: {
  market: MarketRow[];
  research: Research | null;
  onMethodology: () => void;
}) {
  const [window, setWindow] = useState("3M");
  const [kind, setKind] = useState("volatility");
  const available = order.filter((m) => research?.forecasts.models[m] != null);
  const [model, setModel] = useState<Model>(available[0] ?? "timesfm3");
  const [visible, setVisible] = useState<Model[]>(available);
  const latest = market.at(-1);
  const forecast = research?.forecasts;
  const selected = forecast?.models[model];
  const delta =
    selected && latest?.rv5 != null ? selected.value - latest.rv5 : null;
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
        y: history.map((r) => (kind === "price" ? r.close : r.rv5)),
        type: "scatter",
        mode: "lines",
        name:
          kind === "price"
            ? "SPY closing price"
            : "Recent volatility · observed",
        line: { color: "#a2b7cf", width: 2 },
        fill: "tozeroy",
        fillcolor: "rgba(135,165,201,0.045)",
      },
    ];
    if (kind === "price" || !forecast) return series;
    for (const m of visible) {
      const result = forecast.models[m];
      if (!result) continue;
      const x =
        m === "timesfm3" && result.path
          ? forecast.sessions
          : [forecast.sessions.at(-1)!];
      if (m === model && m === "timesfm3" && result.lower && result.upper) {
        series.push({
          x,
          y: result.upper,
          type: "scatter",
          mode: "lines",
          line: { width: 0 },
          showlegend: false,
          hoverinfo: "skip",
        });
        series.push({
          x,
          y: result.lower,
          type: "scatter",
          mode: "lines",
          line: { width: 0 },
          fill: "tonexty",
          fillcolor: "rgba(117,223,178,0.12)",
          name: "TimesFM 10–90% quantiles",
          hoverinfo: "skip",
        });
      }
      series.push({
        x,
        y: m === "timesfm3" && result.path ? result.path : [result.value],
        type: "scatter",
        name: names[m],
        mode: x.length > 1 ? "lines+markers" : "markers",
        line: { color: colors[m], width: m === model ? 3 : 1.5, dash: "dot" },
        marker: {
          size: m === model ? 9 : 7,
          color: colors[m],
          symbol: m === "persistence" ? "diamond" : "circle",
        },
        hovertemplate: "%{y:.2%}<extra>%{fullData.name}</extra>",
      });
    }
    return series;
  }, [market, window, kind, forecast, visible, model]);
  const scores =
    research?.metrics
      .filter((s) => s.regime === "all")
      .sort((a, b) => a.mae - b.mae) ?? [];
  return (
    <>
      <div className="overview-grid">
        <section className="forecast-hero panel">
          <div className="hero-top">
            <span className="eyebrow">
              <Sparkles size={15} />
              FIVE TRADING SESSIONS AHEAD
            </span>
            <span className="label">ANNUALIZED VOLATILITY</span>
          </div>
          <div className="hero-main">
            <div>
              <p className="hero-question">
                How much variability do the models expect?
              </p>
              <div className="hero-value">
                {pct(selected?.value)}
                <span>
                  {selected
                    ? `${names[model]} estimate`
                    : "Run an experiment to see a forecast"}
                </span>
              </div>
              {delta != null && (
                <p className="forecast-change">
                  {pp(Math.abs(delta))} percentage points{" "}
                  {delta <= 0 ? "below" : "above"} recent volatility
                </p>
              )}
            </div>
            <Activity className="hero-watermark" size={105} strokeWidth={1} />
          </div>
          <div className="hero-bottom">
            <span>
              From <b>{dateLabel(forecast?.origin)}</b> to{" "}
              <b>{dateLabel(forecast?.sessions.at(-1))}</b>
            </span>
            <label>
              Forecast model
              <select
                aria-label="Overview forecast model"
                value={model}
                onChange={(e) => {
                  const m = e.target.value as Model;
                  setModel(m);
                  setVisible((v) => (v.includes(m) ? v : [...v, m]));
                }}
                disabled={!available.length}
              >
                {available.length ? (
                  available.map((m) => (
                    <option key={m} value={m}>
                      {names[m]}
                    </option>
                  ))
                ) : (
                  <option value="timesfm3">No forecast available</option>
                )}
              </select>
            </label>
          </div>
          <p className="hero-explanation">
            Volatility describes how much returns vary. This estimate is scaled
            to a year; it is not an expected price return over the next five
            days.
          </p>
        </section>
        <div className="snapshot-metrics">
          <Metric
            title="SPY LAST CLOSE"
            value={dollar(latest?.close)}
            caption="adjusted daily return"
            change={
              latest?.log_return != null ? Math.expm1(latest.log_return) : null
            }
            help="The last completed market session's closing price. The daily return includes dividend and split adjustments."
          />
          <Metric
            title="RECENT VOLATILITY"
            value={pct(latest?.rv5)}
            caption="Past 5 trading sessions · annualized"
            help="Observed realized volatility from the last five daily log returns, scaled by 252 trading sessions per year."
          />
        </div>
      </div>
      <section className="panel main-chart">
        <div className="panel-heading">
          <div>
            <h2>
              {kind === "price"
                ? "SPY price history"
                : "Recent volatility & model forecasts"}
            </h2>
            <p>
              {kind === "price"
                ? "Unadjusted daily closing prices in US dollars"
                : "History on the left. Future forecasts after the vertical line."}
            </p>
          </div>
          <div className="segmented" aria-label="Historical window">
            {["1M", "3M", "6M", "1Y", "ALL"].map((w) => (
              <button
                key={w}
                aria-pressed={window === w}
                className={window === w ? "selected" : ""}
                onClick={() => setWindow(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-controls">
          <div className="segmented">
            {["volatility", "price"].map((k) => (
              <button
                key={k}
                aria-pressed={kind === k}
                className={kind === k ? "selected" : ""}
                onClick={() => setKind(k)}
              >
                {k === "price" ? "SPY price" : "Volatility"}
              </button>
            ))}
          </div>
          {kind === "volatility" && (
            <div className="model-toggles">
              {order.map((m) => (
                <label
                  key={m}
                  className={!available.includes(m) ? "unavailable" : ""}
                >
                  <input
                    type="checkbox"
                    checked={visible.includes(m)}
                    disabled={!available.includes(m)}
                    onChange={() =>
                      setVisible((v) =>
                        v.includes(m) ? v.filter((x) => x !== m) : [...v, m],
                      )
                    }
                  />
                  <span style={{ color: colors[m] }}>
                    {names[m]}
                    {!available.includes(m) ? " · unavailable" : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <Chart
          data={traces}
          label={
            kind === "price"
              ? "SPY closing price history"
              : "Historical realized volatility and model forecasts"
          }
          layout={{
            uirevision: `${kind}-${window}-${research?.metadata.run_id}`,
            yaxis: {
              gridcolor: "#233142",
              zeroline: false,
              tickformat: kind === "price" ? "$,.0f" : ".0%",
              side: "right",
              rangemode: kind === "price" ? "normal" : "tozero",
            },
            ...(forecast && kind === "volatility"
              ? {
                  shapes: [
                    {
                      type: "rect",
                      x0: forecast.origin,
                      x1: forecast.sessions.at(-1),
                      y0: 0,
                      y1: 1,
                      yref: "paper",
                      fillcolor: "rgba(117,223,178,0.035)",
                      line: { width: 0 },
                      layer: "below",
                    },
                    {
                      type: "line",
                      x0: forecast.origin,
                      x1: forecast.origin,
                      y0: 0,
                      y1: 1,
                      yref: "paper",
                      line: { color: "#6a8b80", dash: "dot", width: 1 },
                    },
                  ],
                }
              : {}),
          }}
        />
        <div className="chart-footer">
          <span>
            {kind === "price"
              ? "Each point is a completed session close."
              : "Compare model endpoints at the final forecast date."}
          </span>
          <span>Drag to zoom · Double-click to reset</span>
        </div>
      </section>
      <div className="two-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Forecasts, side by side</h2>
              <p>Same dates and target. Different modeling approaches.</p>
            </div>
          </div>
          {order.map((m) => (
            <button
              className={`forecast-row selectable ${model === m ? "selected-model" : ""}`}
              key={m}
              disabled={!forecast?.models[m]}
              onClick={() => {
                setModel(m);
                setVisible((v) => (v.includes(m) ? v : [...v, m]));
              }}
            >
              <span className="forecast-icon" style={{ color: colors[m] }}>
                <Activity size={18} />
              </span>
              <div>
                <b>{names[m]}</b>
                <small>
                  {m === "timesfm3"
                    ? "Pretrained time-series model"
                    : m === "xgboost"
                      ? "Learns from historical features"
                      : "Assumes recent volatility persists"}
                </small>
              </div>
              <div className="forecast-number">
                {pct(forecast?.models[m]?.value)}
                <small>
                  {forecast?.models[m]
                    ? "annualized forecast"
                    : research?.metadata.models[m]?.latest_error
                      ? "Latest inference unavailable"
                      : (research?.metadata.models[m]?.status ??
                        "Not evaluated")}
                </small>
              </div>
              <ChevronRight size={16} />
            </button>
          ))}
        </section>
        <section className="panel research-note">
          <span className="eyebrow">WHAT THE HISTORICAL TEST FOUND</span>
          <h3>
            {scores.length
              ? `${names[scores[0].model]} had the lowest average error.`
              : "Start a reproducible model comparison."}
          </h3>
          <p>
            {scores.length
              ? `${research?.metadata.test_origins} non-overlapping forecasts per model. Lower average error means closer predictions on this historical sample.`
              : "Download market history and run an experiment to compare genuine model predictions."}
          </p>
          {scores[0] && (
            <div className="note-facts">
              <span>
                <b>{pp(scores[0].mae)} pp</b>average absolute error
              </span>
              <span>
                <b>{scores[0].n}</b>historical forecasts
              </span>
            </div>
          )}
          <button className="text-button" onClick={onMethodology}>
            Understand the research <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <details className="reading-guide panel">
        <summary>
          New to volatility? Start here <span>Three useful definitions</span>
        </summary>
        <div className="guide-grid">
          <div>
            <b>Recent volatility</b>
            <p>
              What happened over the past five trading sessions, calculated from
              adjusted market prices.
            </p>
          </div>
          <div>
            <b>Forecast volatility</b>
            <p>
              An estimate for the next five trading sessions. It measures
              variability, not market direction.
            </p>
          </div>
          <div>
            <b>Annualized / percentage points</b>
            <p>
              Annualized puts volatility on a common yearly scale. A forecast of
              20% versus an outcome of 18% has a 2 percentage-point error.
            </p>
          </div>
        </div>
      </details>
    </>
  );
}
