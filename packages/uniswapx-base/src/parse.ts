import { toAmount, type Amount } from "@cavalre/core";
import type { WireOrder, ParsedOrder, ParseResult } from "./types.js";
import { BASE_CHAIN_ID } from "./constants.js";

/** Probe common UniswapX wire keys for an amount-like value. */
function pickWireAmount(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
      return obj[k];
    }
  }
  return undefined;
}

function readAmount(field: string, value: unknown): Amount {
  if (value === undefined || value === null || value === "") {
    throw new Error(`missing_${field}`);
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const inner = pickWireAmount(o, ["amount", "startAmount", "endAmount", "value"]);
    if (inner !== undefined) return readAmount(field, inner);
    throw new Error(`bad_type_${field}:object`);
  }
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "bigint"
  ) {
    throw new Error(`bad_type_${field}:${typeof value}`);
  }
  try {
    return toAmount(value);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${field}:${msg}`);
  }
}

function readOptionalNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Parse relativeBlocks array; fail closed on non-numeric entries. */
function readRelativeBlocks(raw: unknown): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("relativeBlocks:not_array");
  }
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const n = readOptionalNumber(raw[i]);
    if (n === null || n < 0 || !Number.isInteger(n)) {
      throw new Error(`relativeBlocks[${i}]:invalid`);
    }
    out.push(n);
  }
  return out;
}

/** Parse relativeAmounts as bigint reductions. */
function readRelativeAmounts(raw: unknown): bigint[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("relativeAmounts:not_array");
  }
  const out: bigint[] = [];
  for (let i = 0; i < raw.length; i++) {
    try {
      // allow negative int256 reductions from chain; store as bigint
      const v = raw[i];
      if (typeof v === "bigint") {
        out.push(v);
      } else if (typeof v === "number" && Number.isFinite(v)) {
        out.push(BigInt(Math.trunc(v)));
      } else if (typeof v === "string") {
        out.push(BigInt(v));
      } else {
        throw new Error("bad_type");
      }
    } catch {
      throw new Error(`relativeAmounts[${i}]:invalid`);
    }
  }
  return out;
}

export function parseOrder(raw: unknown, options?: { chainId?: number }): ParseResult {
  const expectedChain = options?.chainId ?? BASE_CHAIN_ID;

  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "not_an_object" };
  }

  const w = raw as WireOrder & Record<string, unknown>;
  const input = w.input as Record<string, unknown> | undefined;
  const outputs = w.outputs as Record<string, unknown>[] | undefined;

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

  if (!input || typeof input !== "object") {
    return { ok: false, reason: "missing_input", orderHash: w.orderHash };
  }

  if (!Array.isArray(outputs) || outputs.length === 0) {
    return { ok: false, reason: "missing_outputs", orderHash: w.orderHash };
  }

  const out0 = outputs[0];
  if (!out0 || typeof out0 !== "object") {
    return { ok: false, reason: "invalid_output", orderHash: w.orderHash };
  }

  let inputStart: Amount;
  let inputEnd: Amount;
  let outputStart: Amount;
  let outputEnd: Amount;

  try {
    const inStart = pickWireAmount(input, [
      "startAmount",
      "start_amount",
      "amount",
      "start",
    ]);
    const inEnd = pickWireAmount(input, [
      "endAmount",
      "end_amount",
      "amount",
      "end",
    ]);
    const outStart = pickWireAmount(out0, [
      "startAmount",
      "start_amount",
      "amount",
      "start",
    ]);
    const outEnd = pickWireAmount(out0, [
      "endAmount",
      "end_amount",
      "amount",
      "end",
    ]);

    inputStart = readAmount("input.startAmount", inStart);
    inputEnd = readAmount("input.endAmount", inEnd ?? inStart);
    outputStart = readAmount("output.startAmount", outStart);
    outputEnd = readAmount("output.endAmount", outEnd ?? outStart);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "invalid_amount",
      orderHash: w.orderHash,
    };
  }

  if (typeof input.token !== "string" || input.token.length === 0) {
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

  const cos = w.cosignerData as Record<string, unknown> | undefined;

  const decayStartTime =
    readOptionalNumber(w.decayStartTime) ??
    readOptionalNumber(cos?.decayStartTime);
  const decayEndTime =
    readOptionalNumber(w.decayEndTime) ??
    readOptionalNumber(cos?.decayEndTime);
  const decayStartBlock =
    readOptionalNumber(w.decayStartBlock) ??
    readOptionalNumber(cos?.decayStartBlock);

  const exclusiveFiller =
    typeof w.exclusiveFiller === "string"
      ? w.exclusiveFiller
      : typeof cos?.exclusiveFiller === "string"
        ? (cos.exclusiveFiller as string)
        : null;

  const exclusivityOverrideBps =
    readOptionalNumber(w.exclusivityOverrideBps) ??
    readOptionalNumber(cos?.exclusivityOverrideBps) ??
    0;

  let relativeBlocks: number[] = [];
  let relativeAmounts: bigint[] = [];
  try {
    relativeBlocks = readRelativeBlocks(
      w.relativeBlocks ?? cos?.relativeBlocks
    );
    relativeAmounts = readRelativeAmounts(
      w.relativeAmounts ?? cos?.relativeAmounts
    );
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "invalid_curve",
      orderHash: w.orderHash,
    };
  }

  if (relativeBlocks.length !== relativeAmounts.length) {
    return {
      ok: false,
      reason: "curve_length_mismatch",
      orderHash: w.orderHash,
    };
  }

  if (relativeBlocks.length > 16) {
    return {
      ok: false,
      reason: "InvalidDecayCurve",
      orderHash: w.orderHash,
    };
  }

  const order: ParsedOrder = {
    orderHash: w.orderHash,
    chainId: w.chainId,
    orderStatus: w.orderStatus,
    orderType,
    decayStartTime,
    decayEndTime,
    decayStartBlock,
    relativeBlocks,
    relativeAmounts,
    exclusivityOverrideBps: Math.max(0, Math.floor(exclusivityOverrideBps)),
    deadline: readOptionalNumber(w.deadline),
    inputToken: input.token as string,
    inputStart,
    inputEnd,
    outputToken: out0.token as string,
    outputStart,
    outputEnd,
    outputRecipient: out0.recipient as string,
    exclusiveFiller,
    createdAt: readOptionalNumber(w.createdAt),
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
