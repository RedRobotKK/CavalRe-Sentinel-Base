/**
 * Minimal RiskEngine for small-capital Base operation.
 *
 * Hard limits only. No soft suggestions.
 * All values are Amount (bigint).
 */

import { type Amount, toAmount, isGT, ZERO, sub } from "@cavalre/core";

export interface RiskConfig {
  /** Total working capital (raw units or scaled USD units) */
  workingCapital: Amount;
  /** Maximum size of any single position / quote */
  maxPositionSize: Amount;
  /** Maximum loss allowed in a single day before halt */
  maxDailyLoss: Amount;
  /** Drawdown limit from peak equity (absolute amount) */
  drawdownLimit: Amount;
}

export interface RiskDecision {
  allowed: boolean;
  reason?: string;
}

export class RiskEngine {
  private readonly config: RiskConfig;
  private currentEquity: Amount;
  private peakEquity: Amount;
  private dailyLoss: Amount = ZERO;
  private halted = false;

  constructor(config: RiskConfig) {
    if (config.workingCapital <= 0n) {
      throw new Error("workingCapital must be positive");
    }
    this.config = config;
    this.currentEquity = config.workingCapital;
    this.peakEquity = config.workingCapital;
  }

  /** Check whether a proposed position/quote size is allowed */
  checkPositionSize(size: Amount): RiskDecision {
    if (this.halted) {
      return { allowed: false, reason: "engine_halted" };
    }
    if (isGT(size, this.config.maxPositionSize)) {
      return { allowed: false, reason: "exceeds_max_position_size" };
    }
    if (isGT(size, this.currentEquity)) {
      return { allowed: false, reason: "exceeds_current_equity" };
    }
    return { allowed: true };
  }

  /** Record a realized loss (positive number). May trigger daily loss halt. */
  recordLoss(loss: Amount): void {
    if (loss < 0n) {
      throw new Error("loss must be non-negative");
    }
    this.dailyLoss = this.dailyLoss + loss;
    this.currentEquity = sub(this.currentEquity, loss);

    if (isGT(this.dailyLoss, this.config.maxDailyLoss)) {
      this.halted = true;
    }

    // Update peak / drawdown check
    if (isGT(this.currentEquity, this.peakEquity)) {
      this.peakEquity = this.currentEquity;
    } else {
      const drawdown = sub(this.peakEquity, this.currentEquity);
      if (isGT(drawdown, this.config.drawdownLimit)) {
        this.halted = true;
      }
    }
  }

  /** Record a realized profit (increases equity). */
  recordProfit(profit: Amount): void {
    if (profit < 0n) {
      throw new Error("profit must be non-negative");
    }
    this.currentEquity = this.currentEquity + profit;
    if (isGT(this.currentEquity, this.peakEquity)) {
      this.peakEquity = this.currentEquity;
    }
  }

  isHalted(): boolean {
    return this.halted;
  }

  getCurrentEquity(): Amount {
    return this.currentEquity;
  }

  getDailyLoss(): Amount {
    return this.dailyLoss;
  }

  /** Manual clear of halt — must be explicit (human or higher-level policy). */
  clearHalt(): void {
    this.halted = false;
  }

  /** Reset daily loss counter (call at day boundary). Does not clear halt. */
  resetDailyLoss(): void {
    this.dailyLoss = ZERO;
  }
}

/** Helper to build a conservative config for ~$1000 starting capital (6-decimal USDC style). */
export function defaultSmallCapitalConfig(): RiskConfig {
  // Using 6-decimal units (USDC-like): 1000_000000 = $1000
  const capital = toAmount("1000000000");
  return {
    workingCapital: capital,
    maxPositionSize: toAmount("80000000"),   // $80 (8%)
    maxDailyLoss: toAmount("20000000"),      // $20 (2%)
    drawdownLimit: toAmount("50000000"),     // $50 (5%)
  };
}
