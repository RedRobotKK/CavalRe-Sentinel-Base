#!/usr/bin/env node
/**
 * Phase 0 — Market Reality Note
 *
 * Reads phase0 JSONL journals and produces the one-page evidence note
 * required before any further capital discussion.
 *
 * Usage:
 *   npm run phase0:note
 *   node scripts/phase0-market-note.mjs --dir journals/phase0
 *
 * NEVER TRUST anecdotes. Numbers only.
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const DIR = flag("dir", "journals/phase0");
const SINGLE = flag("file", null);
const OUT_DIR = flag("out", "journals/phase0");

async function listFiles() {
  if (SINGLE) return [SINGLE];
  try {
    const names = await readdir(DIR);
    return names
      .filter((n) => n.startsWith("phase0-") && n.endsWith(".jsonl"))
      .map((n) => join(DIR, n))
      .sort();
  } catch {
    return [];
  }
}

async function load(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

const files = await listFiles();
if (files.length === 0) {
  console.error(
    JSON.stringify({
      level: "info",
      message: "no phase0 journals found",
      dir: DIR,
      hint: "run: npm run phase0",
    })
  );
  process.exit(0);
}

const all = [];
for (const f of files) {
  const rows = await load(f);
  for (const r of rows) all.push({ ...r, _file: f });
}

const cycles = all.filter((r) => r.kind === "cycle_summary");
const seen = all.filter((r) => r.kind === "order_seen");
const gone = all.filter((r) => r.kind === "order_gone");
const errors = all.filter((r) => r.kind === "error" || r.fetchError);

const firstTs = all[0]?.ts ?? null;
const lastTs = all[all.length - 1]?.ts ?? null;
const durationSec =
  firstTs && lastTs ? Math.max(0, (Date.parse(lastTs) - Date.parse(firstTs)) / 1000) : 0;
const durationHours = durationSec / 3600;

const totalRaw = cycles.reduce((s, c) => s + (Number(c.raw) || 0), 0);
const cyclesWithOrders = cycles.filter((c) => (Number(c.raw) || 0) > 0).length;
const maxLive = cycles.reduce((m, c) => Math.max(m, Number(c.uniqueLive) || 0), 0);

const sizeCounts = { dust: 0, small: 0, medium: 0, large: 0, exotic: 0 };
for (const s of seen) {
  const b = s.sizeBucket || "exotic";
  if (sizeCounts[b] !== undefined) sizeCounts[b] += 1;
  else sizeCounts.exotic += 1;
}

const exclusiveSeen = seen.filter((s) => s.exclusive).length;
const survival = {
  n: gone.length,
  reached30: gone.filter((g) => g.reached30).length,
  reached50: gone.filter((g) => g.reached50).length,
  reached80: gone.filter((g) => g.reached80).length,
  finished: gone.filter((g) => g.finished).length,
};
const lifetimes = gone
  .map((g) => Number(g.lifetimeSec))
  .filter((n) => Number.isFinite(n) && n >= 0)
  .sort((a, b) => a - b);
const medianLifetime =
  lifetimes.length === 0 ? null : lifetimes[Math.floor(lifetimes.length / 2)];

const ordersPerHour =
  durationHours > 0 ? Math.round((seen.length / durationHours) * 10) / 10 : null;

function verdict(d) {
  if (d.durationHours < 2) {
    return {
      code: "INSUFFICIENT_RUNTIME",
      summary:
        "Less than 2 hours of observation. Extend Phase 0 before any strategy conclusion.",
      residualViable: null,
    };
  }
  if (d.seen < 10) {
    return {
      code: "TOO_SPARSE",
      summary:
        "Fewer than 10 residual order sightings. Residual Dutch_V3 on Base is currently too thin for a selective low-capital strategy at observed density.",
      residualViable: false,
    };
  }
  if (d.ordersPerHour !== null && d.ordersPerHour < 5) {
    return {
      code: "LOW_DENSITY",
      summary: `~${d.ordersPerHour} residual orders/hour. Viable only as a background research filler, not a primary strategy.`,
      residualViable: "marginal",
    };
  }
  return {
    code: "MEASURABLE",
    summary:
      "Residual flow is measurable. Proceed to markout labeling on any policy accepts before changing capital posture.",
    residualViable: true,
  };
}

const note = {
  ts: new Date().toISOString(),
  kind: "phase0_market_reality_note",
  sources: files.map((f) => basename(f)),
  window: {
    firstTs,
    lastTs,
    durationHours: Math.round(durationHours * 100) / 100,
    cycles: cycles.length,
  },
  density: {
    totalOrderSightings: seen.length,
    totalGone: gone.length,
    cyclesWithOrders,
    cycleEmptyRatePct: pct(cycles.length - cyclesWithOrders, cycles.length),
    ordersPerHour,
    maxLiveConcurrent: maxLive,
    sumRawAcrossCycles: totalRaw,
  },
  composition: {
    sizeBuckets: sizeCounts,
    exclusiveCount: exclusiveSeen,
    exclusivePct: pct(exclusiveSeen, seen.length),
  },
  survival: {
    ...survival,
    reached30Pct: pct(survival.reached30, survival.n),
    reached50Pct: pct(survival.reached50, survival.n),
    reached80Pct: pct(survival.reached80, survival.n),
    finishedPct: pct(survival.finished, survival.n),
    medianLifetimeSec: medianLifetime,
  },
  errors: { count: errors.length },
  verdict: verdict({
    ordersPerHour,
    seen: seen.length,
    durationHours,
    exclusivePct: pct(exclusiveSeen, seen.length),
  }),
};

const md = `# Phase 0 — Market Reality Note

**Generated:** ${note.ts}  
**Window:** ${note.window.firstTs ?? "—"} → ${note.window.lastTs ?? "—"} (${note.window.durationHours} h, ${note.window.cycles} cycles)  
**Sources:** ${note.sources.join(", ") || "—"}

## Density

| Metric | Value |
|--------|------:|
| Order sightings | ${note.density.totalOrderSightings} |
| Orders disappeared | ${note.density.totalGone} |
| Orders / hour | ${note.density.ordersPerHour ?? "n/a"} |
| Cycles with ≥1 order | ${note.density.cyclesWithOrders} / ${note.window.cycles} |
| Empty-cycle rate | ${note.density.cycleEmptyRatePct ?? "n/a"}% |
| Max concurrent live | ${note.density.maxLiveConcurrent} |

## Composition

| Size bucket | Count |
|-------------|------:|
| dust | ${note.composition.sizeBuckets.dust} |
| small | ${note.composition.sizeBuckets.small} |
| medium | ${note.composition.sizeBuckets.medium} |
| large | ${note.composition.sizeBuckets.large} |
| exotic | ${note.composition.sizeBuckets.exotic} |

Exclusive fraction: **${note.composition.exclusivePct ?? "n/a"}%** (${note.composition.exclusiveCount} / ${note.density.totalOrderSightings})

## Survival (among disappeared orders)

| Gate | Count | % |
|------|------:|--:|
| reached 30% decay | ${note.survival.reached30} | ${note.survival.reached30Pct ?? "n/a"} |
| reached 50% decay | ${note.survival.reached50} | ${note.survival.reached50Pct ?? "n/a"} |
| reached 80% decay | ${note.survival.reached80} | ${note.survival.reached80Pct ?? "n/a"} |
| finished curve | ${note.survival.finished} | ${note.survival.finishedPct ?? "n/a"} |

Median lifetime: **${note.survival.medianLifetimeSec ?? "n/a"} s**

## Errors

Fetch/parse errors logged: ${note.errors.count}

## Verdict

**${note.verdict.code}** — ${note.verdict.summary}

Residual viable (at observed density): **${String(note.verdict.residualViable)}**

---

*Capital posture remains VIEW / WRITE OFF / NO_GO until Go/No-Go gates on real markouts are met.*
`;

await mkdir(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const jsonPath = join(OUT_DIR, `market-note-${stamp}.json`);
const mdPath = join(OUT_DIR, `market-note-${stamp}.md`);
await writeFile(jsonPath, JSON.stringify(note, null, 2));
await writeFile(mdPath, md);

console.log(JSON.stringify(note, null, 2));
console.error(
  JSON.stringify({
    level: "info",
    message: "phase0 market note written",
    json: jsonPath,
    md: mdPath,
    verdict: note.verdict.code,
  })
);
