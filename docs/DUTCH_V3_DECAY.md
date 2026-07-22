# Dutch V3 block decay (Base)

**TRUST sources**

- [UniswapX NonlinearDutchDecayLib.sol](https://github.com/Uniswap/UniswapX/blob/main/src/lib/NonlinearDutchDecayLib.sol)
- [uniswapx-sdk dutchBlockDecay.ts](https://github.com/Uniswap/sdks/blob/main/sdks/uniswapx-sdk/src/utils/dutchBlockDecay.ts)
- [Filling Dutch V3 Auctions](https://developers.uniswap.org/docs/liquidity/uniswapx/filling/dutch-v3-chains/filling-on-dutch-v3-chains)

## Why this exists

On Base, UniswapX **Dutch_V3** does **not** use wall-clock linear `DutchDecayLib`.

| Aspect | V2 (time) | V3 (Base) |
|--------|-----------|-----------|
| Clock | `decayStartTime` / `decayEndTime` (unix) | `decayStartBlock` + relative blocks |
| Curve | Single linear segment | Piecewise `relativeBlocks[]` + `relativeAmounts[]` |
| Exclusivity end | Often ≈ decay start time | **`decayStartBlock`** |
| Soft exclusivity | — | `exclusivityOverrideBps` |

Using V2 time decay alone on Base mis-resolves the filler obligation → wrong edge → wrong accept/wait/reject timing.

## Sentinel path

```text
API wire
  → parseOrder  (decayStartBlock, relativeBlocks, relativeAmounts, exclusivityOverrideBps)
  → pollOpenOrders + eth_blockNumber  (currentBlock, optional inclusionLag)
  → classifyOrder(order, nowSec, currentBlock)
  → resolveOrderAmounts  → path: v3_block | v2_time | static
  → evaluateDutchAuction  → decideFill(decayProgressBps from block or time)
```

### Resolve rules (fail-closed where required)

1. **V3** if `decayStartBlock` + non-empty equal-length curve + `currentBlock` → `decayAtBlock`
2. Else **V2** if `decayStartTime` + `decayEndTime` → linear time decay
3. Else **static** start amounts (progress 0)
4. Runner rejects with `missing_decay_window` if neither V3-capable nor V2 window

### Amount math

- All values are `Amount` (bigint)
- Segment interpolation uses **floor** division (mulDivDown), matching the reactor
- Soft override obligation uses **ceil** so we never under-deliver:
  `ceil(amount * (10000 + overrideBps) / 10000)`

### Policy

`blockDecayProgressBps` feeds the same early-decay gates as time progress (`earlyDecayBelowBps`, wait on negative edge early). Thresholds are unchanged; the clock is correct for V3.

## Operator notes

- `inclusionLag` (runner/poller): add N blocks when you want resolve-at-expected-land height
- Journals include `resolvePath`, `decayStartBlock`, `currentBlock`
- Live capital remains OFF until Go/No-Go

## Tests

```bash
npm run test -w @cavalre/strategy
npm run test -w @cavalre/uniswapx-base
```

Key cases: V3 midpoint, pre-decay start, V2 fallback without block, curve length mismatch reject, block exclusivity open/closed.
