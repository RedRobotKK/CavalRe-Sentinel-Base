# Operating modes

| Mode | Sources | Signing / broadcast | How |
|------|---------|---------------------|-----|
| **VIEW** (default) | Real UniswapX orders API + Base RPC (QuoterV2) | **Never** | `npm run stack` / `npm run dry-run` |
| **SIM** (optional) | Synthetic orders through the **same** decision path | **Never** | `npm run simulate` (can run beside VIEW) |
| **WRITE** | Same reads + Reactor execute path | Only with Node wallet env | Credentials **and** future live flag |

## VIEW (research)

Always connected to **real** upstreams when the network is available:

1. `GET https://api.uniswap.org/v2/orders?chainId=8453&orderStatus=open&orderType=Dutch_V3`
2. Base RPC `eth_call` → Uniswap v3 QuoterV2 (reference cost / edge)

Outputs stay local: `journals/*.jsonl` → desk-api → UI.

No private keys. Runner throws `live_mode_not_enabled` if mode is `live`.

## SIM

Does **not** replace VIEW. Injects wire-shaped orders via `fetchFn` so you can stress policy/UI when the book is empty. Real dry-run can keep polling mainnet in another process.

## WRITE (not enabled)

Intended gate:

```bash
export SENTINEL_PRIVATE_KEY=0x...   # Node only — never browser
# future: SENTINEL_LIVE=1 after go/no-go
```

Until live is explicitly enabled in code + ops checklist, credentials only affect **status display** (address configured), not execution.

## Desk badges

- `VIEW` — read path, real sources
- `WRITE OFF` — no signing
- `UNISWAPX` / `RPC` — configured endpoints (reachability is per-cycle in dry-run logs)
