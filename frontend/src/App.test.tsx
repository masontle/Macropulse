import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App from "./App";
import Backtesting from "./Backtesting";
import { forecastCsv } from "./ui";
import type { Model, Research } from "./types";

vi.mock("./Chart", () => ({
  default: ({ label }: { label: string }) => (
    <div role="img" aria-label={label} />
  ),
}));
const models: Model[] = ["timesfm3", "xgboost", "persistence"];
const fixture: Research = {
  metadata: {
    run_id: "test-run",
    created_at: "2026-10-28",
    test_first_origin: "2024-01-02",
    test_last_origin: "2026-10-20",
    test_origins: 1,
    validation_origins: 100,
    duration_seconds: 1,
    seed: 42,
    config: {
      context_length: 256,
      origin_stride: 5,
      refit_every: 20,
      max_test_origins: null,
    },
    models: {
      timesfm3: { status: "unavailable", reason: "Unit test fixture" },
      xgboost: { status: "available" },
      persistence: { status: "available" },
    },
    provenance: {
      source: "UNIT TEST FIXTURE",
      retrieved_at: "2026-10-28",
      last_session: "2026-10-28",
      sha256: "abc",
      rows: 2973,
    },
    feature_importance: [{ feature: "rv5", importance: 0.5 }],
    pretraining_caveat: "Test only",
  },
  metrics: ["all", "calm", "volatile"].flatMap((regime) =>
    models
      .filter((m) => m !== "timesfm3")
      .map((model) => ({
        model,
        regime,
        n: 1,
        mae: 0.02,
        rmse: 0.03,
        bias: 0.001,
        improvement_pct: 0,
        latency_ms: 1,
        raw_mae: 0.02,
        clipped_count: 0,
      })),
  ),
  forecasts: {
    origin: "2026-10-28",
    sessions: [
      "2026-10-29",
      "2026-10-30",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ],
    generated_at: "2026-10-28",
    models: {
      xgboost: {
        value: 0.12,
        raw_value: 0.12,
        latency_ms: 1,
        path: null,
        lower: null,
        upper: null,
      },
      persistence: {
        value: 0.11,
        raw_value: 0.11,
        latency_ms: 1,
        path: null,
        lower: null,
        upper: null,
      },
    },
  },
};
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const body = path.includes("/market")
        ? {
            data: [
              {
                date: "2026-10-28",
                close: 600,
                adjusted_close: 600,
                volume: 100,
                log_return: 0.01,
                rv5: 0.11,
                rv21: 0.12,
              },
            ],
          }
        : path.includes("/backtests")
          ? [
              {
                origin: "2026-10-20",
                target_end: "2026-10-27",
                model: "xgboost",
                prediction: 0.12,
                actual: 0.1,
                raw_prediction: 0.12,
                regime: "calm",
                train_label_end: "2026-10-20",
              },
            ]
          : path.includes("/runs")
            ? [{ run_id: "test-run", created_at: "2026-10-28" }]
            : fixture;
      return { ok: true, json: async () => body };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard integration with the API contract (mocked responses)", () => {
  it("pins market and history requests to the same resolved experiment", async () => {
    render(<App />);
    await screen.findByText("$600.00");
    expect(fetch).toHaveBeenCalledWith(
      "/api/backtests?run_id=test-run",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/market?run_id=test-run",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it("changes the headline model and switches to the price view", async () => {
    render(<App />);
    await screen.findByText("$600.00");
    fireEvent.change(screen.getByLabelText("Overview forecast model"), {
      target: { value: "persistence" },
    });
    expect(screen.getByText("Persistence estimate")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "SPY price" }));
    expect(
      screen.getByRole("img", { name: "SPY closing price history" }),
    ).toBeInTheDocument();
  });
  it("disables exporting old data while a reload is in flight", async () => {
    render(<App />);
    await screen.findByText("$600.00");
    expect(
      screen.getByRole("button", { name: "Export full experiment" }),
    ).toBeEnabled();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload results" }));
    expect(
      screen.getByRole("button", { name: "Export full experiment" }),
    ).toBeDisabled();
  });
  it("keeps market data useful when no experiment exists", async () => {
    const saved = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, options: RequestInit) =>
        path.includes("/research")
          ? Promise.resolve({
              ok: false,
              json: async () => ({ detail: "No experiment" }),
            })
          : saved(path, options),
      ),
    );
    render(<App />);
    expect(await screen.findByText("$600.00")).toBeInTheDocument();
    expect(screen.getByText(/Market data are available/)).toBeInTheDocument();
    expect(screen.getByLabelText("Overview forecast model")).toBeDisabled();
  });
  it("exports unambiguous units and only the selected rows", () => {
    const row = {
      origin: "2026-01-02",
      target_end: "2026-01-09",
      model: "xgboost" as const,
      prediction: 0.2,
      actual: 0.18,
      raw_prediction: 0.2,
      regime: "calm",
      train_label_end: null,
    };
    const csv = forecastCsv([row]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("error_percentage_points");
    expect(Number(lines[1].split(",")[5])).toBeCloseTo(2);
  });
  it("renders market data, switches history windows, and toggles models", async () => {
    render(<App />);
    expect(await screen.findByText("$600.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1M" }));
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "XGBoost" }));
    expect(screen.getByRole("checkbox", { name: "XGBoost" })).not.toBeChecked();
  });
  it("navigates comparison and filters regimes", async () => {
    render(<App />);
    await screen.findByText("$600.00");
    fireEvent.click(screen.getByRole("button", { name: "Model comparison" }));
    expect(screen.getByText("Out-of-sample performance")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Market regime"), {
      target: { value: "calm" },
    });
    expect(screen.getByLabelText("Market regime")).toHaveValue("calm");
    expect(screen.getByText("Unit test fixture")).toBeInTheDocument();
  });
  it("filters backtests, rejects invalid dates, and resets filters", async () => {
    render(<App />);
    await screen.findByText("$600.00");
    fireEvent.click(
      screen.getByRole("button", { name: "Historical backtesting" }),
    );
    expect(screen.getByText(/1 matched origins/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Origin from"), {
      target: { value: "2027-01-01" },
    });
    expect(
      screen.getByText("No forecasts match these filters."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Origin through"), {
      target: { value: "2026-01-01" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Start date must be on or before end date.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByText(/1 matched origins/)).toBeInTheDocument();
  });
  it("shows methodology and handles API errors without invented data", async () => {
    const { unmount } = render(<App />);
    await screen.findByText("$600.00");
    fireEvent.click(
      screen.getByRole("button", { name: "Research & methodology" }),
    );
    expect(screen.getByText("Experiment manifest")).toBeInTheDocument();
    unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ detail: "No actual data" }),
      })),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No actual data"),
    );
    expect(screen.queryByText("$600.00")).not.toBeInTheDocument();
  });
});

describe("reviewed navigation and forecast pagination", () => {
  it("restores the overview when browser history returns to the root URL", async () => {
    render(<App />);
    await screen.findByText("$600.00");
    fireEvent.click(screen.getByRole("button", { name: "Model comparison" }));
    window.history.replaceState(null, "", "/");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(
      screen.getByRole("heading", { level: 1, name: "Market overview" }),
    ).toBeInTheDocument();
  });
  it("paginates the entire selected history and resets the page when dates change", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      origin: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
      target_end: "2026-02-01",
      model: "xgboost" as const,
      prediction: 0.12,
      actual: 0.1,
      raw_prediction: 0.12,
      regime: "calm",
      train_label_end: null,
    }));
    render(<Backtesting research={fixture} predictions={rows} />);
    expect(screen.getByText("1–15 of 20 forecasts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("16–20 of 20 forecasts")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Origin from"), {
      target: { value: "2026-01-19" },
    });
    expect(screen.getByText("1–2 of 2 forecasts")).toBeInTheDocument();
  });
});
