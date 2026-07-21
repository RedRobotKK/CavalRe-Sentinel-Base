import type { DecisionJournal } from "@cavalre/journal";
import type { RiskEngine } from "@cavalre/risk-engine";
import type { FetchFn, ParsedOrder } from "@cavalre/uniswapx-base";

export type RunnerMode = "dry-run" | "live";

export interface RunnerConfig {
  /** Defaults to dry-run. Live requires explicit opt-in. */
  mode?: RunnerMode;
  /** Injectable fetch for hermetic tests / dry-run. */
  fetchFn?: FetchFn;
  /** Max orders to pull per poll. */
  pollLimit?: number;
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
  halted: boolean;
  /** Orders that passed risk checks (dry-run: not executed). */
  acceptedOrders: ParsedOrder[];
}
