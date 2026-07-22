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

## Curve math (reactor parity)

Let `S` = startAmount, `D` = decayStartBlock, `B` = currentBlock,  
`relativeBlocks = [b₀…bₙ]`, `relativeAmounts = [a₀…aₙ]` (reductions from `S`).

1. If `B ≤ D` or empty curve → amount = `S`
2. `Δ = B - D`
3. Locate segment `[bᵢ, bⱼ]` containing `Δ`
4. `Aᵢ = S - aᵢ`, `Aⱼ = S - aⱼ`
5. Linear **floor** interpolation (mulDivDown):

```text
amount = Aᵢ + (Aⱼ - Aᵢ) * (Δ - bᵢ) / (bⱼ - bᵢ)
```

First segment special-cases from block offset `0` → `b₀`.

**Do not improve on this formula for production fills.** Matching the reactor is the edge. Research can use FloatLib to rank near-threshold orders, but the **obligation** must be bigint floor-matched.

### What “better” means for Sentinel

| Lever | Better practice |
|-------|-----------------|
| Obligation | Exact `decayAtBlock` at **expected inclusion block** |
| Edge | Integer bps for gates; FloatLib ratio for ranking only |
| Entry timing | `firstAffordableBlock` vs max affordable from Quoter |
| Soft exclusivity | `applyExclusivityOverride` (ceil) then recompute edge |
| Lag | Small integer lag only (see below) |

## Inclusion lag

```text
resolveBlock = eth_blockNumber + inclusionLag
```

| Lag | Use |
|-----|-----|
| **0** | Desk / dry-run observation at head |
| **1–2** | Live fill targeting likely inclusion on Base (~2s blocks) |
| **>5** | **Rejected** — curve moves every block; large lag invents edge |

Implementation: `normalizeInclusionLag` in `packages/uniswapx-base/src/block.ts`  
(`MAX_INCLUSION_LAG = 5`, integer-only, fail-closed errors).

## Sentinel path

```text
API wire
  → parseOrder  (decayStartBlock, relativeBlocks, relativeAmounts, exclusivityOverrideBps)
  → pollOpenOrders + eth_blockNumber  (currentBlock ± inclusionLag)
  → classifyOrder(order, nowSec, currentBlock)
  → resolveOrderAmounts  → path: v3_block | v2_time | static
  → computeEdgeBps / decideFill(decayProgressBps)
```

### Resolve rules

1. **V3** if curve + `currentBlock` → `decayAtBlock`
2. Else **V2** if time window → linear time decay
3. Else **static** start amounts
4. Runner: `missing_decay_window` if neither V3-capable nor V2 window

### Edge (fail-closed)

```text
edgeBps = floor( (refOutput - resolvedOutput) * 10000 / refOutput )
refOutput == 0 → undefined (reject)
```

Policy maps: `edge_ok` / `edge_negative` / `edge_negative_wait_decay` / `edge_below_min` / `early_decay_thin_edge`.

## Tests

```bash
npm run test -w @cavalre/strategy      # includes exhaustive edge.* cases
npm run test -w @cavalre/uniswapx-base # parse V3 + block lag
```

## Desk UI notes

Pipeline boxes use **stable emissive** (smoothed targets). Continuous particle hits no longer flash label emissive each frame (candle flicker removed).
