import { useCallback, useEffect, useState } from "react";
import { getLatest, getMeta, getJournalFiles } from "./api";
import { Circuit } from "./Circuit";
import { ShaderBackdrop } from "./gl/ShaderBackdrop";
import { CircuitThree } from "./gl/CircuitThree";
import { Scope, type ScopeSample } from "./Scope";

type RecordRow = {
  seq?: number;
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  context?: Record<string, string | boolean | null>;
};

export function App() {
  const [meta, setMeta] = useState<any>(null);
  const [latest, setLatest] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(() => new Date().toISOString().slice(11, 19));
  const [prevCount, setPrevCount] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [scopeSamples, setScopeSamples] = useState<ScopeSample[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [m, l, f] = await Promise.all([
        getMeta(),
        getLatest(500),
        getJournalFiles(),
      ]);
      const n = l?.records?.length ?? 0;
      if (n > prevCount) setPulseKey((k) => k + 1);
      setPrevCount(n);
      setMeta(m);
      setLatest(l);
      setFiles(f.files ?? []);
      setErr(null);

      const recs: RecordRow[] = l?.records ?? [];
      const hearts = [...recs].reverse().find((r) => r.reason === "cycle_heartbeat");
      const raw = Number(hearts?.context?.raw ?? 0);
      const accepted = Number(hearts?.context?.accepted ?? 0);
      const rejected = Number(hearts?.context?.rejected ?? 0);
      const waited = Number(hearts?.context?.waited ?? 0);
      setScopeSamples((s) =>
        [...s, { t: Date.now(), raw, accepted, rejected, waited }].slice(-100)
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [prevCount]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      refresh();
    }, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const summary = latest?.summary;
  const book = summary?.book;
  const records: RecordRow[] = latest?.records ?? [];
  const go = meta?.goNoGo;
  const activity = Math.min(1, (summary?.n ?? 0) / 60 + (scopeSamples.at(-1)?.raw ?? 0) * 0.3);

  // top reject reasons for side panel (compact)
  const topReasons = (() => {
    const map = new Map<string, number>();
    for (const r of records) {
      if (r.kind !== "quote_rejected") continue;
      const k = (r.reason ?? "?").slice(0, 36);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  })();

  return (
    <div className="layout">
      <ShaderBackdrop activity={activity} />

      <header className="topbar panel-rise">
        <div>
          <div className="brand">
            CAVALRE <span>SENTINEL</span> // BASE
          </div>
          <div className="muted brand-sub">
            <span className="powered">Powered by CavalRe</span>
          </div>
        </div>
        <div className="pills">
          <span className="hud-clock">{clock}Z</span>
          <span className={`pill ${go?.verdict === "NO_GO" ? "off" : "on"}`}>
            {go?.verdict ?? "…"}
          </span>
          <span className="pill on live-blip">{meta?.network ?? "base"}</span>
          <span className="pill">{meta?.orderType ?? "Dutch_V3"}</span>
          <span className="pill on">LIVE CAPITAL OFF</span>
          <span className="pill muted-pill">poll {tick}</span>
          <button type="button" onClick={() => refresh()}>
            poll
          </button>
        </div>
      </header>

      <div className="main-col">
        {err && (
          <div className="panel bad">
            LINK ERROR: {err} — desk-api :8787
          </div>
        )}

        <div className="circuit-shell panel-rise">
          <CircuitThree pulseKey={pulseKey} />
          <Circuit records={records} pulseKey={pulseKey} />
        </div>

        <Scope samples={scopeSamples} />
      </div>

      <div className="side-col">
        <div className="panel panel-rise">
          <h2>Go / No-Go</h2>
          <div className="metric-row">
            <span>verdict</span>
            <span className={go?.verdict === "NO_GO" ? "bad" : "good"}>
              {go?.verdict ?? "—"}
            </span>
          </div>
          {(go?.gates ?? []).map((g: any) => (
            <div className="metric-row" key={g.id}>
              <span>{g.label}</span>
              <span
                className={
                  g.status === "pass"
                    ? "good"
                    : g.status === "fail"
                      ? "bad"
                      : "warn"
                }
              >
                {g.status}
              </span>
            </div>
          ))}
        </div>

        <div className="panel panel-rise">
          <h2>Book</h2>
          <div className="metric-row">
            <span>records</span>
            <span>{summary?.n ?? 0}</span>
          </div>
          <div className="metric-row">
            <span>A / R / W</span>
            <span>
              {summary?.accepts ?? 0}/{summary?.rejects ?? 0}/{summary?.waits ?? 0}
            </span>
          </div>
          <div className="metric-row">
            <span>markout n</span>
            <span>{book?.markoutSample ?? 0}</span>
          </div>
          <div className="metric-row">
            <span>W / L</span>
            <span>
              <span className="good">{book?.wins ?? 0}</span> /{" "}
              <span className="bad">{book?.losses ?? 0}</span>
            </span>
          </div>
        </div>

        <div className="panel panel-rise">
          <h2>Drop reasons</h2>
          {topReasons.length === 0 && (
            <div className="muted">none yet</div>
          )}
          {topReasons.map((r) => (
            <div className="metric-row" key={r.name}>
              <span title={r.name}>{r.name}</span>
              <span className="bad">×{r.n}</span>
            </div>
          ))}
        </div>

        <div className="panel panel-rise">
          <h2>Risk</h2>
          {meta?.risk &&
            Object.entries(meta.risk).map(([k, v]) => (
              <div className="metric-row" key={k}>
                <span>{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
        </div>

        <div className="panel panel-rise">
          <h2>Journals</h2>
          <ul className="clean">
            {files.slice(0, 4).map((f) => (
              <li key={f.name}>
                {f.name}
                <div className="muted">{f.bytes} B</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
