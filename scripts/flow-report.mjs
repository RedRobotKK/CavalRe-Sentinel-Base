#!/usr/bin/env node
/**
 * Quant flow taxonomy over journals (read-only).
 *
 *   npm run flow-report
 *   npm run flow-report -- --dir journals
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { summarizeFlow } from "@cavalre/strategy";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const JOURNAL_DIR = flag("dir", "journals");

async function loadAll() {
  let names = [];
  try {
    names = (await readdir(JOURNAL_DIR)).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return [];
  }
  const records = [];
  for (const name of names) {
    const text = await readFile(join(JOURNAL_DIR, name), "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        records.push(JSON.parse(t));
      } catch {
        /* skip */
      }
    }
  }
  return records;
}

const records = await loadAll();
const s = summarizeFlow(records);

console.log(
  JSON.stringify(
    {
      dir: JOURNAL_DIR,
      ...s,
      note: "pure taxonomy · no RPC · exclusive rate among classified decisions",
    },
    null,
    2
  )
);
