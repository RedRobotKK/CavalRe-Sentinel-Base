import { useCallback, useEffect, useState } from "react";
import { getLatest, getMeta, getJournalFiles } from "./api";
import { Circuit } from "./Circuit";
import { ShaderBackdrop } from "./gl/ShaderBackdrop";
import { StreamLayer } from "./StreamLayer";

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

  const refresh = useCallback(async () => {
    try {
      const [m, l, f] = await Promise.all([
        getMeta(),
        getLatest(600),
        getJournalFiles(),
      ]);
      const n = l?.records?.length ?? 0;
      if (n > prevCount) setPulseKey((k) => k + 1);
      setPrevCount(n);
      setMeta(m);
      setLatest(l);
      setFiles(f.files ?? []);
      setErr(null);
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
  const activity = Math.min(1, (summary?.n ?? 0) / 60);
  const modeLabel = meta?.mode?.label ?? "VIEW";

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
          <span className="pill on">{modeLabel}</span>
          <span className="pill on">WRITE OFF</span>
          <span className={`pill ${go?.verdict === "NO_GO" ? "off" : "on"}`}>
            {go?.verdict ?? "…"}
          </span>
          <span className="pill on live-blip">{meta?.network ?? "base"}</span>
          <span className="pill">{meta?.orderType ?? "Dutch_V3"}</span>
          <span className="pill muted-pill">poll {tick}</span>
          <button type="button" onClick={() => refresh()}>
            poll
          </button>
        </div>
      </header>

      <div className="desk-grid">
        {err && (
          <div className="panel bad span-all">
            LINK ERROR: {err} — desk-api :8787 · is VIEW harness running?
          </div>
        )}

        <div className="span-main circuit-shell panel-rise">
          <Circuit records={records} pulseKey={pulseKey} />
        </div>

        <div className="span-side stack-side">
          <div className="panel panel-rise">
            <h2>Channel</h2>
            <div className="metric-row">
              <span>mode</span>
              <span className="good">{modeLabel}</span>
            </div>
            <div className="metric-row">
              <span>wire</span>
              <span>UniswapX</span>
            </div>
            <div className="metric-row">
              <span>rpc</span>
              <span>Base</span>
            </div>
            <div className="metric-row">
              <span>write</span>
              <span className="good">OFF</span>
            </div>
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
          </div>

          <div className="panel panel-rise">
            <h2>Go / No-Go</h2>
            <div className="metric-row">
              <span>verdict</span>
              <span className={go?.verdict === "NO_GO" ? "bad" : "good"}>
                {go?.verdict ?? "—"}
              </span>
            </div>
            {(go?.gates ?? []).slice(0, 4).map((g: any) => (
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
            <h2>Journals</h2>
            <ul className="clean">
              {files.slice(0, 3).map((f) => (
                <li key={f.name}>
                  {f.name}
                  <div className="muted">{f.bytes} B</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="span-all panel-rise">
          <StreamLayer records={records} />
        </div>
      </div>
    </div>
  );
}
