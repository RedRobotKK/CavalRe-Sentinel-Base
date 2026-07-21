import type { DecisionJournal } from "@cavalre/journal";
import type { RiskEngine } from "@cavalre/risk-engine";
import type { FetchFn, ParsedOrder } from "@cavalre/uniswapx-base";
import type { Amount } from "@cavalre/core";

export type RunnerMode = "dry-run" | "live";

export type ReferenceCostFn = (
  order: ParsedOrder,
  resolvedInput: Amount
) => Amount | Promise<Amount>;

export interface RunnerConfig {
  mode?: RunnerMode;
  fetchFn?: FetchFn;
  pollLimit?: number;
  /** Base default Dutch_V3 */
  orderType?: string;
  nowSec?: number;
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
  requestUrl?: string;
}
