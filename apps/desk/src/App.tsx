import { useCallback, useEffect, useMemo, useState } from "react";
import { getLatest, getMeta, getJournalFiles } from "./api";
import { Circuit } from "./Circuit";
import { ShaderBackdrop } from "./gl/ShaderBackdrop";
import { CircuitThree } from "./gl/CircuitThree";
import { Scope } from "./Scope";

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
  const [scopeSamples, setScopeSamples] = useState<
    { raw: number; accepted: number; rejected: number }[]
  >([]);

  const refresh = useCallback(async () => {
    try {
      const [m, l, f] = await Promise.all([
        getMeta(),
        getLatest(400),
        getJournalFiles(),
      ]);
      const n = l?.records?.length ?? 0;
      if (n > prevCount) setPulseKey((k) => k + 1);
      setPrevCount(n);
      setMeta(m);
      setLatest(l);
      setFiles(f.files ?? []);
      setErr(null);

      // scope sample from latest heartbeats / summary
      const recs: RecordRow[] = l?.records ?? [];
      const hearts = recs.filter((r) => r.reason === "cycle_heartbeat").slice(-1)[0];
      const raw = Number(hearts?.context?.raw ?? 0);
      const accepted = Number(hearts?.context?.accepted ?? l?.summary?.accepts ?? 0);
      const rejected = Number(hearts?.context?.rejected ?? l?.summary?.rejects ?? 0);
      setScopeSamples((s) => {
        const next = [...s, { raw, accepted, rejected }];
        return next.slice(-80);
      });
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
  const newestFirst = useMemo(() => [...records].reverse().slice(0, 80), [records]);
  const go = meta?.goNoGo;
  const activity = Math.min(1, (summary?.n ?? 0) / 60);

  return (
    <div className="layout">
      <ShaderBackdrop activity={activity} />

      <header className="topbar panel-rise">
        <div>
          <div className="brand">
            SENTINEL <span>WYSE-26</span> // BASE
          </div>
          <div className="muted">
            AMBER TERMINAL · CIRCUIT · SCOPE · LIVE POLL
          </div>
        </div>
        <div className="pills">
          <span className="hud-clock">{clock}Z</span>
          <span className={`pill ${go?.verdict === "NO_GO" ? "off" : "on"}`}>
            {go?.verdict ?? "…"}
          </span>
          <span className="pill on live-blip">{meta?.network ?? "…"}</span>
          <span className="pill">{meta?.orderType ?? "Dutch_V3"}</span>
          <span className="pill on">LIVE CAPITAL OFF</span>
          <button type="button" onClick={() => refresh()}>
            poll
          </button>
        </div>
      </header>

      <div className="main-col">
        {err && (
          <div className="panel bad">
            LINK ERROR: {err} — start desk-api :8787
          </div>
        )}

        <div className="circuit-shell panel-rise">
          <CircuitThree pulseKey={pulseKey} />
          <Circuit records={records} pulseKey={pulseKey} />
        </div>

        <Scope samples={scopeSamples} />

        <div className="feed-panel panel-rise">
          <h2>
            Live data feed · source journals/ · poll #{tick}
            <span className="cursor-blink" />
          </h2>
          <div className="feed-scroll">
            {newestFirst.length === 0 && (
              <div className="feed-line info">
                <span className="ts">--:--:--</span> waiting for heartbeat from
                dry-run harness…
              </div>
            )}
            {newestFirst.map((r, i) => {
              const action =
                (r.context?.policyAction as string) ??
                (r.kind === "quote_accepted"
                  ? "accept"
                  : r.kind === "markout"
                    ? "markout"
                    : r.kind === "info"
                      ? "info"
                      : "reject");
              return (
                <div key={`${r.seq}-${i}`} className={`feed-line ${action}`}>
                  <span className="ts">{r.ts?.slice(11, 19) ?? "--:--:--"}</span>{" "}
                  [{action.padEnd(7)}] {(r.reason ?? "").slice(0, 48)}
                  {r.context?.raw != null ? ` raw=${r.context.raw}` : ""}
                  {r.context?.edgeBps != null ? ` edge=${r.context.edgeBps}` : ""}
                  {r.ref ? ` ${String(r.ref).slice(0, 12)}` : ""}
                </div>
              );
            })}
          </div>
        </div>
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
            <span>accept / reject / wait</span>
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
          <h2>Risk limits</h2>
          {meta?.risk &&
            Object.entries(meta.risk).map(([k, v]) => (
              <div className="metric-row" key={k}>
                <span>{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
        </div>

        <div className="panel panel-rise">
          <h2>Journal files</h2>
          <ul className="clean">
            {files.slice(0, 6).map((f) => (
              <li key={f.name}>
                {f.name}
                <div className="muted">{f.bytes} B</div>
              </li>
            ))}
            {files.length === 0 && <li className="muted">none yet</li>}
          </ul>
        </div>

        <div className="panel panel-rise">
          <h2>Link</h2>
          <div className="metric-row">
            <span>api</span>
            <span className="good">:8787</span>
          </div>
          <div className="metric-row">
            <span>chain</span>
            <span>{meta?.chainId ?? 8453}</span>
          </div>
          <div className="metric-row">
            <span>signing</span>
            <span className="good">OFF</span>
          </div>
        </div>
      </div>
    </div>
  );
}
