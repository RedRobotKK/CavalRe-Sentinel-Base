# Design Peer Review Summary (2026-07-20)

## Accepted Direction

- Primary chain: **Base** (chainId 8453)
- Primary venue: UniswapX permissionless filler
- Starting capital: **$1,000** with compounding of net positive edge
- Safety core (Amount/Float, RiskEngine, fail-closed, Journal) is non-negotiable
- DefiLlama is a required verification source
- Full cross-bridge architecture deferred (too complex for current capital)

## Material Gap to Close Early

Adverse selection / toxicity modeling. The RiskEngine currently handles notional, daily loss, and drawdown. It does **not** yet track markout. This must be added in Phase 0/1 before any meaningful compounding.

## Process

- Explicit TDD
- CI must stay green
- Dry-run default
- Human clear of kill-switch / halt
