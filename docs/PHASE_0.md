# Phase 0 — Bootstrap & Dry-Run Foundation (Base)

**Goal**: Establish a green CI, core money primitives, RiskEngine, DecisionJournal, and a UniswapX order poller that runs in pure dry-run mode on Base. Zero capital at risk.

## Exit Criteria

- [x] Repository bootstrapped with strict CI (typecheck + test + secret scan)
- [x] `@cavalre/core` Amount primitive (bigint only) with tests + serialization helpers
- [x] `@cavalre/risk-engine` with small-capital defaults and tests
- [x] `@cavalre/journal` DecisionJournal (append-only, Amount-safe, JSONL)
- [x] `@cavalre/uniswapx-base` Dutch order parser + poller interface (dry-run)
- [ ] Composition root (`src/runner`) that defaults to dry-run and wires poller → risk → journal
- [ ] Markout / toxicity scaffolding in the journal
- [ ] At least 7 days of continuous dry-run journal against live Base UniswapX open orders
- [ ] All tests green in CI on every push

## Capital

$0 at risk. No private keys in the environment for live signing.

## FloatLib / Amount Rule

Every monetary value in the system is `Amount` (`bigint`).  
Serialization uses decimal strings.  
JavaScript `number` is never used for token amounts or notionals.

## Next

Composition root that ties poller + RiskEngine + Journal together in pure dry-run mode.
