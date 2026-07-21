/**
 * Order classification for Base UniswapX.
 * TRUST: UniswapX PriorityOrderReactor + Dutch reactors on Base.
 *
 * Policy v1: only non-exclusive Dutch-class orders are tradable.
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

export function classifyOrder(order: ClassifiableOrder): OrderClass {
  const t = order.orderType.toLowerCase();

  if (t.includes("priority")) {
    return "priority";
  }

  const excl = order.exclusiveFiller?.toLowerCase() ?? null;
  if (excl && excl !== ZERO_ADDRESS) {
    return "exclusive";
  }

  if (
    t.includes("dutch") ||
    (order.decayStartTime !== null && order.decayEndTime !== null)
  ) {
    return "dutch";
  }

  return "unknown";
}

/** v1: only dutch is in scope for FillPolicy. */
export function isTradableClass(c: OrderClass): boolean {
  return c === "dutch";
}
