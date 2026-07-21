# CavalRe Sentinel — Base

> Production-grade, capital-safety-first UniswapX filler and autonomous trading system on **Base**.
> Built with explicit TDD, fail-closed risk controls, and arbitrary-precision math.

**Status**: Phase 0 complete (dry-run foundation)  
**Primary venue**: Base (chainId `8453`) + UniswapX (permissionless filler)  
**Starting capital target**: ~$1,000 with strict compounding discipline

## Core Principles (Non-Negotiable)

1. **NEVER TRUST, ALWAYS VERIFY**
2. **Explicit TDD** — tests before (or with) implementation; CI enforces green tests
3. **FloatLib / Amount for ALL money math** — no JavaScript `Number` for token amounts or USD values
4. **Fail-closed** — unpriceable, stale, or unverifiable → no quote
5. **Hard risk limits in code** — RiskEngine is a gate, not a suggestion
6. **DecisionJournal** — every decision is recorded with full context
7. **DefiLlama** — required for market-size / volume claims
8. **Uniswap/UniswapX** — required for filler / reactor / order behavior ([docs/TRUST_UNISWAPX.md](docs/TRUST_UNISWAPX.md))
9. **CavalRe/cavalre-contracts** — required for Float, Ledger, accounting primitives ([docs/TRUST_CAVALRE_CONTRACTS.md](docs/TRUST_CAVALRE_CONTRACTS.md))
10. **Dry-run is the default**. Live mode requires explicit configuration.

## RULE OF TRUST Sources

| Source | Why |
|--------|-----|
| [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) | FloatLib, Ledger, Dispatcher, accounting-first primitives |
| [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) | Reactors, fill interface, Base deployments, order structs |
| [DefiLlama](https://defillama.com/) | Volume / TVL / market structure claims |
| [near/intents](https://github.com/near/intents) | Intent patterns (comparative) |
| [RedRobotKK/CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel) | Prior safety core & research |
| This repo | Implementation under test |

## Why Base First

- UniswapX fillers are permissionless
- Very low fees (viable for small capital)
- EVM → reuse of safety patterns + TypeScript tooling
- Meaningful Uniswap volume (verify on DefiLlama)
- Priority + DutchV3 reactors deployed (see TRUST_UNISWAPX.md)

## Repository Layout

```
packages/
  core/             # Amount (bigint) — FloatLib discipline off-chain
  risk-engine/      # Hard position / daily loss / drawdown limits
  journal/          # DecisionJournal + markout/toxicity
  uniswapx-base/    # Base poller + order parser
  wallet/           # Non-custodial signer + ERC-20 encoding
src/
  runner/           # Composition root (dry-run default)
scripts/
  dry-run-harness.mjs
docs/
  TRUST_CAVALRE_CONTRACTS.md   # Float + Ledger + logic flows (AI training)
  TRUST_UNISWAPX.md            # Reactor / filler expert map
  PHASE_0.md
  WALLET.md
```

## Development

```bash
npm install
npm test
npm run typecheck
npm run dry-run    # live Base orders → journals/*.jsonl (no keys)
```

## Related

- [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) — **application logic + FloatLib source of truth**
- [UniswapX](https://github.com/Uniswap/UniswapX) — settlement protocol
- [CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel) — prior research

---

**Capital safety > daily PnL.**  
**Journal quality > volume.**  
**Tests before implementation.**  
**NEVER TRUST, ALWAYS VERIFY.**
