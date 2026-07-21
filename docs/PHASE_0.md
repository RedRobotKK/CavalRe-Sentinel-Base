# Phase 0 — Bootstrap & Dry-Run Foundation (Base)

**Goal**: Establish a green CI, core money primitives, RiskEngine, and a UniswapX order poller that runs in pure dry-run mode on Base. Zero capital at risk.

## Exit Criteria

- [x] Repository bootstrapped with strict CI (typecheck + test + secret scan)
- [x] `@cavalre/core` Amount primitive (bigint only) with tests
- [x] `@cavalre/risk-engine` with small-capital defaults and tests
- [ ] DecisionJournal package (append-only, versioned records)
- [ ] UniswapX Base order poller + Dutch order parser (dry-run only)
- [ ] Composition root (`src/runner`) that defaults to dry-run
- [ ] Markout / toxicity scaffolding in the journal
- [ ] At least 7 days of continuous dry-run journal against live Base UniswapX open orders
- [ ] All tests green in CI on every push

## Capital

$0 at risk. No private keys in the environment for live signing.

## Next

Only after Phase 0 exit criteria are met do we move to Phase 1 (tiny live probes ≤ $200).
