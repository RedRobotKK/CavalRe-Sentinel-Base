/**
 * Resolve current executable amounts using Dutch decay.
 * MUST run before RiskEngine and FillPolicy.
 */

import type { Amount } from "@cavalre/core";
import {
  decayInput,
  decayOutput,
  decayProgressBps,
  DutchDecayError,
} from "./dutch-decay.js";

export interface ResolvableOrder {
  inputStart: Amount;
  inputEnd: Amount;
  outputStart: Amount;
  outputEnd: Amount;
  decayStartTime: number | null;
  decayEndTime: number | null;
}

export interface ResolvedAmounts {
  input: Amount;
  output: Amount;
  decayProgressBps: number;
}

export function resolveOrderAmounts(
  order: ResolvableOrder,
  now: number
): ResolvedAmounts {
  const start = order.decayStartTime;
  const end = order.decayEndTime;

  // No decay window → treat as static limit at start amounts
  if (start === null || end === null) {
    return {
      input: order.inputStart,
      output: order.outputStart,
      decayProgressBps: 0,
    };
  }

  try {
    const input = decayInput(
      order.inputStart,
      order.inputEnd,
      start,
      end,
      now
    );
    const output = decayOutput(
      order.outputStart,
      order.outputEnd,
      start,
      end,
      now
    );
    return {
      input,
      output,
      decayProgressBps: decayProgressBps(start, end, now),
    };
  } catch (e) {
    if (e instanceof DutchDecayError) {
      // Fail-closed: surface by rethrow for runner to reject
      throw e;
    }
    throw e;
  }
}
