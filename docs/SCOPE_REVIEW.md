# Scope review — original intent vs delivered

**Review date:** 2026-07-21  
**Repo:** [RedRobotKK/CavalRe-Sentinel-Base](https://github.com/RedRobotKK/CavalRe-Sentinel-Base)

This document closes the loop on everything called out from project start through research production.

---

## Original goals

| # | Goal | Status | Evidence |
|---|------|--------|----------|
| 1 | Secure non-custodial UniswapX bot for **Base** | **Done (dry-run)** | `packages/uniswapx-base`, `src/runner`, live mode disabled |
| 2 | Strict **TDD** | **Done** | Vitest across packages; CI runtime-gate |
| 3 | **Low capital** constraints | **Done** | `defaultSmallCapitalConfig`, RiskEngine gates |
| 4 | Jane Street / Cumberland **compliance bar** | **Done (research)** | [`COMPLIANCE_REVIEW.md`](COMPLIANCE_REVIEW.md) |
| 5 | **Amount / FloatLib** discipline | **Done** | `@cavalre/core` Amount; no Number for value |
| 6 | Fail-closed + explicit error codes | **Done** | Wallet, ERC-20, strategy, risk |
| 7 | UniswapX **TRUST** understanding | **Done** | [`TRUST_UNISWAPX.md`](TRUST_UNISWAPX.md) |
| 8 | cavalre-contracts **TRUST** | **Done** | [`TRUST_CAVALRE_CONTRACTS.md`](TRUST_CAVALRE_CONTRACTS.md) |
| 9 | Dutch low-capital **game theory** | **Done** | [`STRATEGY_DUTCH_LOW_CAPITAL.md`](STRATEGY_DUTCH_LOW_CAPITAL.md) |
| 10 | Edge **computed**, not assumed | **Done** | QuoterV2 `reference-cost.ts` + `computeEdgeBps` |
| 11 | Decay **before** risk/policy | **Done** | `runner.ts` order of operations |
| 12 | Dry-run **markout-ready** features | **Done** | Journal context schema |
| 13 | **Priority** classified | **Done** | `classifyOrder` → reject until policy |
| 14 | Live only after **written go/no-go** | **Done** | [`GO_NO_GO.md`](GO_NO_GO.md); `live_mode_not_enabled` |
| 15 | ERC-20 wallet lifecycle (non-custodial) | **Done** | `@cavalre/wallet` + [`WALLET.md`](WALLET.md) |
| 16 | Long-running dry-run harness + JSONL | **Done** | `scripts/dry-run-harness.mjs` + heartbeats |
| 17 | Mainnet variables (RPC, API, quoter) | **Done** | Base mainnet constants + env RPC |
| 18 | Research **desk UI** + charts + circuit | **Done** | `apps/desk` |
| 19 | Shadow markout labels for W/L | **Done** | `scripts/shadow-markout.mjs` |
| 20 | CI security / audit / tests | **Done** | `.github/workflows/ci.yml` |
| 21 | Production-grade README + docs | **Done** | This pass |

---

## Explicitly out of scope (by design)

| Item | Why |
|------|-----|
| Browser Connect-Wallet | Keys never in web UI |
| Live reactor execute | Blocked on go/no-go evidence |
| Priority trading | Needs separate written policy |
| SLM toxicity model | Phase 3; heuristic only today |
| Fake orders / synthetic fills | Would corrupt the research book |

---

## Open ops work (not missing code)

1. Run dry-run across **days** while Base Dutch has intermittent flow  
2. Accumulate **≥100 shadow accepts** with markouts  
3. Produce a human-signed go/no-go report from journals  
4. Only then consider Phase 1 live ($200 cap)

---

## Package test surface (research prod)

| Workspace | Role |
|-----------|------|
| core | Amount math |
| journal | Book + markout |
| risk-engine | Hard limits |
| strategy | Decay / edge / policy |
| uniswapx-base | Parse / poll / quoter |
| wallet | Signer + ERC-20 |
| runner | Composition cycle |

Run: `npm test && npm run typecheck && npm run audit:high`

---

## Verdict

**Phase 0 / research production code scope: complete.**  
**Phase 0.5 evidence collection: operator-driven.**  
**Phase 1 live: not authorized.**
