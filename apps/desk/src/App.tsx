import { useCallback, useEffect, useMemo, useState } from "react";
import { getLatest, getMeta, getJournalFiles } from "./api";
import {
  FunnelChart,
  ClassPie,
  EdgeHistogram,
  TimelineChart,
  ReasonBars,
} from "./charts";
import { Circuit } from "./Circuit";

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

function bpsPct(bps: number | null | undefined) {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(2)}%`;
}

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [prevCount]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      refresh();
    }, 3000);
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
  const newestFirst = useMemo(() => [...records].reverse(), [records]);
  const wallet = meta?.wallet;

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <div className="brand">
            CAVALRE <span>SENTINEL</span> DESK
          </div>
          <div className="muted">
            Book · limits · markout W/L · circuit · not a Connect-Wallet dapp
          </div>
        </div>
        <div className="pills">
          <span className="hud-clock">{clock}Z</span>
          <span className="pill on live-blip">{meta?.network ?? "…"}</span>
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
          API error: {err}. Run <code>npm run desk:api</code> on :8787.
        </div>
      )}

      <Circuit records={records} pulseKey={pulseKey} />

      {/* Quant strip: limits + book quality + wallet readiness */}
      <section className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="panel">
          <h2>Limits (RiskEngine)</h2>
          {meta?.risk &&
            Object.entries(meta.risk).map(([k, v]) => (
              <div className="metric-row" key={k}>
                <span>{k}</span>
                <span>{String(v)}</span>
              </div>
            ))}
        </div>

        <div className="panel">
          <h2>Book quality (Amount / markout)</h2>
          <div className="metric-row">
            <span>accept rate</span>
            <span>{bpsPct(book?.acceptRateBps)}</span>
          </div>
          <div className="metric-row">
            <span>markout sample</span>
            <span>{book?.markoutSample ?? 0}</span>
          </div>
          <div className="metric-row">
            <span>wins / losses</span>
            <span>
              <span className="good">{book?.wins ?? 0}</span>
              {" / "}
              <span className="bad">{book?.losses ?? 0}</span>
            </span>
          </div>
          <div className="metric-row">
            <span>hit rate (markout≥0)</span>
            <span className={book?.hitRateBps != null ? "good" : "muted"}>
              {bpsPct(book?.hitRateBps)}
            </span>
          </div>
          <div className="metric-row">
            <span>mean markout bps</span>
            <span
              className={
                book?.meanMarkoutBps == null
                  ? "muted"
                  : book.meanMarkoutBps >= 0
                    ? "good"
                    : "bad"
              }
            >
              {book?.meanMarkoutBps ?? "—"}
            </span>
          </div>
          <div className="muted" style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 11 }}>
            {book?.note === "insufficient_markout_sample"
              ? "W/L requires labeled markouts — accept ≠ win"
              : "markout-labeled sample"}
          </div>
        </div>

        <div className="panel">
          <h2>Wallet readiness (no browser keys)</h2>
          <div className="metric-row">
            <span>mode</span>
            <span className="on">{wallet?.mode ?? "dry-run"}</span>
          </div>
          <div className="metric-row">
            <span>live signing</span>
            <span className={wallet?.liveSigning ? "bad" : "good"}>
              {wallet?.liveSigning ? "ENABLED" : "OFF"}
            </span>
          </div>
          <div className="metric-row">
            <span>browser keys</span>
            <span className="good">{wallet?.browserKeys ? "YES" : "NEVER"}</span>
          </div>
          <div className="metric-row">
            <span>address</span>
            <span className="muted">
              {wallet?.address
                ? `${String(wallet.address).slice(0, 6)}…${String(wallet.address).slice(-4)}`
                : "unset (SENTINEL_ADDRESS)"}
            </span>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
            {(wallet?.primitives ?? []).join(" · ")}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
            {wallet?.note}
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Funnel</h2>
          <div className="metric-row">
            <span>records</span>
            <span className="big">{summary?.n ?? 0}</span>
          </div>
          <FunnelChart records={records} />
        </div>
        <div className="panel">
          <h2>Cumulative decisions</h2>
          <TimelineChart records={records} />
        </div>
        <div className="panel">
          <h2>Edge distribution (bps)</h2>
          <EdgeHistogram records={records} />
        </div>
        <div className="panel">
          <h2>Order class mix</h2>
          <ClassPie records={records} />
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "1.2fr 1fr" }}>
        <div className="panel">
          <h2>Top reject / wait reasons</h2>
          <ReasonBars records={records} />
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
                <div className="muted">
                  {f.bytes} B · {f.mtime}
                </div>
              </li>
            ))}
            {files.length === 0 && <li className="muted">No jsonl yet</li>}
          </ul>
          <div className="muted" style={{ marginTop: 12 }}>
            poll #{tick} · 3s
          </div>
        </aside>

        <div className="table-wrap">
          <h2>Decision tape</h2>
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
              {newestFirst.map((r, i) => {
                const action =
                  (r.context?.policyAction as string) ??
                  (r.kind === "quote_accepted"
                    ? "accept"
                    : r.kind === "info"
                      ? "wait"
                      : "reject");
                return (
                  <tr key={`${r.seq}-${i}`} className={i < 3 ? "flash" : undefined}>
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
              {newestFirst.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted">
                    Idle book — W/L stays blank until markouts exist.
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
