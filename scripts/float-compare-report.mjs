#!/usr/bin/env node
/**
 * Print bigint vs float comparison samples.
 *   npm run float-compare
 */

import { compareDecayAndEdge } from "@cavalre/strategy";

const samples = [
  {
    label: "small-ints",
    startAmount: 1000n,
    endAmount: 900n,
    startTime: 0,
    endTime: 100,
    now: 50,
    refOutput: 1100n,
  },
  {
    label: "0.02-ETH-mid",
    startAmount: 20_000000000000000n,
    endAmount: 18_000000000000000n,
    startTime: 1_000,
    endTime: 2_000,
    now: 1_500,
    refOutput: 22_000000000000000n,
  },
  {
    label: "1-ETH-stress",
    startAmount: 1_000000000000000000n,
    endAmount: 999_000000000000000n,
    startTime: 0,
    endTime: 1_000_000,
    now: 123_456,
    refOutput: 1_001000000000000000n,
  },
  {
    label: "USDC-6dp",
    startAmount: 50_000000n,
    endAmount: 50_000000n,
    startTime: 0,
    endTime: 100,
    now: 40,
    refOutput: 50_000000n,
  },
];

for (const s of samples) {
  const r = compareDecayAndEdge(s);
  console.log(
    JSON.stringify(
      {
        label: r.label,
        progressBps: r.progressBps,
        resolvedOut: r.resolvedOut,
        edgeBps: r.edgeBps,
      },
      null,
      2
    )
  );
}

console.error(
  JSON.stringify({
    note: "Production path stays bigint Amount. Float is research-only comparison.",
  })
);
