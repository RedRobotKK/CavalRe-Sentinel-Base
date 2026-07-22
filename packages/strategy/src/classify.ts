/**
 * Order classification for Base UniswapX.
 * TRUST: UniswapX PriorityOrderReactor + Dutch reactors on Base.
 *
 * Policy v1.1: only non-exclusive Dutch-class orders are tradable.
 * Exclusive window proxy: exclusiveFiller is binding only until
 * decayStartTime (common Exclusive Dutch / cosigner pattern).
 * After that, treat as public dutch (post-exclusive).
 * Priority is ignored until a separate written policy exists.
 */

export type OrderClass = "dutch" | "priority" | "exclusive" | "unknown";

export interface ClassifiableOrder {
  orderType: string;
  exclusiveFiller: string | null;
  decayStartTime: number | null;
  decayEndTime: number | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * True when a non-zero exclusive filler is still inside the exclusive window.
 * Proxy: exclusivityEnd ≈ decayStartTime (seconds, unix).
 * Fail-closed: missing decayStartTime ⇒ still exclusive.
 */
export function isExclusiveWindowOpen(
  order: Pick<ClassifiableOrder, "exclusiveFiller" | "decayStartTime">,
  nowSec: number
): boolean {
  const excl = order.exclusiveFiller?.toLowerCase() ?? null;
  if (!excl || excl === ZERO_ADDRESS) return false;

  const end = order.decayStartTime;
  if (end === null || !Number.isFinite(end)) {
    // No timing → cannot prove post-exclusive; keep exclusive
    return true;
  }

  return nowSec < end;
}

/**
 * Classify order. Pass nowSec (unix seconds) for exclusivity proxy;
 * defaults to Date.now()/1000 when omitted.
 */
export function classifyOrder(
  order: ClassifiableOrder,
  nowSec?: number
): OrderClass {
  const t = order.orderType.toLowerCase();
  const now =
    nowSec !== undefined && Number.isFinite(nowSec)
      ? nowSec
      : Math.floor(Date.now() / 1000);

  if (t.includes("priority")) {
    return "priority";
  }

  if (isExclusiveWindowOpen(order, now)) {
    return "exclusive";
  }

  // Post-exclusive or never exclusive
  if (
    t.includes("dutch") ||
    (order.decayStartTime !== null && order.decayEndTime !== null)
  ) {
    return "dutch";
  }

  // Had exclusive filler but no dutch signals and window closed — still dutch-like
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
