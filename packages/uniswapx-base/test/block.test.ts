import { describe, it, expect } from "vitest";
import {
  fetchBaseBlockNumber,
  normalizeInclusionLag,
  BlockClockError,
  MAX_INCLUSION_LAG,
} from "../src/block.js";

describe("normalizeInclusionLag", () => {
  it("PASS: 0 and 2", () => {
    expect(normalizeInclusionLag(0)).toBe(0);
    expect(normalizeInclusionLag(2)).toBe(2);
  });

  it("FAIL: negative", () => {
    expect(() => normalizeInclusionLag(-1)).toThrow(BlockClockError);
    expect(() => normalizeInclusionLag(-1)).toThrow(/inclusion_lag_negative/);
  });

  it("FAIL: non-integer", () => {
    expect(() => normalizeInclusionLag(1.5)).toThrow(/inclusion_lag_not_integer/);
  });

  it("FAIL: exceeds max", () => {
    expect(() => normalizeInclusionLag(MAX_INCLUSION_LAG + 1)).toThrow(
      /inclusion_lag_exceeds_max/
    );
  });
});

describe("fetchBaseBlockNumber", () => {
  it("PASS: parses hex block and applies inclusion lag", async () => {
    const n = await fetchBaseBlockNumber({
      inclusionLag: 1,
      fetchFn: async () =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x10" }), {
          status: 200,
        }),
    });
    expect(n).toBe(17); // 16 + 1
  });

  it("FAIL: non-2xx reports status", async () => {
    await expect(
      fetchBaseBlockNumber({
        fetchFn: async () => new Response("{}", { status: 500 }),
      })
    ).rejects.toThrow(/base_block_rpc_failed:500/);
  });

  it("FAIL: bad result", async () => {
    await expect(
      fetchBaseBlockNumber({
        fetchFn: async () =>
          new Response(JSON.stringify({ result: null }), { status: 200 }),
      })
    ).rejects.toThrow(/base_block_rpc_bad_result/);
  });

  it("FAIL: invalid lag before RPC", async () => {
    await expect(
      fetchBaseBlockNumber({
        inclusionLag: 99,
        fetchFn: async () => {
          throw new Error("should_not_call_rpc");
        },
      })
    ).rejects.toThrow(/inclusion_lag_exceeds_max/);
  });
});
