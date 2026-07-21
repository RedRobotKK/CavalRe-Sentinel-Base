# Phase 0 — Bootstrap & Dry-Run Foundation (Base)

**Goal**: Establish a green CI, core money primitives, RiskEngine, DecisionJournal, UniswapX poller, non-custodial wallet primitives, composition root, markout scaffolding, and a long-running dry-run harness. Zero capital at risk.

## Exit Criteria

- [x] Repository bootstrapped with strict CI (typecheck + test + secret scan)
- [x] `@cavalre/core` Amount primitive (bigint only) + serialization helpers
- [x] `@cavalre/risk-engine` with small-capital defaults and tests
- [x] `@cavalre/journal` DecisionJournal (append-only, Amount-safe, JSONL)
- [x] `@cavalre/uniswapx-base` Dutch order parser + poller interface (dry-run)
- [x] `@cavalre/wallet` non-custodial signer + ERC-20 encoding (security-first)
- [x] `@cavalre/runner` composition root (poller → risk → journal), dry-run default
- [x] Markout / toxicity scaffolding (`computeMarkoutBps`, `makeMarkoutAnnotation`, journal fields)
- [x] Long-running dry-run harness (`npm run dry-run`) writing JSONL under `journals/`
- [ ] At least 7 days of continuous dry-run journal against live Base UniswapX open orders (operational)
- [x] All tests green in CI on every push

## Capital

$0 at risk. No private keys required for dry-run. Live mode is explicitly disabled.

## FloatLib / Amount Rule

Every monetary value in the system is `Amount` (`bigint`).  
Serialization uses decimal strings.  
JavaScript `number` is never used for token amounts or notionals.

## Dry-run harness

```bash
npm run dry-run
# optional:
npm run dry-run -- --interval 15 --limit 30 --dir journals
```

- Polls live UniswapX open orders on Base
- Runs RiskEngine checks
- Appends every decision to a timestamped JSONL file
- Ctrl+C for graceful shutdown

## Next (post Phase 0)

1. Operate the harness and collect multi-day journals
2. Analyze accept/reject rates and (when fills exist) markouts
3. Only then consider tiny live probes with an external Signer
