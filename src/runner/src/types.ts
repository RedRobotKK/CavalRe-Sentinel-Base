import type { DecisionJournal } from "@cavalre/journal";
import type { RiskEngine } from "@cavalre/risk-engine";
import type { FetchFn, ParsedOrder } from "@cavalre/uniswapx-base";
import type { Amount } from "@cavalre/core";

export type RunnerMode = "dry-run" | "live";

/**
 * Reference cost provider: given order + resolved input, return output units
 * it would cost to source (AMM/inventory). MUST be supplied for meaningful edge.
 * If omitted, edge is treated as undefined → policy will not accept.
 */
export type ReferenceCostFn = (
  order: ParsedOrder,
  resolvedInput: Amount
) => Amount | Promise<Amount>;

export interface RunnerConfig {
  mode?: RunnerMode;
  fetchFn?: FetchFn;
  pollLimit?: number;
  /** Clock for decay resolution (tests). Default Date.now()/1000. */
  nowSec?: number;
  /** Required for accept path; without it edge is undefined. */
  referenceCostFn?: ReferenceCostFn;
}

export interface RunnerDeps {
  risk: RiskEngine;
  journal: DecisionJournal;
}

export interface CycleResult {
  mode: RunnerMode;
  fetchedAt: string;
  rawCount: number;
  accepted: number;
  rejected: number;
  waited: number;
  halted: boolean;
  acceptedOrders: ParsedOrder[];
}
