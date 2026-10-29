import { Component, lazy, Suspense } from "react";
import type { ReactNode } from "react";
import type { Data, Layout } from "plotly.js";
const Canvas = lazy(() => import("./ChartCanvas"));
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="empty chart-error" role="alert">
        <p>
          The chart library could not load. Tables and exports are still
          available.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Reload page
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function Plot(props: {
  data: Data[];
  layout?: Partial<Layout>;
  label: string;
  height?: number;
}) {
  return (
    <Boundary>
      <Suspense
        fallback={
          <div
            className="chart-loading"
            role="status"
            style={{ minHeight: props.height ?? 370 }}
          >
            Loading interactive chart…
          </div>
        }
      >
        <Canvas {...props} />
      </Suspense>
    </Boundary>
  );
}
