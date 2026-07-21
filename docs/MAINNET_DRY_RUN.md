# Base Mainnet Dry-Run Runbook

**Mode:** research / shadow book only. **No signing. No broadcast. No live capital.**

## Addresses (Base, chainId 8453)

| Item | Address |
|------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Priority Reactor | `0x000000001Ec5656dcdB24D90DFa42742738De729` |
| Dutch V3 Reactor | `0x000000008a8330B5d1F43A62Bf4C673A49f27ba0` |
| Uniswap v3 QuoterV2 | `0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a` |
| UniswapX orders API | `https://api.uniswap.org/v2/orders?chainId=8453&orderStatus=open` |

TRUST: UniswapX README, Uniswap v3 Base deployments.

## Run

```bash
cd /Users/daniel/Development/CavalRe-Sentinel-Base
git pull origin main
npm install

export BASE_RPC_URL=https://mainnet.base.org   # or Alchemy/QuickNode/etc.
npm run dry-run

# optional
npm run dry-run -- --interval 15 --limit 40 --dir journals
```

## What happens each cycle

1. GET open orders from UniswapX API (Base)
2. Classify (Priority/exclusive ignored)
3. Resolve Dutch amounts at wall clock
4. QuoterV2 `eth_call` for ref output (best of fee tiers)
5. Compute edge bps, toxicity, risk, policy
6. Append markout-ready feature rows to `journals/dry-run-base-mainnet-*.jsonl`

## Success signals

- Cycles increment without crash
- `raw > 0` when market is active
- Mix of reject / wait / (rare) accept
- JSONL lines include `edgeBps`, `resolvedInput`, `refOutput`, `orderClass`

## Still forbidden

- `mode: live`
- Private keys in env for this harness
- Capital deployment before `docs/GO_NO_GO.md`
