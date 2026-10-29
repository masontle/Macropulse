import { ArrowDownRight, ArrowUpRight, CircleHelp } from "lucide-react";
import type { Model, Score } from "./types";

export const names: Record<Model, string> = {
  timesfm3: "TimesFM 3",
  xgboost: "XGBoost",
  persistence: "Persistence",
};
export const colors: Record<Model, string> = {
  timesfm3: "#75dfb2",
  xgboost: "#81aafa",
  persistence: "#d5ad71",
};
export const order: Model[] = ["timesfm3", "xgboost", "persistence"];
export const pct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;
export const pp = (v: number) => `${(v * 100).toFixed(2)}`;
export const dateLabel = (value: string | undefined) =>
  value
    ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
export const dollar = (v: number | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function Metric({
  title,
  value,
  caption,
  accent = false,
  change,
}: {
  title: string;
  value: string;
  caption: string;
  accent?: boolean;
  change?: number | null;
}) {
  return (
    <article className={`metric ${accent ? "metric-accent" : ""}`}>
      <div className="metric-label">
        {title}
        <CircleHelp size={13} aria-hidden="true" />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-caption">
        {change != null && (
          <span className={change >= 0 ? "positive" : "negative"}>
            {change >= 0 ? (
              <ArrowUpRight size={13} />
            ) : (
              <ArrowDownRight size={13} />
            )}{" "}
            {pct(Math.abs(change))}
          </span>
        )}
        {caption}
      </div>
    </article>
  );
}

export function ScoreTable({ scores }: { scores: Score[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>MODEL</th>
            <th>
              MAE <small>pp ↓</small>
            </th>
            <th>
              RMSE <small>pp ↓</small>
            </th>
            <th>
              BIAS <small>pp</small>
            </th>
            <th>VS. BASELINE</th>
            <th>LATENCY</th>
          </tr>
        </thead>
        <tbody>
          {[...scores]
            .sort((a, b) => a.mae - b.mae)
            .map((s, i) => (
              <tr key={s.model}>
                <td>
                  <span
                    className="model-dot"
                    style={{ background: colors[s.model] }}
                  />
                  {names[s.model]}
                  {i === 0 && <span className="best-label">LOWEST MAE</span>}
                </td>
                <td className="numeric strong">{pp(s.mae)}</td>
                <td className="numeric">{pp(s.rmse)}</td>
                <td className="numeric">
                  {s.bias > 0 ? "+" : ""}
                  {pp(s.bias)}
                </td>
                <td
                  className={`numeric ${s.improvement_pct != null && s.improvement_pct > 0 ? "positive" : s.improvement_pct != null && s.improvement_pct < 0 ? "negative" : ""}`}
                >
                  {s.improvement_pct == null
                    ? "—"
                    : `${s.improvement_pct > 0 ? "+" : ""}${s.improvement_pct.toFixed(1)}%`}
                </td>
                <td className="numeric muted">
                  {s.latency_ms < 1 ? "<1" : s.latency_ms.toFixed(0)} ms
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
