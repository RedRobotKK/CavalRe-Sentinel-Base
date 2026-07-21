import { useCallback, useEffect, useState } from "react";
import { getLatest, getMeta, getJournalFiles } from "./api";

type RecordRow = {
  seq?: number;
  ts?: string;
  kind?: string;
  reason?: string;
  ref?: string;
  amount?: string;
  amount2?: string;
  context?: Record<string, string | boolean | null>;
};

export function App() {
  const [meta, setMeta] = useState<any>(null);
  const [latest, setLatest] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [m, l, f] = await Promise.all([
        getMeta(),
        getLatest(400),
        getJournalFiles(),
      ]);
      setMeta(m);
      setLatest(l);
      setFiles(f.files ?? []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const summary = latest?.summary;
  const records: RecordRow[] = [...(latest?.records ?? [])].reverse();

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <div className="brand">CavalRe Sentinel Desk</div>
          <div className="muted">Research book · journal-first · read-only</div>
        </div>
        <div className="pills">
          <span className="pill on">{meta?.network ?? "…"}</span>
          <span className="pill">chain {meta?.chainId ?? "…"}</span>
          <span className="pill">{meta?.orderType ?? "…"}</span>
          <span className="pill on">{meta?.posture ?? "dry-run"}</span>
          <span className={`pill ${meta?.liveCapital ? "off" : "on"}`}>
            live capital {meta?.liveCapital ? "ON" : "OFF"}
          </span>
          <button type="button" onClick={() => refresh()}>
            refresh
          </button>
        </div>
      </header>

      {err && (
        <div className="panel bad">
          API error: {err}. Start desk API (`npm run desk:api`) on :8787.
        </div>
      )}

      <section className="grid">
        <div className="panel">
          <h2>Funnel (loaded journal tail)</h2>
          <div className="metric-row">
            <span>records</span>
            <span className="big">{summary?.n ?? 0}</span>
          </div>
          <div className="metric-row">
            <span>accept</span>
            <span className="good">{summary?.accepts ?? 0}</span>
          </div>
          <div className="metric-row">
            <span>reject</span>
            <span className="bad">{summary?.rejects ?? 0}</span>
          </div>
          <div className="metric-row">
            <span>wait</span>
            <span className="warn">{summary?.waits ?? 0}</span>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            file: {latest?.file?.name ?? "(none yet)"}
          </div>
        </div>

        <div className="panel">
          <h2>Risk defaults</h2>
          {meta?.risk &&
            Object.entries(meta.risk).map(([k, v]) => (
              <div className="metric-row" key={k}>
                <span>{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
        </div>

        <div className="panel">
          <h2>Go / No-Go</h2>
          {(meta?.goNoGo?.gates ?? []).map((g: any) => (
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

        <div className="panel">
          <h2>By class / reason</h2>
          {summary?.byClass &&
            Object.entries(summary.byClass).map(([k, v]) => (
              <div className="metric-row" key={k}>
                <span>class {k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
          {summary?.byReason &&
            Object.entries(summary.byReason)
              .slice(0, 6)
              .map(([k, v]) => (
                <div className="metric-row" key={k}>
                  <span title={k}>{k.slice(0, 28)}</span>
                  <span>{String(v)}</span>
                </div>
              ))}
          {!summary?.n && <div className="muted">Empty book — run dry-run harness</div>}
        </div>
      </section>

      <section className="main">
        <aside className="side">
          <h2>Primitives</h2>
          {(meta?.primitives ?? []).map((p: any) => (
            <div className="prim" key={p.id}>
              <code>{p.id}</code>
              <span className="muted">{p.desc}</span>
            </div>
          ))}
          <h2 style={{ marginTop: 16 }}>Journal files</h2>
          <ul className="clean">
            {files.map((f) => (
              <li key={f.name}>
                {f.name}
                <div className="muted">{f.bytes} B · {f.mtime}</div>
              </li>
            ))}
            {files.length === 0 && <li className="muted">No jsonl yet</li>}
          </ul>
          <div className="muted" style={{ marginTop: 12 }}>
            poll #{tick} · auto 5s
          </div>
        </aside>

        <div className="table-wrap">
          <h2>Decisions (newest first)</h2>
          <table>
            <thead>
              <tr>
                <th>ts</th>
                <th>action</th>
                <th>reason</th>
                <th>class</th>
                <th>edgeBps</th>
                <th>tox</th>
                <th>decay</th>
                <th>resolvedIn</th>
                <th>refOut</th>
                <th>ref</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => {
                const action =
                  (r.context?.policyAction as string) ??
                  (r.kind === "quote_accepted"
                    ? "accept"
                    : r.kind === "info"
                      ? "wait"
                      : "reject");
                return (
                  <tr key={`${r.seq}-${i}`}>
                    <td>{r.ts?.slice(11, 19) ?? ""}</td>
                    <td>
                      <span className={`tag ${action}`}>{action}</span>
                    </td>
                    <td title={r.reason}>{r.reason?.slice(0, 32)}</td>
                    <td>{String(r.context?.orderClass ?? "")}</td>
                    <td>{String(r.context?.edgeBps ?? "")}</td>
                    <td>{String(r.context?.toxicity ?? "")}</td>
                    <td>{String(r.context?.decayProgressBps ?? "")}</td>
                    <td>{String(r.context?.resolvedInput ?? r.amount ?? "")}</td>
                    <td>{String(r.context?.refOutput ?? "")}</td>
                    <td title={r.ref}>{r.ref?.slice(0, 10)}</td>
                  </tr>
                );
              })}
              {records.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted">
                    No decisions yet. Empty Base Dutch_V3 book is valid.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
