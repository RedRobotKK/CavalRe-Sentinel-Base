/**
 * Resolve current executable amounts using Dutch decay.
 * MUST run before RiskEngine and FillPolicy.
 *
 * Base Dutch_V3: block-based NonlinearDutchDecay when curve + currentBlock present.
 * V2 / fallback: timestamp linear DutchDecayLib.
 *
 * TRUST:
 *   dutch-block-decay.ts (SDK parity)
 *   dutch-decay.ts (V2 linear time)
 */

import type { Amount } from "@cavalre/core";
import {
  decayInput,
  decayOutput,
  decayProgressBps,
  DutchDecayError,
} from "./dutch-decay.js";
import {
  decayAtBlock,
  blockDecayProgressBps,
  DutchBlockDecayError,
} from "./dutch-block-decay.js";

export interface ResolvableOrder {
  inputStart: Amount;
  inputEnd: Amount;
  outputStart: Amount;
  outputEnd: Amount;
  decayStartTime: number | null;
  decayEndTime: number | null;
  /** V3 */
  decayStartBlock?: number | null;
  relativeBlocks?: number[];
  relativeAmounts?: bigint[];
}

export interface ResolveClock {
  /** Unix seconds — V2 time decay */
  nowSec: number;
  /** Chain block number — V3 block decay */
  currentBlock?: number;
}

export interface ResolvedAmounts {
  input: Amount;
  output: Amount;
  decayProgressBps: number;
  /** Which path produced the resolution. */
  path: "v3_block" | "v2_time" | "static";
}

function hasV3Curve(order: ResolvableOrder): boolean {
  return (
    order.decayStartBlock != null &&
    Number.isFinite(order.decayStartBlock) &&
    Array.isArray(order.relativeBlocks) &&
    Array.isArray(order.relativeAmounts) &&
    order.relativeBlocks.length > 0 &&
    order.relativeBlocks.length === order.relativeAmounts.length
  );
}

/**
 * Resolve amounts at the given clock.
 * Prefers V3 block curve when complete; else V2 time window; else static start.
 */
export function resolveOrderAmounts(
  order: ResolvableOrder,
  clock: ResolveClock | number
): ResolvedAmounts {
  // Back-compat: second arg was `now: number`
  const c: ResolveClock =
    typeof clock === "number" ? { nowSec: clock } : clock;

  if (hasV3Curve(order) && c.currentBlock !== undefined) {
    try {
      const curve = {
        relativeBlocks: order.relativeBlocks!,
        relativeAmounts: order.relativeAmounts!,
      };
      const output = decayAtBlock(
        curve,
        order.outputStart,
        order.decayStartBlock!,
        c.currentBlock
      );
      // Input curve is often flat on Dutch out; if same shape provided, decay it.
      // Without a separate input curve, hold inputStart (typical V3 output-decay).
      const input = order.inputStart;
      return {
        input,
        output,
        decayProgressBps: blockDecayProgressBps(
          order.relativeBlocks!,
          order.decayStartBlock!,
          c.currentBlock
        ),
        path: "v3_block",
      };
    } catch (e) {
      if (e instanceof DutchBlockDecayError) throw e;
      throw e;
    }
  }

  const start = order.decayStartTime;
  const end = order.decayEndTime;

  if (start === null || end === null || start === undefined || end === undefined) {
    return {
      input: order.inputStart,
      output: order.outputStart,
      decayProgressBps: 0,
      path: "static",
    };
  }

  try {
    const input = decayInput(
      order.inputStart,
      order.inputEnd,
      start,
      end,
      c.nowSec
    );
    const output = decayOutput(
      order.outputStart,
      order.outputEnd,
      start,
      end,
      c.nowSec
    );
    return {
      input,
      output,
      decayProgressBps: decayProgressBps(start, end, c.nowSec),
      path: "v2_time",
    };
  } catch (e) {
    if (e instanceof DutchDecayError) throw e;
    throw e;
  }
}

/** True when order can be resolved via V3 block path given a block number. */
export function canResolveV3(
  order: ResolvableOrder,
  currentBlock?: number
): boolean {
  return hasV3Curve(order) && currentBlock !== undefined;
}
