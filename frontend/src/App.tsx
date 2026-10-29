import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronDown,
  Database,
  Download,
  ExternalLink,
  FlaskConical,
  History,
  Layers3,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Overview, Comparison, Backtesting, Methodology } from "./pages";
import { dateLabel, order } from "./ui";
import type { MarketRow, Prediction, Research } from "./types";

const pages = [
  {
    title: "Market overview",
    icon: LayoutDashboard,
    eyebrow: "MARKET INTELLIGENCE",
    subtitle: "A clearer view of the risk ahead.",
  },
  {
    title: "Model comparison",
    icon: Layers3,
    eyebrow: "MODEL EVALUATION",
    subtitle: "Three approaches. One common target.",
  },
  {
    title: "Historical backtesting",
    icon: History,
    eyebrow: "HISTORICAL RESEARCH",
    subtitle: "Inspect every forecast against its outcome.",
  },
  {
    title: "Research & methodology",
    icon: BookOpen,
    eyebrow: "RESEARCH FRAMEWORK",
    subtitle: "The assumptions behind the numbers.",
  },
];

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `API returned ${response.status}`);
  }
  return response.json();
}

export default function App() {
  const [page, setPage] = useState(0);
  const [market, setMarket] = useState<MarketRow[]>([]);
  const [research, setResearch] = useState<Research | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [runs, setRuns] = useState<{ run_id: string; created_at: string }[]>(
    [],
  );
  const [selectedRun, setSelectedRun] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = selectedRun
      ? `?run_id=${encodeURIComponent(selectedRun)}`
      : "";
    Promise.all([
      get<{ data: MarketRow[] }>("/api/market", controller.signal),
      get<Research>(`/api/research${query}`, controller.signal),
      get<Prediction[]>(`/api/backtests${query}`, controller.signal),
      get<{ run_id: string; created_at: string }[]>(
        "/api/runs",
        controller.signal,
      ),
    ])
      .then(([m, r, p, rs]) => {
        setMarket(m.data);
        setResearch(r);
        setPredictions(p);
        setRuns(rs);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload, selectedRun]);

  const latest = market.at(-1);
  const available = order.filter(
    (m) => research?.metadata.models[m]?.status === "available",
  );
  function exportCsv() {
    const csv = [
      "origin,target_end,model,prediction,actual,error,regime",
      ...predictions.map((p) =>
        [
          p.origin,
          p.target_end,
          p.model,
          p.prediction,
          p.actual,
          p.prediction - p.actual,
          p.regime,
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `macropulse-${research?.metadata.run_id ?? "research"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage(0);
          }}
        >
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span>
            Macro<span className="brand-light">Pulse</span>
            <small>VOLATILITY RESEARCH</small>
          </span>
        </a>
        <div className="workspace">
          <div className="workspace-icon">
            <FlaskConical size={16} />
          </div>
          <span>
            Research workspace<small>Local environment</small>
          </span>
          <ChevronDown size={13} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {pages.map((p, i) => (
            <button
              key={p.title}
              className={page === i ? "nav-item active" : "nav-item"}
              onClick={() => {
                setPage(i);
                setMenu(false);
              }}
              aria-current={page === i ? "page" : undefined}
            >
              <p.icon size={17} />
              {p.title}
              {i === 0 && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-data">
          <span className="nav-label">RESEARCH UNIVERSE</span>
          <div className="universe">
            <span className="ticker-icon">S</span>
            <span>
              <b>SPY</b>
              <small>S&P 500 ETF</small>
            </span>
            <span className="live-dot" />
          </div>
          <p>
            Daily adjusted prices
            <br />
            Five-session forecast horizon
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="local-tag">
            <span className="live-dot" /> LOCAL RESEARCH
          </span>
          <p>Evidence over assumptions.</p>
          <a
            href="https://github.com/masontle/Macropulse"
            target="_blank"
            rel="noreferrer"
          >
            Project repository <ExternalLink size={12} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>{pages[page].title}</strong>
          </div>
          <div className="topbar-right">
            <span className="research-badge">
              <FlaskConical size={12} /> RESEARCH EDITION
            </span>
            <a
              className="icon-button"
              href="/docs"
              target="_blank"
              rel="noreferrer"
              aria-label="Open API documentation"
            >
              <Terminal size={17} />
            </a>
            <span className="avatar">MP</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> {pages[page].eyebrow}
              </div>
              <h1>{pages[page].title}</h1>
              <p>{pages[page].subtitle}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button"
                onClick={() => setReload((n) => n + 1)}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} /> Reload
                results
              </button>
              <button
                className="button primary"
                onClick={exportCsv}
                disabled={!predictions.length}
              >
                <Download size={14} /> Export data
              </button>
            </div>
          </div>
          {error ? (
            <section className="setup panel" role="alert">
              <Database size={30} />
              <h2>Your research workspace is ready for data.</h2>
              <p>{error}</p>
              <p>
                Run these commands from the repository, then reload results.
              </p>
              <pre>
                .\.venv\Scripts\macropulse.exe refresh{"\n"}
                .\.venv\Scripts\macropulse.exe experiment
              </pre>
              <button
                className="button"
                onClick={() => setReload((n) => n + 1)}
              >
                Retry connection <ArrowRight size={14} />
              </button>
            </section>
          ) : loading ? (
            <section className="loading panel">
              <Activity className="spin" />
              <p>Loading local research artifacts…</p>
            </section>
          ) : (
            research && (
              <>
                <div className="context-strip">
                  <span className="symbol-pill">
                    SPY <span>NYSE ARCA</span>
                  </span>
                  <span className="context-description">
                    SPDR S&P 500 ETF Trust
                  </span>
                  <span className="strip-divider" />
                  <span>
                    <span className="live-dot" /> {available.length}/3 models
                    available
                  </span>
                  <span className="as-of">
                    Market close · {dateLabel(latest?.date)}
                  </span>
                </div>
                {latest && latest.date !== research.forecasts.origin && (
                  <div className="notice">
                    Forecast origin: {dateLabel(research.forecasts.origin)}.
                    Market data have advanced; rerun the experiment to update
                    the forecast.
                  </div>
                )}
                {page === 0 && (
                  <Overview
                    key={research.metadata.run_id}
                    market={market}
                    research={research}
                    onMethodology={() => setPage(3)}
                  />
                )}
                {page === 1 && (
                  <Comparison
                    key={research.metadata.run_id}
                    research={research}
                  />
                )}
                {page === 2 && (
                  <Backtesting
                    key={research.metadata.run_id}
                    research={research}
                    predictions={predictions}
                  />
                )}
                {page === 3 && <Methodology research={research} />}
                <section className="run-selector">
                  <label>
                    <History size={13} /> Experiment
                    <select
                      aria-label="Experiment"
                      value={selectedRun || research.metadata.run_id}
                      onChange={(e) => setSelectedRun(e.target.value)}
                    >
                      {runs.map((r) => (
                        <option key={r.run_id} value={r.run_id}>
                          {r.run_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    CSV export includes every forecast in this experiment
                  </span>
                </section>
                <footer className="page-footer">
                  <span>
                    <Activity size={13} /> MacroPulse{" "}
                    <span className="muted">/</span> Research, made measurable.
                  </span>
                  <span>
                    Educational research · {research.metadata.provenance.source}
                  </span>
                </footer>
              </>
            )
          )}
        </main>
      </div>
    </div>
  );
}
