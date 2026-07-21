# CavalRe Sentinel — Base

> Production-grade, capital-safety-first UniswapX filler and autonomous trading system on **Base**.
> Built with explicit TDD, fail-closed risk controls, and arbitrary-precision math.

**Status**: Bootstrap / Phase 0 (dry-run foundation)  
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
8. **Dry-run is the default**. Live mode requires explicit configuration.

## Why Base First

- UniswapX fillers are permissionless
- Very low fees (viable for small capital)
- EVM → maximal reuse of existing safety patterns and TypeScript tooling
- Meaningful Uniswap volume (verify on DefiLlama)
- Clean operational surface for the first live adapter

## Repository Layout

```
packages/
  core/             # Shared types, Amount primitive, utilities (test-first)
  risk-engine/      # Hard position sizing, daily loss, drawdown limits
  journal/          # DecisionJournal (versioned, append-only style) — next
  uniswapx-base/    # Base + UniswapX poller, order parser, filler adapter — next
src/
  runner/           # Composition root (dry-run by default) — next
.github/workflows/
  ci.yml            # Typecheck + Test + basic secret scan on every push/PR
docs/               # Design notes, runbooks, phase plans
```

## Development Workflow (Mandatory)

1. Write a failing test that describes the desired behavior.
2. Implement the minimum code to make the test pass.
3. Refactor while keeping tests green.
4. CI must pass before any merge to `main`.

```bash
# Install
npm install

# Run all tests (CI equivalent)
npm test

# Typecheck
npm run typecheck
```

## Phase Plan (Summary)

| Phase | Goal                              | Capital at Risk | Exit Criteria                                      |
|-------|-----------------------------------|------------------|----------------------------------------------------|
| 0     | Core + UniswapX dry-run on Base   | $0               | Stable journal, clean CI, markout scaffolding      |
| 1     | Tiny live probes                  | ≤ $200           | Fills match dry-run predictions, no unexpected halt|
| 2     | Controlled $1k operation          | $1,000           | Positive expectancy after costs + toxicity filter  |

## Related Repositories

- Original safety core & research: [CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel)
- CavalRe contracts: [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts)
- NEAR Intents reference: [near/intents](https://github.com/near/intents)

---

**Capital safety > daily PnL.**  
**Journal quality > volume.**  
**Tests before implementation.**
