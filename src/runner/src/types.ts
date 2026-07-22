import type { DecisionJournal } from "@cavalre/journal";
import type { RiskEngine } from "@cavalre/risk-engine";
import type { FetchFn, ParsedOrder } from "@cavalre/uniswapx-base";
import type { Amount } from "@cavalre/core";
import type { VirtualBooks } from "@cavalre/strategy";

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
  /** Phase B: optional off-chain ledger mirror */
  virtualBooks?: VirtualBooks;
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
  booksSnapshot?: { root: string; sleeve: string; balance: string }[];
}
