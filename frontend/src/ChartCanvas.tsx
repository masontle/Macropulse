import { useEffect, useRef, useState } from "react";
import type { Data, Layout, PlotlyHTMLElement } from "plotly.js";
// @ts-expect-error Official distribution bundle uses the plotly.js type definitions.
import Plotly from "plotly.js-basic-dist-min";

export default function ChartCanvas({
  data,
  layout = {},
  label,
  height = 370,
}: {
  data: Data[];
  layout?: Partial<Layout>;
  label: string;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let active = true;
    setError(false);
    void Promise.resolve(
      Plotly.react(
        element,
        data,
        {
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          font: { family: "Segoe UI, sans-serif", color: "#95a9be", size: 12 },
          margin: { t: 38, r: 65, b: 48, l: 35 },
          height,
          autosize: true,
          xaxis: {
            gridcolor: "#233142",
            zeroline: false,
            showgrid: false,
            nticks: 6,
          },
          yaxis: {
            gridcolor: "#233142",
            zeroline: false,
            tickformat: ".0%",
            side: "right",
          },
          legend: { orientation: "h", x: 0, y: 1.16, font: { size: 11 } },
          hovermode: "x unified",
          hoverlabel: { bgcolor: "#172330", bordercolor: "#40566e" },
          uirevision: label,
          ...layout,
        },
        {
          responsive: true,
          displaylogo: false,
          displayModeBar: "hover",
          scrollZoom: false,
          modeBarButtonsToRemove: ["lasso2d", "select2d"],
          toImageButtonOptions: {
            format: "png",
            filename: "macropulse-research",
            scale: 2,
          },
        },
      ),
    ).catch(() => {
      if (active) setError(true);
    });
    const observer = new ResizeObserver(() => {
      void Promise.resolve(
        Plotly.Plots.resize(element as unknown as PlotlyHTMLElement),
      ).catch(() => {});
    });
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [data, layout, label, height]);
  // Purge only on unmount; preserving the element keeps zoom stable during ordinary updates.
  useEffect(() => {
    const element = container.current;
    return () => {
      if (element) Plotly.purge(element);
    };
  }, []);
  return (
    <>
      <div
        ref={container}
        className="chart"
        role="img"
        aria-label={label}
        style={{ minHeight: height, display: error ? "none" : undefined }}
      />
      {error && (
        <div className="empty chart-error" role="alert">
          This chart could not render. Your data remain available in the tables
          and CSV export.
        </div>
      )}
    </>
  );
}
