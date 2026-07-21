#!/usr/bin/env node
/**
 * Phase 0.5 one-shot: dual-window shadow markout + go/no-go report.
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, BASE_RPC_URL: RPC },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      // go-no-go exits 2 on NO_GO — still resolve so ops continue
      resolve(code ?? 0);
    });
    child.on("error", reject);
  });
}

await mkdir("reports", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = `reports/go-no-go-${stamp}.json`;

console.error(JSON.stringify({ level: "info", step: "shadow-markout", windows: "30,120" }));
await run("npx", ["tsx", "scripts/shadow-markout.mjs", "--windows", "30,120"]);

console.error(JSON.stringify({ level: "info", step: "go-no-go-report", out }));
const code = await run("npx", [
  "tsx",
  "scripts/go-no-go-report.mjs",
  "--window",
  "120",
  "--out",
  out,
]);

console.error(
  JSON.stringify({
    level: "info",
    message: "research-ops done",
    reportExit: code,
    report: out,
    liveCapital: false,
  })
);
