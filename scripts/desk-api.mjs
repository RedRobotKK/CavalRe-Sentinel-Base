#!/usr/bin/env node
/**
 * Local journal API for Sentinel Desk.
 * Binds 127.0.0.1 only. Read-only. No keys.
 *
 * Mode model:
 *   VIEW  = real UniswapX + Base RPC (via dry-run), no signing
 *   WRITE = only when wallet env present AND live path enabled (not yet)
 */

import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.DESK_API_PORT ?? 8787);
const JOURNAL_DIR = process.env.JOURNAL_DIR ?? "journals";

const UNISWAPX_ORDERS =
  process.env.UNISWAPX_ORDERS_URL ?? "https://api.uniswap.org/v2/orders";
const BASE_RPC =
  process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

function operatingMode() {
  const hasKey = Boolean(
    process.env.SENTINEL_PRIVATE_KEY || process.env.FILLER_PRIVATE_KEY
  );
  const liveFlag =
    process.env.SENTINEL_LIVE === "1" || process.env.SENTINEL_LIVE === "true";
  // Write is not actually enabled in code yet — report intent only
  if (hasKey && liveFlag) {
    return {
      mode: "write",
      label: "WRITE",
      liveCapital: false, // still false until runner allows live
      note: "credentials present but runner live path not enabled",
    };
  }
  if (hasKey) {
    return {
      mode: "view",
      label: "VIEW",
      liveCapital: false,
      note: "wallet env present; still VIEW until SENTINEL_LIVE=1 + code path",
    };
  }
  return {
    mode: "view",
    label: "VIEW",
    liveCapital: false,
    note: "real sources, no credentials, no broadcast",
  };
}

async function listJournalFiles() {
  try {
    const names = await readdir(JOURNAL_DIR);
    const files = [];
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const p = join(JOURNAL_DIR, name);
      const s = await stat(p);
      files.push({
        name,
        path: p,
        bytes: s.size,
        mtime: s.mtime.toISOString(),
      });
    }
    files.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
    return files;
  } catch {
    return [];
  }
}

async function loadJsonl(filePath, { limit = 500 } = {}) {
  const text = await readFile(filePath, "utf8");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const slice = lines.slice(-limit);
  const records = [];
  for (const line of slice) {
    try {
      records.push(JSON.parse(line));
    } catch {
      /* skip */
    }
  }
  return { totalLines: lines.length, records };
}

async function loadAllRecords() {
  const files = await listJournalFiles();
  const records = [];
  const days = new Set();
  for (const f of files) {
    const text = await readFile(f.path, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const r = JSON.parse(t);
        records.push(r);
        if (r.ts) days.add(r.ts.slice(0, 10));
      } catch {
        /* skip */
      }
    }
  }
  return { records, days: [...days].sort(), files: files.length };
}

function summarize(records) {
  const byKind = {};
  const byAction = {};
  const byClass = {};
  const byReason = {};
  let accepts = 0;
  let rejects = 0;
  let waits = 0;
  let wins = 0;
  let losses = 0;
  let markoutSum = 0;
  let markoutN = 0;

  for (const r of records) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    const action =
      r.context?.policyAction ??
      (r.kind === "quote_accepted"
        ? "accept"
        : r.kind === "info"
          ? "wait"
          : "reject");
    byAction[action] = (byAction[action] ?? 0) + 1;
    if (action === "accept") accepts += 1;
    else if (action === "wait") waits += 1;
    else rejects += 1;
    const oc = r.context?.orderClass ?? "?";
    byClass[oc] = (byClass[oc] ?? 0) + 1;
    const reason = r.reason ?? "?";
    byReason[reason] = (byReason[reason] ?? 0) + 1;

    if (r.kind === "markout" || r.markoutBps != null || r.context?.markoutBps != null) {
      const raw = r.markoutBps ?? r.context?.markoutBps;
      const bps = Number(raw);
      if (Number.isFinite(bps)) {
        markoutN += 1;
        markoutSum += bps;
        if (bps >= 0) wins += 1;
        else losses += 1;
      }
    }
  }

  const decided = accepts + rejects + waits;
  const labeled = wins + losses;

  return {
    n: records.length,
    accepts,
    rejects,
    waits,
    byKind,
    byAction,
    byClass,
    byReason,
    book: {
      acceptRateBps: decided > 0 ? Math.round((accepts * 10000) / decided) : null,
      markoutSample: markoutN,
      wins,
      losses,
      hitRateBps: labeled > 0 ? Math.round((wins * 10000) / labeled) : null,
      meanMarkoutBps: markoutN > 0 ? Math.round(markoutSum / markoutN) : null,
      note:
        markoutN === 0
          ? "insufficient_markout_sample"
          : "markout_labeled",
    },
  };
}

function buildGoNoGo(all) {
  const accepts = all.records.filter(
    (r) => r.kind === "quote_accepted" || r.context?.policyAction === "accept"
  );
  const uniqueRefs = new Set(accepts.map((r) => r.ref).filter(Boolean));
  const markouts = [];
  for (const r of all.records) {
    if (r.kind !== "markout" && r.markoutBps == null) continue;
    const w = r.markout?.windowSec ?? Number(r.context?.windowSec);
    if (w !== 120 && Number.isFinite(w)) continue;
    const bps = Number(r.markoutBps ?? r.markout?.markoutBps ?? r.context?.markoutBps);
    if (Number.isFinite(bps)) markouts.push(bps);
  }
  if (markouts.length === 0) {
    for (const r of all.records) {
      const bps = Number(r.markoutBps ?? r.markout?.markoutBps ?? r.context?.markoutBps);
      if (Number.isFinite(bps)) markouts.push(bps);
    }
  }
  const mean =
    markouts.length > 0
      ? markouts.reduce((a, b) => a + b, 0) / markouts.length
      : null;
  const toxic =
    markouts.length > 0
      ? markouts.filter((b) => b <= -30).length / markouts.length
      : null;

  const gates = [
    {
      id: "days7",
      label: "≥7 days journal activity",
      status: all.days.length >= 7 ? "pass" : "pending",
      detail: `days=${all.days.length}`,
    },
    {
      id: "n100",
      label: "≥100 shadow accepts",
      status: uniqueRefs.size >= 100 ? "pass" : "pending",
      detail: `unique=${uniqueRefs.size}`,
    },
    {
      id: "markout_mean",
      label: "Mean +2m markout ≥ 0",
      status:
        mean != null && mean >= 0 ? "pass" : mean != null ? "fail" : "pending",
      detail: mean == null ? "n=0" : `mean=${mean.toFixed(1)} n=${markouts.length}`,
    },
    {
      id: "toxic",
      label: "Toxic fraction ≤ 25%",
      status:
        toxic != null && toxic <= 0.25
          ? "pass"
          : toxic != null
            ? "fail"
            : "pending",
      detail: toxic == null ? "n=0" : `${(toxic * 100).toFixed(1)}%`,
    },
    {
      id: "keys",
      label: "No keys in journal/git/CI",
      status: "pass",
      detail: "policy",
    },
    {
      id: "live_disabled",
      label: "live_mode_not_enabled",
      status: "pass",
      detail: "runner",
    },
  ];

  const blocking = gates.filter(
    (g) => g.id !== "keys" && g.id !== "live_disabled" && g.status !== "pass"
  );

  return {
    liveCapital: false,
    verdict: blocking.length === 0 ? "CONDITIONAL_GO_REVIEW" : "NO_GO",
    gates,
    phase: "0.5",
  };
}

const RISK_DEFAULTS = {
  workingCapital: "1000000000",
  maxPositionPct: 8,
  maxDailyLossPct: 2,
  maxDrawdownPct: 5,
  note: "USDC 6dp units for $1000 book in defaultSmallCapitalConfig",
};

function walletStatus() {
  const op = operatingMode();
  const addr = process.env.SENTINEL_ADDRESS ?? null;
  const hasKey = Boolean(
    process.env.SENTINEL_PRIVATE_KEY || process.env.FILLER_PRIVATE_KEY
  );
  return {
    mode: op.mode,
    label: op.label,
    liveSigning: false,
    writeEnabled: false,
    browserKeys: false,
    credentialsPresent: hasKey,
    addressConfigured: Boolean(addr),
    address: addr,
    note: op.note,
  };
}

function sourcesStatus() {
  return {
    uniswapx: {
      url: UNISWAPX_ORDERS,
      chainId: 8453,
      orderType: "Dutch_V3",
      role: "intent_poll",
    },
    baseRpc: {
      url: BASE_RPC.replace(/\/+$/, ""),
      role: "quoter_v2_eth_call",
    },
    journalDir: JOURNAL_DIR,
    posture: "view",
  };
}

async function handle(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  const origin = req.headers.origin;
  if (origin && /^http:\/\/127\.0\.0\.1:51\d{2}$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  try {
    if (url.pathname === "/" || url.pathname === "") {
      json(res, {
        service: "sentinel-desk-api",
        ui: "http://127.0.0.1:5173",
        phase: "0.5",
        mode: operatingMode(),
        sources: sourcesStatus(),
        endpoints: [
          "GET /health",
          "GET /meta",
          "GET /wallet",
          "GET /sources",
          "GET /go-no-go",
          "GET /journals",
          "GET /journals/latest?limit=300",
        ],
      });
      return;
    }

    if (url.pathname === "/health") {
      json(res, {
        ok: true,
        service: "sentinel-desk-api",
        phase: "0.5",
        mode: operatingMode().label,
      });
      return;
    }

    if (url.pathname === "/sources") {
      json(res, sourcesStatus());
      return;
    }

    if (url.pathname === "/go-no-go") {
      const all = await loadAllRecords();
      json(res, buildGoNoGo(all));
      return;
    }

    if (url.pathname === "/meta") {
      const all = await loadAllRecords();
      const op = operatingMode();
      json(res, {
        network: "base-mainnet",
        chainId: 8453,
        orderType: "Dutch_V3",
        liveCapital: false,
        posture: op.mode,
        mode: op,
        phase: "0.5",
        risk: RISK_DEFAULTS,
        goNoGo: buildGoNoGo(all),
        sources: sourcesStatus(),
        wallet: walletStatus(),
      });
      return;
    }

    if (url.pathname === "/wallet") {
      json(res, walletStatus());
      return;
    }

    if (url.pathname === "/journals") {
      json(res, { files: await listJournalFiles() });
      return;
    }

    if (url.pathname === "/journals/latest") {
      const files = await listJournalFiles();
      if (files.length === 0) {
        json(res, {
          file: null,
          totalLines: 0,
          records: [],
          summary: summarize([]),
        });
        return;
      }
      const limit = Number(url.searchParams.get("limit") ?? 300);
      const loaded = await loadJsonl(files[0].path, { limit });
      json(res, {
        file: files[0],
        ...loaded,
        summary: summarize(loaded.records),
      });
      return;
    }

    if (url.pathname.startsWith("/journals/") && url.pathname.endsWith("/records")) {
      const name = decodeURIComponent(url.pathname.split("/")[2] ?? "");
      const safe = basename(name);
      if (!safe.endsWith(".jsonl")) {
        json(res, { error: "invalid_file" }, 400);
        return;
      }
      const limit = Number(url.searchParams.get("limit") ?? 300);
      const loaded = await loadJsonl(join(JOURNAL_DIR, safe), { limit });
      json(res, {
        file: { name: safe },
        ...loaded,
        summary: summarize(loaded.records),
      });
      return;
    }

    json(res, { error: "not_found", path: url.pathname }, 404);
  } catch (e) {
    json(res, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

function json(res, body, status = 200) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

createServer(handle).listen(PORT, HOST, () => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      message: "desk-api listening",
      url: `http://${HOST}:${PORT}`,
      journalDir: JOURNAL_DIR,
      mode: operatingMode().label,
      sources: sourcesStatus(),
      phase: "0.5",
    })
  );
});
