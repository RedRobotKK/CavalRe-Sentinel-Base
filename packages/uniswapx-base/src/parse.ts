import { toAmount, type Amount } from "@cavalre/core";
import type { WireOrder, ParsedOrder, ParseResult } from "./types.js";
import { BASE_CHAIN_ID } from "./constants.js";

/**
 * Parse UniswapX wire order (live API shape).
 * Fail-closed. All sizes → Amount (bigint).
 */
export function parseOrder(raw: unknown, options?: { chainId?: number }): ParseResult {
  const expectedChain = options?.chainId ?? BASE_CHAIN_ID;

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

  if (w.chainId !== expectedChain) {
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

  const orderType =
    typeof w.orderType === "string"
      ? w.orderType
      : typeof w.type === "string"
        ? w.type
        : "unknown";

  const cos = w.cosignerData;
  const decayStartTime =
    typeof w.decayStartTime === "number"
      ? w.decayStartTime
      : typeof cos?.decayStartTime === "number"
        ? cos.decayStartTime
        : null;
  const decayEndTime =
    typeof w.decayEndTime === "number"
      ? w.decayEndTime
      : typeof cos?.decayEndTime === "number"
        ? cos.decayEndTime
        : null;

  const exclusiveFiller =
    typeof w.exclusiveFiller === "string"
      ? w.exclusiveFiller
      : typeof cos?.exclusiveFiller === "string"
        ? cos.exclusiveFiller
        : null;

  const order: ParsedOrder = {
    orderHash: w.orderHash,
    chainId: w.chainId,
    orderStatus: w.orderStatus,
    orderType,
    decayStartTime,
    decayEndTime,
    deadline: typeof w.deadline === "number" ? w.deadline : null,
    inputToken: w.input.token,
    inputStart,
    inputEnd,
    outputToken: out0.token,
    outputStart,
    outputEnd,
    outputRecipient: out0.recipient,
    exclusiveFiller,
    createdAt: typeof w.createdAt === "number" ? w.createdAt : null,
    encodedOrder: typeof w.encodedOrder === "string" ? w.encodedOrder : null,
    signature: typeof w.signature === "string" ? w.signature : null,
  };

  return { ok: true, order };
}

export function parseOrders(
  rawList: unknown[],
  options?: { chainId?: number }
): {
  orders: ParsedOrder[];
  rejections: { orderHash?: string; reason: string }[];
} {
  const orders: ParsedOrder[] = [];
  const rejections: { orderHash?: string; reason: string }[] = [];

  for (const raw of rawList) {
    const result = parseOrder(raw, options);
    if (result.ok) {
      orders.push(result.order);
    } else {
      rejections.push({ orderHash: result.orderHash, reason: result.reason });
    }
  }

  return { orders, rejections };
}
