import { describe, it, expect } from "vitest";
import { fetchBaseBlockNumber } from "../src/block.js";

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

  it("FAIL: non-2xx", async () => {
    await expect(
      fetchBaseBlockNumber({
        fetchFn: async () => new Response("{}", { status: 500 }),
      })
    ).rejects.toThrow(/base_block_rpc_failed/);
  });

  it("FAIL: bad result", async () => {
    await expect(
      fetchBaseBlockNumber({
        fetchFn: async () =>
          new Response(JSON.stringify({ result: null }), { status: 200 }),
      })
    ).rejects.toThrow(/base_block_rpc_bad_result/);
  });
});
