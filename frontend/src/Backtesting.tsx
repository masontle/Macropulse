import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import Chart from "./Chart";
import type { Model, Prediction, Research } from "./types";
import { colors, downloadForecasts, Metric, names, order, pct, pp } from "./ui";

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
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [selected, start, end, regime]);
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
  const years = [
    ...new Set(predictions.map((p) => p.origin.slice(0, 4))),
  ].sort();
  const mae = rows.length
    ? rows.reduce((s, p) => s + Math.abs(p.prediction - p.actual), 0) /
      rows.length
    : null;
  const bias = rows.length
    ? rows.reduce((s, p) => s + p.prediction - p.actual, 0) / rows.length
    : null;
  const pages = Math.max(1, Math.ceil(rows.length / 15));
  const current = Math.min(page, pages);
  const tableRows = [...rows]
    .sort((a, b) => b.origin.localeCompare(a.origin))
    .slice((current - 1) * 15, current * 15);
  return (
    <>
      <div className="backtest-summary">
        <Metric
          title="MATCHING FORECASTS"
          value={String(rows.length)}
          caption={names[selected]}
        />
        <Metric
          title="AVERAGE ERROR"
          value={mae == null ? "—" : `${pp(mae)} pp`}
          caption="Absolute error · lower is better"
        />
        <Metric
          title="FORECAST BIAS"
          value={bias == null ? "—" : `${bias > 0 ? "+" : ""}${pp(bias)} pp`}
          caption={
            bias == null
              ? "No observations"
              : bias > 0
                ? "Overestimated volatility"
                : bias < 0
                  ? "Underestimated volatility"
                  : "No average directional error"
          }
        />
      </div>
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
            <X size={16} /> Reset
          </button>
        </div>
        <div className="range-presets">
          <span>Quick date range</span>
          <button
            className={!start && !end ? "active" : ""}
            onClick={() => {
              setStart("");
              setEnd("");
            }}
          >
            All years
          </button>
          {years.map((y) => (
            <button
              className={
                start === `${y}-01-01` && end === `${y}-12-31` ? "active" : ""
              }
              key={y}
              onClick={() => {
                setStart(`${y}-01-01`);
                setEnd(`${y}-12-31`);
              }}
            >
              {y}
            </button>
          ))}
          <button
            className="button"
            onClick={() =>
              downloadForecasts(
                rows,
                `${research.metadata.run_id}-${selected}-filtered`,
              )
            }
            disabled={invalid || !rows.length}
          >
            <Download size={14} />
            Export filtered forecasts
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
      {rows.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Forecast error</h2>
              <p>
                Prediction minus outcome · positive values overestimate risk
              </p>
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
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Forecast audit trail</h2>
            <p>
              Exact dates, predictions, and outcomes for the current selection
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
              {tableRows.map((p) => (
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
        <div className="pagination">
          <span>
            {rows.length
              ? `${(current - 1) * 15 + 1}–${Math.min(current * 15, rows.length)} of ${rows.length} forecasts`
              : "No matching forecasts"}
          </span>
          <div>
            <button
              className="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={current <= 1}
            >
              Previous
            </button>
            <button
              className="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={current >= pages}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
