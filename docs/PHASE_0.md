# Phase 0 — Bootstrap & Dry-Run Foundation (Base)

**Goal**: Establish a green CI, core money primitives, RiskEngine, DecisionJournal, UniswapX poller, non-custodial wallet primitives, and a composition root that runs in pure dry-run mode on Base. Zero capital at risk.

## Exit Criteria

- [x] Repository bootstrapped with strict CI (typecheck + test + secret scan)
- [x] `@cavalre/core` Amount primitive (bigint only) + serialization helpers
- [x] `@cavalre/risk-engine` with small-capital defaults and tests
- [x] `@cavalre/journal` DecisionJournal (append-only, Amount-safe, JSONL)
- [x] `@cavalre/uniswapx-base` Dutch order parser + poller interface (dry-run)
- [x] `@cavalre/wallet` non-custodial signer + ERC-20 encoding (security-first)
- [x] `@cavalre/runner` composition root (poller → risk → journal), dry-run default
- [ ] Markout / toxicity scaffolding in the journal
- [ ] At least 7 days of continuous dry-run journal against live Base UniswapX open orders
- [ ] All tests green in CI on every push

## Capital

$0 at risk. No private keys required for dry-run. Live mode is explicitly disabled.

## FloatLib / Amount Rule

Every monetary value in the system is `Amount` (`bigint`).  
Serialization uses decimal strings.  
JavaScript `number` is never used for token amounts or notionals.

## Next

1. Optional: markout / toxicity fields on journal records
2. Long-running dry-run harness that writes JSONL journals from live Base order flow
3. Only after stable journals: consider tiny live probes with external Signer
