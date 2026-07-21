import { toAmount, type Amount } from "@cavalre/core";
import type { WireOrder, ParsedOrder, ParseResult } from "./types.js";
import { BASE_CHAIN_ID } from "./constants.js";

/**
 * Parse and validate a single UniswapX wire order.
 * Fail-closed: any missing or invalid critical field → { ok: false }.
 * All monetary fields become Amount (bigint).
 */
export function parseOrder(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "not_an_object" };
  }

  const w = raw as WireOrder;

  if (typeof w.orderHash !== "string" || w.orderHash.length === 0) {
    return { ok: false, reason: "missing_orderHash" };
  }

  if (typeof w.chainId !== "number") {
    return { ok: false, reason: "missing_chainId", orderHash: w.orderHash };
  }

  if (w.chainId !== BASE_CHAIN_ID) {
    return {
      ok: false,
      reason: `wrong_chainId:${w.chainId}`,
      orderHash: w.orderHash,
    };
  }

  if (typeof w.orderStatus !== "string") {
    return { ok: false, reason: "missing_orderStatus", orderHash: w.orderHash };
  }

  if (!w.input || typeof w.input !== "object") {
    return { ok: false, reason: "missing_input", orderHash: w.orderHash };
  }

  if (!Array.isArray(w.outputs) || w.outputs.length === 0) {
    return { ok: false, reason: "missing_outputs", orderHash: w.orderHash };
  }

  // For v1 we only take the first output leg (dominant case).
  const out0 = w.outputs[0];
  if (!out0 || typeof out0 !== "object") {
    return { ok: false, reason: "invalid_output", orderHash: w.orderHash };
  }

  let inputStart: Amount;
  let inputEnd: Amount;
  let outputStart: Amount;
  let outputEnd: Amount;

  try {
    inputStart = toAmount(w.input.startAmount);
    inputEnd = toAmount(w.input.endAmount);
    outputStart = toAmount(out0.startAmount);
    outputEnd = toAmount(out0.endAmount);
  } catch {
    return {
      ok: false,
      reason: "invalid_amount_string",
      orderHash: w.orderHash,
    };
  }

  if (typeof w.input.token !== "string" || w.input.token.length === 0) {
    return { ok: false, reason: "missing_input_token", orderHash: w.orderHash };
  }

  if (typeof out0.token !== "string" || out0.token.length === 0) {
    return { ok: false, reason: "missing_output_token", orderHash: w.orderHash };
  }

  if (typeof out0.recipient !== "string") {
    return {
      ok: false,
      reason: "missing_output_recipient",
      orderHash: w.orderHash,
    };
  }

  const order: ParsedOrder = {
    orderHash: w.orderHash,
    chainId: w.chainId,
    orderStatus: w.orderStatus,
    orderType: typeof w.orderType === "string" ? w.orderType : "unknown",
    decayStartTime:
      typeof w.decayStartTime === "number" ? w.decayStartTime : null,
    decayEndTime: typeof w.decayEndTime === "number" ? w.decayEndTime : null,
    deadline: typeof w.deadline === "number" ? w.deadline : null,
    inputToken: w.input.token,
    inputStart,
    inputEnd,
    outputToken: out0.token,
    outputStart,
    outputEnd,
    outputRecipient: out0.recipient,
    exclusiveFiller:
      typeof w.exclusiveFiller === "string" ? w.exclusiveFiller : null,
    createdAt: typeof w.createdAt === "number" ? w.createdAt : null,
  };

  return { ok: true, order };
}

/**
 * Parse an array of wire orders. Returns only successfully parsed ones
 * plus a list of rejection reasons (for the journal).
 */
export function parseOrders(rawList: unknown[]): {
  orders: ParsedOrder[];
  rejections: { orderHash?: string; reason: string }[];
} {
  const orders: ParsedOrder[] = [];
  const rejections: { orderHash?: string; reason: string }[] = [];

  for (const raw of rawList) {
    const result = parseOrder(raw);
    if (result.ok) {
      orders.push(result.order);
    } else {
      rejections.push({ orderHash: result.orderHash, reason: result.reason });
    }
  }

  return { orders, rejections };
}
