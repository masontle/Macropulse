import { useEffect, useRef } from "react";
import type { Data, Layout, PlotlyHTMLElement } from "plotly.js";
// @ts-expect-error The official distribution bundle uses @types/plotly.js.
import Plotly from "plotly.js-basic-dist-min";

export default function Chart({
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
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    void Plotly.react(
      element,
      data,
      {
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { family: "Segoe UI, sans-serif", color: "#7f91a6", size: 11 },
        margin: { t: 22, r: 30, b: 42, l: 50 },
        height,
        autosize: true,
        xaxis: {
          gridcolor: "#192430",
          zeroline: false,
          showgrid: false,
          nticks: 6,
        },
        yaxis: {
          gridcolor: "#1d2834",
          zeroline: false,
          tickformat: ".0%",
          side: "right",
          ticksuffix: " ",
        },
        legend: { orientation: "h", x: 0, y: 1.14, font: { size: 11 } },
        hovermode: "x unified",
        hoverlabel: { bgcolor: "#172330", bordercolor: "#344457" },
        ...layout,
      },
      {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        toImageButtonOptions: {
          format: "png",
          filename: "macropulse-research",
          scale: 2,
        },
      },
    );
    const observer = new ResizeObserver(() =>
      Plotly.Plots.resize(element as unknown as PlotlyHTMLElement),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      Plotly.purge(element);
    };
  }, [data, layout, height]);
  return (
    <div
      className="chart"
      ref={container}
      role="img"
      aria-label={label}
      style={{ minHeight: height }}
    />
  );
}
