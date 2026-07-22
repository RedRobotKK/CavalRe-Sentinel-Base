import type { DecisionJournal } from "@cavalre/journal";
import type { RiskEngine } from "@cavalre/risk-engine";
import type { FetchFn, ParsedOrder } from "@cavalre/uniswapx-base";
import type { Amount } from "@cavalre/core";
import type { VirtualBooks } from "@cavalre/strategy";
import type { RpcFetchFn } from "@cavalre/uniswapx-base";

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
  /** Override block clock (tests / lag injection). */
  currentBlock?: number;
  referenceCostFn?: ReferenceCostFn;
  rpcUrl?: string;
  rpcFetchFn?: RpcFetchFn;
  inclusionLag?: number;
  skipBlockNumber?: boolean;
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
  currentBlock?: number | null;
  booksSnapshot?: { root: string; sleeve: string; balance: string }[];
}
