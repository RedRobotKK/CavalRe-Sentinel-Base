#!/usr/bin/env node
/**
 * Local journal API for Sentinel Desk.
 * Binds 127.0.0.1 only. Read-only. No keys.
 */

import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.DESK_API_PORT ?? 8787);
const JOURNAL_DIR = process.env.JOURNAL_DIR ?? "journals";

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
      // skip corrupt line
    }
  }
  return { totalLines: lines.length, records };
}

function summarize(records) {
  const byKind = {};
  const byAction = {};
  const byClass = {};
  const byReason = {};
  let accepts = 0;
  let rejects = 0;
  let waits = 0;

  for (const r of records) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    const action = r.context?.policyAction ?? (r.kind === "quote_accepted" ? "accept" : r.kind === "info" ? "wait" : "reject");
    byAction[action] = (byAction[action] ?? 0) + 1;
    if (action === "accept") accepts += 1;
    else if (action === "wait") waits += 1;
    else rejects += 1;
    const oc = r.context?.orderClass ?? "?";
    byClass[oc] = (byClass[oc] ?? 0) + 1;
    const reason = r.reason ?? "?";
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }

  return {
    n: records.length,
    accepts,
    rejects,
    waits,
    byKind,
    byAction,
    byClass,
    byReason,
  };
}

const GO_NO_GO = {
  liveCapital: false,
  gates: [
    { id: "days7", label: "≥7 days dry-run journals", status: "pending" },
    { id: "n100", label: "≥100 shadow accepts", status: "pending" },
    { id: "markout_mean", label: "Mean +2m markout ≥ 0 after gas", status: "pending" },
    { id: "toxic", label: "Toxic fraction ≤ 25%", status: "pending" },
    { id: "keys", label: "No keys in journal/git/CI", status: "pass" },
    { id: "live_disabled", label: "live_mode_not_enabled in runner", status: "pass" },
  ],
};

const RISK_DEFAULTS = {
  workingCapital: "1000000000",
  maxPositionPct: 8,
  maxDailyLossPct: 2,
  maxDrawdownPct: 5,
  note: "USDC 6dp units for $1000 book in defaultSmallCapitalConfig",
};

const PRIMITIVES = [
  { id: "Amount", layer: "core", desc: "bigint raw units; never JS number for value" },
  { id: "RiskEngine", layer: "risk", desc: "hard position / daily loss / drawdown gates" },
  { id: "DecisionJournal", layer: "journal", desc: "append-only JSONL; markout fields" },
  { id: "DutchDecay", layer: "strategy", desc: "mirrors UniswapX DutchDecayLib" },
  { id: "FillPolicy", layer: "strategy", desc: "accept | reject | wait" },
  { id: "classifyOrder", layer: "strategy", desc: "dutch | priority | exclusive | unknown" },
  { id: "computeEdgeBps", layer: "strategy", desc: "(refOut - resolvedOut) / refOut" },
  { id: "QuoterV2 ref", layer: "mainnet", desc: "Base eth_call reference cost" },
  { id: "UniswapX poll", layer: "mainnet", desc: "Dutch_V3 open orders Base" },
  { id: "LocalSigner", layer: "wallet", desc: "high-risk; unused in dry-run harness" },
];

async function handle(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  try {
    if (url.pathname === "/health") {
      json(res, { ok: true, service: "sentinel-desk-api" });
      return;
    }

    if (url.pathname === "/meta") {
      json(res, {
        network: "base-mainnet",
        chainId: 8453,
        orderType: "Dutch_V3",
        liveCapital: false,
        posture: "dry-run",
        risk: RISK_DEFAULTS,
        goNoGo: GO_NO_GO,
        primitives: PRIMITIVES,
      });
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

    json(res, { error: "not_found" }, 404);
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
    })
  );
});
