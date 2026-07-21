# CavalRe Sentinel — Base

> Production-grade, capital-safety-first UniswapX filler and autonomous trading system on **Base**.
> Built with explicit TDD, fail-closed risk controls, and arbitrary-precision math.

**Status**: Phase 0 complete (dry-run foundation)  
**Primary venue**: Base (chainId `8453`) + UniswapX (permissionless filler)  
**Starting capital target**: ~$1,000 with strict compounding discipline

## Core Principles (Non-Negotiable)

1. **NEVER TRUST, ALWAYS VERIFY**
2. **Explicit TDD** — tests are written before (or with) implementation; CI enforces green tests
3. **FloatLib / Amount for ALL money math** — no JavaScript `Number` for token amounts or USD values
4. **Fail-closed** — unpriceable, stale, or unverifiable → no quote
5. **Hard risk limits in code** — RiskEngine is a gate, not a suggestion
6. **DecisionJournal** — every decision is recorded with full context
7. **DefiLlama** is a required verification source for any market-size or volume claims
8. **Uniswap/UniswapX** is a required verification source for all filler / reactor / order behavior — see [docs/TRUST_UNISWAPX.md](docs/TRUST_UNISWAPX.md)
9. **Dry-run is the default**. Live mode requires explicit configuration.

## RULE OF TRUST Sources

| Source | Why |
|--------|-----|
| [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) | Canonical reactors, fill interface, Base deployments, order structs |
| [DefiLlama](https://defillama.com/) | Volume / TVL / market structure claims |
| [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) | FloatLib origin, accounting discipline |
| [near/intents](https://github.com/near/intents) | Intent patterns (historical / comparative) |
| [RedRobotKK/CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel) | Prior safety core & research |
| This repo | Implementation under test |

## Why Base First

- UniswapX fillers are permissionless
- Very low fees (viable for small capital)
- EVM → maximal reuse of existing safety patterns and TypeScript tooling
- Meaningful Uniswap volume (verify on DefiLlama)
- Clean operational surface for the first live adapter
- Both **Priority** and **DutchV3** reactors deployed (see TRUST_UNISWAPX.md)

## Repository Layout

```
packages/
  core/             # Amount primitive (bigint), serialization
  risk-engine/      # Hard position / daily loss / drawdown limits
  journal/          # DecisionJournal + markout/toxicity scaffolding
  uniswapx-base/    # Base poller + Dutch/Priority-aware parser
  wallet/           # Non-custodial signer + ERC-20 encoding
src/
  runner/           # Composition root (dry-run default)
scripts/
  dry-run-harness.mjs   # Long-running live order → JSONL journal
docs/
  TRUST_UNISWAPX.md     # Expert map of UniswapX (mandatory reading)
  PHASE_0.md
  WALLET.md
  DESIGN_PEER_REVIEW.md
```

## Development Workflow (Mandatory)

1. Write a failing test that describes the desired behavior.
2. Implement the minimum code to make the test pass.
3. Refactor while keeping tests green.
4. CI must pass before any merge to `main`.
5. Any claim about UniswapX behavior → verify against [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX).

```bash
npm install
npm test
npm run typecheck
npm run dry-run          # live Base orders → journals/*.jsonl (no keys)
```

## Phase Plan (Summary)

| Phase | Goal | Capital at Risk | Exit Criteria |
|-------|------|------------------|---------------|
| 0 | Core + dry-run on Base | $0 | Done (code). Operate harness for multi-day journals. |
| 1 | Tiny live probes | ≤ $200 | Fills match dry-run predictions, no unexpected halt |
| 2 | Controlled $1k operation | $1,000 | Positive expectancy after costs + toxicity filter |

## Related Repositories

- Original safety core & research: [CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel)
- CavalRe contracts: [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts)
- **UniswapX (TRUST):** [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX)

---

**Capital safety > daily PnL.**  
**Journal quality > volume.**  
**Tests before implementation.**  
**NEVER TRUST, ALWAYS VERIFY.**
