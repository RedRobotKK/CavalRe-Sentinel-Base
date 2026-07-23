#!/usr/bin/env node
/**
 * Quality & security gate runner (research stage).
 *   npm run quality
 */

import { readFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";

const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => resolve({ code: code ?? 1, out, err }));
  });
}

{
  const r = await run("node", ["scripts/ml/run-tests.mjs"]);
  const m = r.out.match(/(\d+) passed, (\d+) failed/);
  record("ml:test", r.code === 0, m ? `${m[1]} passed, ${m[2]} failed` : `exit ${r.code}`);
}

for (const p of [
  "scripts/phase0-market-check.mjs",
  "scripts/phase0-market-note.mjs",
  "scripts/ops-status.mjs",
  "scripts/ml/src/soft-prior.js",
  "scripts/ml/src/features.js",
  "docs/DATA_MAP.md",
  "docs/RESEARCH.md",
  "docs/SECURITY_QUALITY.md",
]) {
  try {
    await access(p);
    record(`file:${p}`, true);
  } catch {
    record(`file:${p}`, false, "missing");
  }
}

{
  const src = await readFile("scripts/ml/src/soft-prior.js", "utf8");
  record("soft-prior default disabled", /DISABLED_PRIOR[\s\S]*enabled:\s*false/.test(src));
  record("soft-prior clean does not relax gates", src.includes("likely_clean") && src.includes("no_change"));
}

{
  const src = await readFile("scripts/phase0-market-check.mjs", "utf8");
  const dangerous = /privateKey|mnemonic|signTransaction|sendTransaction/i.test(src);
  record("phase0 no signing/broadcast", !dangerous);
}

{
  const r = await run("node", ["scripts/ops-status.mjs"]);
  if (r.code === 0) {
    try {
      const j = JSON.parse(r.out);
      record("ops capital liveCapitalAllowed=false", j.capital?.liveCapitalAllowed === false);
      record("ops softPrior disabled", j.capital?.softPrior === "disabled");
    } catch {
      record("ops:status parse", false, "invalid JSON");
    }
  } else {
    record("ops:status runs", false, `exit ${r.code}`);
  }
}

{
  const r = await run("npm", ["audit", "--audit-level=high"]);
  record("npm audit --audit-level=high", r.code === 0, r.code === 0 ? undefined : `exit ${r.code}`);
}

const failed = results.filter((r) => !r.pass);
const summary = {
  ts: new Date().toISOString(),
  kind: "quality_gates",
  passed: results.filter((r) => r.pass).length,
  failed: failed.length,
  results,
  productionCapitalApproved: false,
};

console.log("\n" + JSON.stringify(summary, null, 2));

const hardFail = failed.filter((f) => !f.name.startsWith("npm audit"));
if (hardFail.length > 0) process.exit(1);
if (failed.length > 0) process.exit(2);
process.exit(0);
