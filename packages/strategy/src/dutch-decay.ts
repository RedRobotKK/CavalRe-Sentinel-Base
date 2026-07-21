/**
 * Linear Dutch decay — mirrors UniswapX DutchDecayLib semantics.
 * TRUST: https://github.com/Uniswap/UniswapX/blob/main/src/lib/DutchDecayLib.sol
 *
 * All amounts are Amount (bigint). No Number for value.
 */

import type { Amount } from "@cavalre/core";

export class DutchDecayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DutchDecayError";
  }
}

/**
 * Linear interpolation of amount between start and end over [startTime, endTime].
 * Matches on-chain linearDecay for uint amounts.
 */
export function linearDecay(
  startTime: number,
  endTime: number,
  currentTime: number,
  startAmount: Amount,
  endAmount: Amount
): Amount {
  if (endTime <= startTime) {
    throw new DutchDecayError("EndTimeBeforeStartTime");
  }
  if (currentTime >= endTime) return endAmount;
  if (currentTime <= startTime) return startAmount;
  if (startAmount === endAmount) return startAmount;

  const elapsed = BigInt(currentTime - startTime);
  const duration = BigInt(endTime - startTime);

  if (endAmount < startAmount) {
    const delta = ((startAmount - endAmount) * elapsed) / duration;
    return startAmount - delta;
  }
  const delta = ((endAmount - startAmount) * elapsed) / duration;
  return startAmount + delta;
}

/**
 * Resolve current amount given Dutch endpoints and times.
 * Same branching as DutchDecayLib.decay(uint256,...).
 */
export function decayAmount(
  startAmount: Amount,
  endAmount: Amount,
  decayStartTime: number,
  decayEndTime: number,
  now: number
): Amount {
  if (startAmount === endAmount) return startAmount;
  if (decayEndTime <= decayStartTime) {
    throw new DutchDecayError("EndTimeBeforeStartTime");
  }
  if (decayEndTime <= now) return endAmount;
  if (decayStartTime >= now) return startAmount;
  return linearDecay(
    decayStartTime,
    decayEndTime,
    now,
    startAmount,
    endAmount
  );
}

/**
 * Dutch output constraint: startAmount >= endAmount (UniswapX IncorrectAmounts otherwise).
 */
export function decayOutput(
  startAmount: Amount,
  endAmount: Amount,
  decayStartTime: number,
  decayEndTime: number,
  now: number
): Amount {
  if (startAmount < endAmount) {
    throw new DutchDecayError("IncorrectAmounts: output start < end");
  }
  return decayAmount(startAmount, endAmount, decayStartTime, decayEndTime, now);
}

/**
 * Dutch input constraint: startAmount <= endAmount.
 */
export function decayInput(
  startAmount: Amount,
  endAmount: Amount,
  decayStartTime: number,
  decayEndTime: number,
  now: number
): Amount {
  if (startAmount > endAmount) {
    throw new DutchDecayError("IncorrectAmounts: input start > end");
  }
  return decayAmount(startAmount, endAmount, decayStartTime, decayEndTime, now);
}

/** Progress through decay window in bps (0 = not started, 10000 = finished). */
export function decayProgressBps(
  decayStartTime: number,
  decayEndTime: number,
  now: number
): number {
  if (decayEndTime <= decayStartTime) return 10000;
  if (now <= decayStartTime) return 0;
  if (now >= decayEndTime) return 10000;
  return Math.floor(((now - decayStartTime) * 10000) / (decayEndTime - decayStartTime));
}
