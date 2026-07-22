/**
 * Order classification for Base UniswapX.
 * TRUST: UniswapX PriorityOrderReactor + Dutch reactors on Base.
 *
 * Policy v1.1: only non-exclusive Dutch-class orders are tradable.
 * Exclusive window:
 *   - Prefer block clock when decayStartBlock + currentBlock are present (V3)
 *   - Else proxy exclusivityEnd ≈ decayStartTime (seconds)
 * Priority is ignored until a separate written policy exists.
 */

export type OrderClass = "dutch" | "priority" | "exclusive" | "unknown";

export interface ClassifiableOrder {
  orderType: string;
  exclusiveFiller: string | null;
  decayStartTime: number | null;
  decayEndTime: number | null;
  /** V3 block when exclusivity ends / decay starts. */
  decayStartBlock?: number | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * True when a non-zero exclusive filler is still inside the exclusive window.
 * Block clock preferred; time clock fallback; missing timing ⇒ still exclusive.
 */
export function isExclusiveWindowOpen(
  order: Pick<
    ClassifiableOrder,
    "exclusiveFiller" | "decayStartTime" | "decayStartBlock"
  >,
  nowSec: number,
  currentBlock?: number
): boolean {
  const excl = order.exclusiveFiller?.toLowerCase() ?? null;
  if (!excl || excl === ZERO_ADDRESS) return false;

  if (
    order.decayStartBlock != null &&
    Number.isFinite(order.decayStartBlock) &&
    currentBlock !== undefined
  ) {
    return currentBlock < order.decayStartBlock;
  }

  const end = order.decayStartTime;
  if (end === null || end === undefined || !Number.isFinite(end)) {
    return true;
  }

  return nowSec < end;
}

/**
 * Classify order. Pass nowSec (unix seconds) and optional currentBlock for V3.
 */
export function classifyOrder(
  order: ClassifiableOrder,
  nowSec?: number,
  currentBlock?: number
): OrderClass {
  const t = order.orderType.toLowerCase();
  const now =
    nowSec !== undefined && Number.isFinite(nowSec)
      ? nowSec
      : Math.floor(Date.now() / 1000);

  if (t.includes("priority")) {
    return "priority";
  }

  if (isExclusiveWindowOpen(order, now, currentBlock)) {
    return "exclusive";
  }

  if (
    t.includes("dutch") ||
    (order.decayStartTime !== null && order.decayEndTime !== null) ||
    (order.decayStartBlock != null && Number.isFinite(order.decayStartBlock))
  ) {
    return "dutch";
  }

  const excl = order.exclusiveFiller?.toLowerCase() ?? null;
  if (excl && excl !== ZERO_ADDRESS) {
    return "dutch";
  }

  return "unknown";
}

/** v1: only dutch is in scope for FillPolicy. */
export function isTradableClass(c: OrderClass): boolean {
  return c === "dutch";
}
