import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
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
import { dateLabel, downloadForecasts, order } from "./ui";
import type { MarketRow, Prediction, Research } from "./types";

const pages = [
  {
    id: "overview",
    title: "Market overview",
    icon: LayoutDashboard,
    eyebrow: "YOUR MARKET SNAPSHOT",
    subtitle: "Understand recent volatility and what the models expect next.",
  },
  {
    id: "comparison",
    title: "Model comparison",
    icon: Layers3,
    eyebrow: "PUT THE MODELS TO THE TEST",
    subtitle: "Compare forecast accuracy on the same historical observations.",
  },
  {
    id: "history",
    title: "Historical backtesting",
    icon: History,
    eyebrow: "LOOK BEHIND EACH FORECAST",
    subtitle: "Explore what each model predicted and what actually happened.",
  },
  {
    id: "methodology",
    title: "Research & methodology",
    icon: BookOpen,
    eyebrow: "HOW THIS RESEARCH WORKS",
    subtitle:
      "Plain-language explanations, assumptions, and reproducible evidence.",
  },
];
const routeIndex = () =>
  Math.max(
    0,
    pages.findIndex((p) => `#${p.id}` === location.hash),
  );
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(
      "The local server is not responding. Start MacroPulse, then try again.",
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : `Request failed (${response.status}).`,
    );
  }
  return response.json();
}
type MarketPayload = {
  data: MarketRow[];
  expected_session?: string;
  stale?: boolean;
};
export default function Dashboard() {
  const [page, setPage] = useState(routeIndex);
  const [market, setMarket] = useState<MarketPayload>({ data: [] });
  const [research, setResearch] = useState<Research | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [runs, setRuns] = useState<{ run_id: string; created_at: string }[]>(
    [],
  );
  const [selectedRun, setSelectedRun] = useState("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.("(max-width: 900px)").matches ?? false,
  );
  const menuButton = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 900px)");
    const resize = () => {
      setMobile(media?.matches ?? false);
      if (!media?.matches) setMenu(false);
    };
    const route = () => {
      if (!location.hash || pages.some((p) => `#${p.id}` === location.hash)) {
        setPage(routeIndex());
        setMenu(false);
        main.current?.focus();
      }
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    media?.addEventListener("change", resize);
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    window.addEventListener("keydown", escape);
    return () => {
      media?.removeEventListener("change", resize);
      window.removeEventListener("hashchange", route);
      window.removeEventListener("popstate", route);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (menu) nav.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);
  function navigate(i: number) {
    setPage(i);
    setMenu(false);
    history.pushState(null, "", `#${pages[i].id}`);
    main.current?.focus();
    main.current?.scrollIntoView?.({ block: "start" });
  }
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError("");
    setWarnings([]);
    setPredictions([]);
    void (async () => {
      const query = selectedRun
        ? `?run_id=${encodeURIComponent(selectedRun)}`
        : "";
      const [m, r, rs] = await Promise.allSettled([
        get<MarketPayload>("/api/market", controller.signal),
        get<Research>(`/api/research${query}`, controller.signal),
        get<{ run_id: string; created_at: string }[]>(
          "/api/runs",
          controller.signal,
        ),
      ]);
      if (!active) return;
      let payload = m.status === "fulfilled" ? m.value : null;
      const run = r.status === "fulfilled" ? r.value : null;
      const messages: string[] = [];
      let rows: Prediction[] = [];
      if (run) {
        // Pin all dependent reads to one resolved run, even if latest changes during loading.
        const pinned = `?run_id=${encodeURIComponent(run.metadata.run_id)}`;
        const [snapshot, historyResult] = await Promise.allSettled([
          get<MarketPayload>(`/api/market${pinned}`, controller.signal),
          get<Prediction[]>(`/api/backtests${pinned}`, controller.signal),
        ]);
        if (!active) return;
        if (snapshot.status === "fulfilled") payload = snapshot.value;
        else
          messages.push(
            "The experiment price snapshot could not be loaded. Market cards use the current cache; forecast dates remain labeled separately.",
          );
        if (historyResult.status === "fulfilled") rows = historyResult.value;
        else
          messages.push(
            "Forecast history could not be loaded. Try reloading results.",
          );
      } else if (payload)
        messages.push(
          "Market data are available, but saved forecasts could not be opened. Run an experiment if none exists, or try reloading results.",
        );
      setMarket(payload ?? { data: [] });
      setResearch(run);
      setPredictions(rows);
      setRuns(rs.status === "fulfilled" ? rs.value : []);
      setWarnings(messages);
      if (!payload && !run)
        setError(
          m.status === "rejected"
            ? m.reason.message
            : "No saved data are available yet.",
        );
      setLoading(false);
    })().catch((e: Error) => {
      if (active && e.name !== "AbortError") {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reload, selectedRun]);
  const latest = market.data.at(-1);
  const available = order.filter((m) => research?.forecasts.models[m] != null);
  const setup = (
    <section className="setup panel">
      <Database size={26} />
      <h2>Start with a real research experiment</h2>
      <p>
        Download SPY history, then run the models. Reload this page to see the
        saved results.
      </p>
      <pre>
        .\.venv\Scripts\macropulse.exe refresh{"\n"}
        .\.venv\Scripts\macropulse.exe experiment
      </pre>
      <a
        className="text-button"
        href="https://github.com/masontle/Macropulse#fresh-setup"
        target="_blank"
        rel="noreferrer"
      >
        Open setup instructions <ExternalLink size={14} />
      </a>
    </section>
  );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Close menu"
          onClick={() => {
            setMenu(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <aside
        id="sidebar"
        className={menu ? "sidebar open" : "sidebar"}
        inert={mobile && !menu ? true : undefined}
      >
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate(0);
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
            Research workspace<small>Runs on your computer</small>
          </span>
        </div>
        <div className="nav-label">EXPLORE</div>
        <nav ref={nav} aria-label="Main navigation">
          {pages.map((p, i) => (
            <button
              key={p.id}
              className={page === i ? "nav-item active" : "nav-item"}
              onClick={() => navigate(i)}
              aria-current={page === i ? "page" : undefined}
            >
              <p.icon size={18} />
              {p.title}
            </button>
          ))}
        </nav>
        <div className="sidebar-data">
          <span className="nav-label">FOLLOWING</span>
          <div className="universe">
            <span className="ticker-icon">S</span>
            <span>
              <b>SPY</b>
              <small>S&P 500 ETF</small>
            </span>
          </div>
          <p>
            Daily market history
            <br />
            Five trading sessions ahead
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
            View project <ExternalLink size={13} />
          </a>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={menuButton}
              className="icon-button mobile-menu"
              aria-label="Open menu"
              aria-expanded={menu}
              aria-controls="sidebar"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={21} />
            </button>
            <span>SPY research</span>
            <span className="slash">/</span>
            <strong>{pages[page].title}</strong>
          </div>
          <div className="topbar-right">
            <span className="research-badge">
              <FlaskConical size={13} /> Research edition
            </span>
            <a
              className="icon-button"
              href="/docs"
              target="_blank"
              rel="noreferrer"
              aria-label="Open API documentation"
            >
              <Terminal size={18} />
            </a>
          </div>
        </header>
        <main id="main" ref={main} tabIndex={-1} aria-busy={loading}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                {pages[page].eyebrow}
              </div>
              <h1>{pages[page].title}</h1>
              <p>{pages[page].subtitle}</p>
            </div>
            <div className="heading-actions">
              <button
                className="button"
                onClick={() => setReload((n) => n + 1)}
                disabled={loading}
                title="Read saved results again; does not download prices or retrain models"
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
                {loading ? "Loading…" : "Reload results"}
              </button>
              <button
                className="button primary"
                onClick={() =>
                  downloadForecasts(
                    predictions,
                    research?.metadata.run_id ?? "research",
                  )
                }
                disabled={loading || !!error || !predictions.length}
              >
                <Download size={15} />
                Export full experiment
              </button>
            </div>
          </div>
          {error ? (
            <section className="setup panel" role="alert">
              <Database size={28} />
              <h2>Let’s reconnect your workspace</h2>
              <p>{error}</p>
              <button
                className="button primary"
                onClick={() => setReload((n) => n + 1)}
              >
                Try again <RefreshCw size={15} />
              </button>
              {setup}
            </section>
          ) : loading ? (
            <section className="loading panel" role="status">
              <Activity className="spin" />
              <h2>Opening your research workspace</h2>
              <p>Reading saved data and matching experiment results…</p>
            </section>
          ) : (
            <>
              <div className="context-strip">
                <span className="symbol-pill">
                  SPY <span>S&P 500 ETF</span>
                </span>
                <span className="context-description">
                  SPDR S&P 500 ETF Trust
                </span>
                <span className="as-of">
                  Market close · {dateLabel(latest?.date)}
                </span>
                <span className="status-pill ok">
                  {available.length} forecasts available
                </span>
              </div>
              {warnings.map((w) => (
                <div className="notice" role="status" key={w}>
                  {w}
                </div>
              ))}
              {market.stale && (
                <div className="notice">
                  Saved prices end {dateLabel(latest?.date)}; the latest
                  completed session is {dateLabel(market.expected_session)}. Run{" "}
                  <code>macropulse refresh</code> and{" "}
                  <code>macropulse experiment</code> to update the research.
                </div>
              )}
              {latest &&
                research &&
                latest.date !== research.forecasts.origin && (
                  <div className="notice">
                    The market cards and saved forecast have different dates.
                    Forecast origin: {dateLabel(research.forecasts.origin)}.
                  </div>
                )}
              {page === 0 ? (
                <Overview
                  key={research?.metadata.run_id ?? "market"}
                  market={market.data}
                  research={research}
                  onMethodology={() => navigate(3)}
                />
              ) : research ? (
                <>
                  {page === 1 && <Comparison research={research} />}{" "}
                  {page === 2 && (
                    <Backtesting
                      key={research.metadata.run_id}
                      research={research}
                      predictions={predictions}
                    />
                  )}{" "}
                  {page === 3 && <Methodology research={research} />}
                </>
              ) : (
                setup
              )}
              {research && (
                <section className="run-selector">
                  <label>
                    <History size={15} />
                    Saved experiment
                    <select
                      aria-label="Experiment"
                      value={selectedRun || research.metadata.run_id}
                      onChange={(e) => setSelectedRun(e.target.value)}
                    >
                      {!runs.some(
                        (r) => r.run_id === research.metadata.run_id,
                      ) && (
                        <option value={research.metadata.run_id}>
                          {dateLabel(research.metadata.created_at)} · current
                          run
                        </option>
                      )}
                      {runs.map((r, i) => (
                        <option key={r.run_id} value={r.run_id}>
                          {dateLabel(r.created_at)} · {r.run_id.slice(-8)}
                          {i === 0 ? " (latest)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>
                    {research.metadata.test_origins} matched historical
                    forecasts per model
                  </span>
                </section>
              )}
              <footer className="page-footer">
                <span>
                  <Activity size={14} />
                  MacroPulse · Research, made measurable.
                </span>
                <span>
                  Educational research ·{" "}
                  {research?.metadata.provenance.source ??
                    "Yahoo Finance via yfinance"}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
