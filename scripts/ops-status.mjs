#!/usr/bin/env node
/**
 * Research ops status — one snapshot of the whole system.
 *
 *   npm run ops:status
 *
 * Reports Phase 0 density, ML gate, capital posture (static), journal inventory.
 * Does not change any state.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function safeList(dir, pred = () => true) {
  try {
    return (await readdir(dir)).filter(pred).sort();
  } catch {
    return [];
  }
}

async function countLines(path) {
  try {
    const t = await readFile(path, "utf8");
    return t.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

async function latestNote() {
  const names = await safeList("journals/phase0", (n) =>
    n.startsWith("market-note-") && n.endsWith(".json")
  );
  if (names.length === 0) return null;
  const path = join("journals/phase0", names[names.length - 1]);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function latestWalkforward() {
  const names = await safeList("journals/ml", (n) =>
    n.includes("walkforward") && n.endsWith(".json")
  );
  if (names.length === 0) return null;
  const path = join("journals/ml", names[names.length - 1]);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

const phase0Files = await safeList("journals/phase0", (n) =>
  n.startsWith("phase0-") && n.endsWith(".jsonl")
);
const simFiles = await safeList("journals", (n) =>
  n.startsWith("sim-") && n.endsWith(".jsonl")
);
const dryFiles = await safeList("journals", (n) =>
  n.startsWith("dry-run") && n.endsWith(".jsonl")
);

let phase0Lines = 0;
for (const n of phase0Files) {
  phase0Lines += await countLines(join("journals/phase0", n));
}

const note = await latestNote();
const wf = await latestWalkforward();

const status = {
  ts: new Date().toISOString(),
  kind: "ops_status",
  capital: {
    mode: "VIEW",
    writeEnabled: false,
    liveCapitalAllowed: false,
    goNoGo: "NO_GO",
    softPrior: "disabled",
  },
  phase0: {
    journalFiles: phase0Files.length,
    journalLines: phase0Lines,
    latestVerdict: note?.verdict?.code ?? "NO_NOTE_YET",
    residualViable: note?.verdict?.residualViable ?? null,
    ordersPerHour: note?.density?.ordersPerHour ?? null,
    sightings: note?.density?.totalOrderSightings ?? null,
    durationHours: note?.window?.durationHours ?? null,
  },
  ml: {
    softPriorEnabled: false,
    liveUseAllowed: wf?.gate?.liveUseAllowed === true ? true : false,
    lastWalkForwardAuc: wf?.summary?.meanAuc ?? null,
    lastInterpretation: wf?.interpretation ?? null,
    nLabeledLast: wf?.nLabeled ?? null,
  },
  journals: {
    phase0: phase0Files.length,
    sim: simFiles.length,
    dryRun: dryFiles.length,
  },
  nextActions: [],
};

if (!note) {
  status.nextActions.push("Run Phase 0 for ≥2h then: npm run phase0:note");
} else if (note.verdict?.code === "INSUFFICIENT_RUNTIME") {
  status.nextActions.push("Extend Phase 0 runtime; re-run phase0:note");
} else if (note.verdict?.residualViable === false) {
  status.nextActions.push(
    "Residual too sparse at current density — consider longer window or other venue/order type"
  );
} else if (note.verdict?.residualViable === true || note.verdict?.residualViable === "marginal") {
  status.nextActions.push(
    "Residual measurable — keep Phase 0 running; label any real accepts via shadow-markout before policy changes"
  );
}

if (wf && wf.summary?.meanAuc != null && wf.summary.meanAuc < 0.65) {
  status.nextActions.push(
    "ML soft prior remains disabled (AUC below 0.65 or sim-only labels)"
  );
}

status.nextActions.push("Capital posture unchanged: VIEW / WRITE OFF / NO_GO");

console.log(JSON.stringify(status, null, 2));
