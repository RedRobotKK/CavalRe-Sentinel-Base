/**
 * Dutch V3 — block-based nonlinear decay (Base / Arbitrum / …).
 *
 * TRUST:
 *   https://github.com/Uniswap/sdks/blob/main/sdks/uniswapx-sdk/src/utils/dutchBlockDecay.ts
 *   https://github.com/Uniswap/UniswapX/blob/main/src/lib/NonlinearDutchDecayLib.sol
 *
 * Unlike V1/V2 `DutchDecayLib` (timestamp linear in dutch-decay.ts), V3:
 *   - clocks on **block number**, not wall time
 *   - uses a piecewise curve: relativeBlocks[] + relativeAmounts[]
 *   - cosigner carries decayStartBlock (exclusivity ends when decay starts)
 *
 * All amounts are Amount (bigint). Integer division = mulDivDown (floor).
 */

import type { Amount } from "@cavalre/core";

export class DutchBlockDecayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DutchBlockDecayError";
  }
}

export interface NonlinearDutchCurve {
  /** Block offsets from decayStartBlock (strictly increasing in well-formed orders). */
  relativeBlocks: number[];
  /**
   * Amount reduction from startAmount at each relativeBlocks point.
   * resolved = startAmount - relativeAmounts[i] at that point.
   * int256 on-chain; we store as signed bigint.
   */
  relativeAmounts: bigint[];
}

export interface DutchBlockDecayConfig {
  decayStartBlock: number;
  startAmount: Amount;
  relativeBlocks: number[];
  relativeAmounts: bigint[];
}

/**
 * Linear interpolation between two points (mulDivDown).
 * Mirrors NonLinearDutchDecayLib.linearDecay in the SDK.
 */
export function linearDecayBlocks(
  startPoint: number,
  endPoint: number,
  currentPoint: number,
  startAmount: Amount,
  endAmount: Amount
): Amount {
  if (currentPoint >= endPoint) return endAmount;
  if (currentPoint <= startPoint) return startAmount;
  if (startAmount === endAmount) return startAmount;
  if (endPoint <= startPoint) return endAmount;

  const elapsed = BigInt(currentPoint - startPoint);
  const duration = BigInt(endPoint - startPoint);

  if (endAmount < startAmount) {
    const delta = ((startAmount - endAmount) * elapsed) / duration;
    return startAmount - delta;
  }
  const delta = ((endAmount - startAmount) * elapsed) / duration;
  return startAmount + delta;
}

function locateArrayPosition(
  relativeBlocks: number[],
  currentRelativeBlock: number
): [number, number] {
  let prev = 0;
  let next = 0;
  for (; next < relativeBlocks.length; next++) {
    if (relativeBlocks[next]! >= currentRelativeBlock) {
      return [prev, next];
    }
    prev = next;
  }
  return [Math.max(0, next - 1), Math.max(0, next - 1)];
}

/**
 * Resolve decayed amount at `currentBlock`.
 * Byte-for-byte semantics of Uniswap SDK NonLinearDutchDecayLib.decay.
 */
export function decayAtBlock(
  curve: NonlinearDutchCurve,
  startAmount: Amount,
  decayStartBlock: number,
  currentBlock: number
): Amount {
  if (curve.relativeAmounts.length > 16) {
    throw new DutchBlockDecayError("InvalidDecayCurve");
  }
  if (curve.relativeBlocks.length !== curve.relativeAmounts.length) {
    throw new DutchBlockDecayError("InvalidDecayCurve: length mismatch");
  }

  // Before decay or empty curve → start
  if (decayStartBlock >= currentBlock || curve.relativeAmounts.length === 0) {
    return startAmount;
  }

  const blockDelta = currentBlock - decayStartBlock;

  // First segment: [0, relativeBlocks[0]] from start → start - relativeAmounts[0]
  if (curve.relativeBlocks[0]! > blockDelta) {
    const endAmt = startAmount - curve.relativeAmounts[0]!;
    return linearDecayBlocks(
      0,
      curve.relativeBlocks[0]!,
      blockDelta,
      startAmount,
      endAmt
    );
  }

  const [prev, next] = locateArrayPosition(curve.relativeBlocks, blockDelta);
  const lastAmount = startAmount - curve.relativeAmounts[prev]!;
  const nextAmount = startAmount - curve.relativeAmounts[next]!;

  return linearDecayBlocks(
    curve.relativeBlocks[prev]!,
    curve.relativeBlocks[next]!,
    blockDelta,
    lastAmount,
    nextAmount
  );
}

export function getBlockDecayedAmount(
  config: DutchBlockDecayConfig,
  atBlock: number
): Amount {
  return decayAtBlock(
    {
      relativeBlocks: config.relativeBlocks,
      relativeAmounts: config.relativeAmounts,
    },
    config.startAmount,
    config.decayStartBlock,
    atBlock
  );
}

/** Terminal amount after full curve (start − last relativeAmount). */
export function getV3EndAmount(config: {
  startAmount: Amount;
  relativeAmounts: bigint[];
}): Amount {
  if (config.relativeAmounts.length === 0) return config.startAmount;
  return config.startAmount - config.relativeAmounts[config.relativeAmounts.length - 1]!;
}

/**
 * Soft exclusivity: non-exclusive fillers must deliver more output.
 * scaled = amount * (10000 + exclusivityOverrideBps) / 10000  (ceil-friendly for obligation)
 *
 * For filler **obligation** (output we must pay), use ceil so we never under-deliver:
 *   (amount * (BPS + override) + BPS - 1) / BPS
 */
export function applyExclusivityOverride(
  amount: Amount,
  exclusivityOverrideBps: number
): Amount {
  if (exclusivityOverrideBps <= 0) return amount;
  if (exclusivityOverrideBps > 10_000) {
    throw new DutchBlockDecayError("InvalidExclusivityOverride");
  }
  const bps = 10_000n;
  const scale = bps + BigInt(exclusivityOverrideBps);
  // ceil div: (amount * scale + bps - 1) / bps
  return (amount * scale + bps - 1n) / bps;
}

/**
 * Progress through V3 curve in bps (0 = not started, 10000 = at/past last point).
 * Useful for fill-policy early-decay gates without wall-clock.
 */
export function blockDecayProgressBps(
  relativeBlocks: number[],
  decayStartBlock: number,
  currentBlock: number
): number {
  if (relativeBlocks.length === 0) return 0;
  if (currentBlock <= decayStartBlock) return 0;
  const last = relativeBlocks[relativeBlocks.length - 1]!;
  if (last <= 0) return 10_000;
  const delta = currentBlock - decayStartBlock;
  if (delta >= last) return 10_000;
  return Math.floor((delta * 10_000) / last);
}

/**
 * First block where resolved output obligation ≤ maxAffordable (for timing entry).
 * Binary search on block — Amount compare is exact.
 * Returns null if never affordable within curve.
 */
export function firstAffordableBlock(p: {
  startAmount: Amount;
  relativeBlocks: number[];
  relativeAmounts: bigint[];
  decayStartBlock: number;
  maxAffordableOutput: Amount;
  /** Optional exclusivity override if filling as non-exclusive. */
  exclusivityOverrideBps?: number;
}): number | null {
  if (p.relativeBlocks.length === 0) {
    const need =
      p.exclusivityOverrideBps && p.exclusivityOverrideBps > 0
        ? applyExclusivityOverride(p.startAmount, p.exclusivityOverrideBps)
        : p.startAmount;
    return need <= p.maxAffordableOutput ? p.decayStartBlock : null;
  }

  const lastRel = p.relativeBlocks[p.relativeBlocks.length - 1]!;
  const lo = p.decayStartBlock;
  const hi = p.decayStartBlock + lastRel;

  const obligation = (block: number): Amount => {
    const raw = decayAtBlock(
      {
        relativeBlocks: p.relativeBlocks,
        relativeAmounts: p.relativeAmounts,
      },
      p.startAmount,
      p.decayStartBlock,
      block
    );
    if (p.exclusivityOverrideBps && p.exclusivityOverrideBps > 0 && block < p.decayStartBlock) {
      // exclusive window is before decayStartBlock — override applies there
      return applyExclusivityOverride(raw, p.exclusivityOverrideBps);
    }
    // During exclusive window (block < decayStartBlock) start amount applies
    if (block < p.decayStartBlock && p.exclusivityOverrideBps && p.exclusivityOverrideBps > 0) {
      return applyExclusivityOverride(p.startAmount, p.exclusivityOverrideBps);
    }
    return raw;
  };

  // Check exclusive window soft-override path
  if (p.exclusivityOverrideBps && p.exclusivityOverrideBps > 0) {
    const exclNeed = applyExclusivityOverride(
      p.startAmount,
      p.exclusivityOverrideBps
    );
    if (exclNeed <= p.maxAffordableOutput) {
      // Can compete from any block before decay if we can afford override
      return Math.max(0, p.decayStartBlock - 1);
    }
  }

  if (obligation(hi) > p.maxAffordableOutput) return null;
  if (obligation(lo) <= p.maxAffordableOutput) return lo;

  let left = lo;
  let right = hi;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (obligation(mid) <= p.maxAffordableOutput) right = mid;
    else left = mid + 1;
  }
  return obligation(left) <= p.maxAffordableOutput ? left : null;
}
