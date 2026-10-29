import { useState } from "react";
import { X } from "lucide-react";
import Chart from "./Chart";
import type { Model, Prediction, Research } from "./types";
import { colors, names, order, pct, pp } from "./ui";

export default function Backtesting({
  research,
  predictions,
}: {
  research: Research;
  predictions: Prediction[];
}) {
  const [selected, setSelected] = useState<Model>(
    research.metadata.models.timesfm3.status === "available"
      ? "timesfm3"
      : "xgboost",
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [regime, setRegime] = useState("all");
  const invalid = Boolean(start && end && start > end);
  const available = order.filter(
    (m) => research.metadata.models[m].status === "available",
  );
  const rows = invalid
    ? []
    : predictions.filter(
        (p) =>
          p.model === selected &&
          (!start || p.origin >= start) &&
          (!end || p.origin <= end) &&
          (regime === "all" || p.regime === regime),
      );
  return (
    <>
      <section className="panel">
        <div className="backtest-controls">
          <label>
            Forecast model
            <select
              aria-label="Forecast model"
              value={selected}
              onChange={(e) => setSelected(e.target.value as Model)}
            >
              {available.map((m) => (
                <option key={m} value={m}>
                  {names[m]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Origin from
            <input
              aria-label="Origin from"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Origin through
            <input
              aria-label="Origin through"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            Regime
            <select
              aria-label="Backtest regime"
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
            >
              <option value="all">All observations</option>
              <option value="calm">Calm at origin</option>
              <option value="volatile">Volatile at origin</option>
            </select>
          </label>
          <button
            className="icon-button"
            aria-label="Reset filters"
            onClick={() => {
              setStart("");
              setEnd("");
              setRegime("all");
            }}
          >
            <X size={16} />
          </button>
        </div>
        {invalid ? (
          <div className="notice" role="alert">
            Start date must be on or before end date.
          </div>
        ) : (
          <>
            <div className="panel-heading">
              <div>
                <h2>Forecast vs. realized outcome</h2>
                <p>
                  {rows.length} matched origins · plotted at target end dates
                </p>
              </div>
              <span className="label">NON-OVERLAPPING</span>
            </div>
            {rows.length ? (
              <Chart
                label="Backtest predictions versus realized outcomes"
                data={[
                  {
                    x: rows.map((p) => p.target_end),
                    y: rows.map((p) => p.actual),
                    name: "Realized outcome",
                    type: "scatter",
                    mode: "lines",
                    line: { color: "#8e9eaf", width: 1.5 },
                  },
                  {
                    x: rows.map((p) => p.target_end),
                    y: rows.map((p) => p.prediction),
                    name: names[selected],
                    type: "scatter",
                    mode: "lines",
                    line: { color: colors[selected], width: 2 },
                  },
                ]}
              />
            ) : (
              <div className="empty">No forecasts match these filters.</div>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Forecast error</h2>
            <p>Prediction minus outcome · positive values overestimate risk</p>
          </div>
        </div>
        <Chart
          height={240}
          label="Forecast errors by target end date"
          data={[
            {
              x: rows.map((p) => p.target_end),
              y: rows.map((p) => (p.prediction - p.actual) * 100),
              type: "bar",
              marker: {
                color: rows.map((p) =>
                  p.prediction >= p.actual ? "#75dfb2" : "#db8c85",
                ),
              },
            },
          ]}
          layout={{
            yaxis: {
              title: { text: "Error (pp)" },
              gridcolor: "#1d2834",
              zerolinecolor: "#4a5c6e",
            },
          }}
        />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Forecast audit trail</h2>
            <p>
              Most recent 50 matching observations · full experiment available
              in CSV
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ORIGIN</th>
                <th>TARGET END</th>
                <th>FORECAST</th>
                <th>ACTUAL</th>
                <th>
                  ERROR <small>pp</small>
                </th>
                <th>REGIME AT ORIGIN</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(-50)
                .reverse()
                .map((p) => (
                  <tr key={p.origin}>
                    <td>{p.origin}</td>
                    <td className="muted">{p.target_end}</td>
                    <td className="numeric">{pct(p.prediction)}</td>
                    <td className="numeric">{pct(p.actual)}</td>
                    <td
                      className={`numeric ${p.prediction >= p.actual ? "positive" : "negative"}`}
                    >
                      {pp(p.prediction - p.actual)}
                    </td>
                    <td>
                      <span className="label">{p.regime}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
