# CavalRe Sentinel — Base

**Capital-safety-first UniswapX research filler on Base (chainId `8453`).**

Built under a Jane Street / Cumberland-style bar: measured book, hard risk, Amount-safe math, fail-closed decisions, no live capital until written gates clear.

| | |
|--|--|
| **Posture today** | **Research production** — mainnet dry-run, journals, desk UI |
| **Live capital** | **OFF** until [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) |
| **Venue** | Base UniswapX (`Dutch_V3`) |
| **Node** | ≥ 22 |

```bash
git clone git@github.com:RedRobotKK/CavalRe-Sentinel-Base.git
cd CavalRe-Sentinel-Base
npm install
npm test && npm run typecheck && npm run audit:high
```

---

## What this is

A **permissionless UniswapX filler stack** designed for **low capital (~$1k)** and **selectivity over speed**:

1. Poll open Base Dutch orders  
2. Classify (dutch / priority / exclusive / unknown)  
3. Resolve Dutch decay (mirrors UniswapX `DutchDecayLib`)  
4. Compute edge vs Uniswap v3 QuoterV2 reference cost  
5. Toxicity heuristic → RiskEngine → FillPolicy (`accept` \| `reject` \| `wait`)  
6. Append **markout-ready** feature rows to JSONL  
7. Visualize the book on **Sentinel Desk** (circuit, charts, W/L when labeled)

**Not** a MetaMask dapp. **Not** live trading until go/no-go.

---

## Non-negotiable principles

1. **NEVER TRUST, ALWAYS VERIFY** against RULE OF TRUST sources  
2. **Explicit TDD** — CI runs tests + typecheck + secret scan + `npm audit --audit-level=high`  
3. **Amount (bigint) for all money** — FloatLib discipline; no JS `Number` for value  
4. **Fail-closed** — no reference cost ⇒ no accept  
5. **RiskEngine is a gate**, not analytics  
6. **DecisionJournal** is the book  
7. **Dry-run default**; `live_mode_not_enabled` until gates pass  
8. **No private keys** in repo, CI, journals, or browser desk  

---

## RULE OF TRUST

| Source | Role |
|--------|------|
| [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) | FloatLib, Ledger, accounting primitives — [`docs/TRUST_CAVALRE_CONTRACTS.md`](docs/TRUST_CAVALRE_CONTRACTS.md) |
| [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) | Reactors, decay, Base deployments — [`docs/TRUST_UNISWAPX.md`](docs/TRUST_UNISWAPX.md) |
| [DefiLlama](https://defillama.com/) | Market size / volume claims only |
| [near/intents](https://github.com/near/intents) | Comparative intent patterns |
| This repo | Implementation under test |

---

## Architecture

```
packages/
  core/              Amount (bigint) primitive
  risk-engine/       Position / daily loss / drawdown gates
  journal/           Append-only decisions + markout fields
  strategy/          Dutch decay, classify, edge, FillPolicy, toxicity
  uniswapx-base/     Poller, live wire parse, QuoterV2 reference cost
  wallet/            Non-custodial LocalSigner + ERC-20 encode (Node; not browser)
src/runner/          Composition root — compliant dry-run cycle
apps/desk/           Quant research desk (Vite + React + charts + circuit)
scripts/
  dry-run-harness.mjs
  desk-api.mjs
docs/                TRUST, strategy, compliance, go/no-go, desk, security
```

**Compliant cycle:**

```
classify → resolve decay → compute edge → toxicity → risk(resolved) → policy → feature journal
```

Priority / exclusive / unknown → reject (v1). Only non-exclusive Dutch is tradable in policy.

---

## Quick start

### 1. Quality gate (local)

```bash
npm install
npm test
npm run typecheck
npm run audit:high    # must be 0 high/critical
```

### 2. Mainnet dry-run (research book)

```bash
export BASE_RPC_URL=https://mainnet.base.org   # prefer a paid RPC for sustained runs
npm run dry-run
```

Writes `journals/dry-run-base-mainnet-*.jsonl`. No keys. No broadcast.  
Empty `raw: 0` means no open Base `Dutch_V3` orders — valid market state.

See [`docs/MAINNET_DRY_RUN.md`](docs/MAINNET_DRY_RUN.md).

### 3. Sentinel Desk (visual book)

```bash
# terminal A
npm run desk:api

# terminal B
npm run desk:web
```

Open the URL Vite prints (`http://127.0.0.1:5173` or next free port).

Optional display-only address (never a key):

```bash
export SENTINEL_ADDRESS=0xYourPublicAddressOnly
npm run desk:api
```

Desk shows: execution circuit, funnel/timeline/edge charts, **limits**, **markout W/L** (when labeled), **wallet readiness** (no browser keys), decision tape.

Docs: [`docs/DESK.md`](docs/DESK.md) · [`docs/DESK_QUANT_VIEW.md`](docs/DESK_QUANT_VIEW.md)

---

## Win / loss (quant definition)

| Metric | Meaning |
|--------|---------|
| **Accept rate** | Selectivity (policy), not skill |
| **Win / loss** | Markout bps ≥ 0 vs \< 0 after cost |
| **Hit rate** | wins / (wins + losses) on **labeled markouts only** |

Insufficient markout sample ⇒ desk shows `—`, never a fabricated win rate.  
Math stays Amount-safe; bps are integers derived from bigint ratios.

---

## Security & CI

GitHub Actions: **Production Security & Quality Gate**

1. **security-gate** — TruffleHog verified secrets (full history)  
2. **dependency-gate** — `npm ci` + `npm audit --audit-level=high`  
3. **runtime-gate** — typecheck + tests (needs 1 & 2)

Commit `package-lock.json` for reproducible `npm ci`.  
Remediation notes: [`docs/SECURITY_DEPS.md`](docs/SECURITY_DEPS.md).

---

## Live capital policy

**Default: NO-GO.**

Live mode throws `live_mode_not_enabled` until every gate in [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) is met with journal evidence (multi-day dry-run, shadow markouts, toxic fraction, worst-day bounds).

Phase-1 live (only after Go): tiny equity cap, direct reactor execute, daily review, halt on model divergence.

---

## Documentation index

| Doc | Contents |
|-----|----------|
| [`docs/PRODUCTION.md`](docs/PRODUCTION.md) | Research-prod vs live-prod checklist |
| [`docs/COMPLIANCE_REVIEW.md`](docs/COMPLIANCE_REVIEW.md) | MUST requirements matrix |
| [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) | Live capital gates |
| [`docs/STRATEGY_DUTCH_LOW_CAPITAL.md`](docs/STRATEGY_DUTCH_LOW_CAPITAL.md) | Game theory + low-capital policy |
| [`docs/TRUST_UNISWAPX.md`](docs/TRUST_UNISWAPX.md) | UniswapX expert map |
| [`docs/TRUST_CAVALRE_CONTRACTS.md`](docs/TRUST_CAVALRE_CONTRACTS.md) | Float / Ledger primitives |
| [`docs/MAINNET_DRY_RUN.md`](docs/MAINNET_DRY_RUN.md) | Operator runbook |
| [`docs/DESK.md`](docs/DESK.md) / [`DESK_QUANT_VIEW.md`](docs/DESK_QUANT_VIEW.md) | Desk USP & quant surfaces |
| [`docs/WALLET.md`](docs/WALLET.md) | Non-custodial wallet lifecycle |
| [`docs/PHASE_0.md`](docs/PHASE_0.md) | Phase 0 scope |

---

## Roadmap (honest)

| Phase | Status |
|-------|--------|
| 0 — Dry-run foundation, Amount, risk, journal, strategy, mainnet poll, desk | **Done** |
| 0.5 — Sustained journals + shadow markout labels + desk W/L populated | **In progress** |
| 1 — Live direct fill after go/no-go, tiny size | Blocked on gates |
| 2 — Priority policy (separate written policy), richer cost model | Not started |
| 3 — Optional Ledger inventory sleeves / SLM toxicity | Not started |

---

## Related

- [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) — FloatLib + accounting source of truth  
- [UniswapX](https://github.com/Uniswap/UniswapX) — settlement protocol  
- [CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel) — prior research lineage  

---

**Capital safety > daily PnL.**  
**Journal quality > volume.**  
**Accept rate ≠ win rate.**  
**NEVER TRUST, ALWAYS VERIFY.**
