# UniswapX Dutch mechanics → how CavalRe tries to win

## UniswapX Dutch (filler view)

A Dutch order advertises a **price trajectory** over `[decayStart, decayEnd]`:

- **Input** (what the swapper pays) and/or **output** (what the swapper receives) decay linearly.
- As time moves forward, terms typically become **more attractive to the filler** (you deliver less output or receive more input for the same other leg — exact direction depends on which side decays).
- Fillers compete to call `Reactor.execute` when their **sourcing cost** (AMM / inventory) is better than the order’s obligation.

Reference: [UniswapX](https://github.com/Uniswap/UniswapX) `DutchDecayLib`.

## CavalRe inventory-light win condition

```
resolvedOut  = DutchDecay(output, now)     // what we must send user
refOut       = QuoterV2(tokenIn→tokenOut, resolvedIn)  // what AMM gives us
edgeBps      = (refOut - resolvedOut) / refOut * 10_000
```

| edgeBps | Meaning |
|---------|---------|
| **> 0** | AMM gives more out than order requires → room to fill + keep spread |
| **= 0** | Flat |
| **< 0** | Would lose on a round-trip source |

**Accept only if** `edgeBps >= minEdgeBps` (default **5**) and toxicity/risk pass.

## Policy features (implemented)

| Feature | Behavior |
|---------|----------|
| Computed edge | QuoterV2 on Base — never assume |
| Decay-before-risk | Size gates use **resolved** amounts |
| minEdgeBps | Default 5 bps |
| Early negative / thin edge | **WAIT** while decay < 40% (price may improve) |
| Late negative / thin | **REJECT** |
| Priority / exclusive | **REJECT** until separate policy |
| Toxicity heuristic | High tox → reject |
| RiskEngine | Hard position / loss / drawdown |

## What does *not* win on small capital

- Racing Priority gas auctions without a dedicated policy  
- Filling exclusive orders meant for another filler  
- Accepting negative edge “for volume”  
- Using JS `number` for size (precision loss → bad fills)

## Research path

1. `npm run dry-run` — live book  
2. Journals + `shadow-markout` — did edge survive?  
3. `go-no-go` — only then consider tiny live  
