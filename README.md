<div align="center">

# CavalRe Sentinel — Base

**Capital-safety-first UniswapX research filler on Base**

Selective Dutch · Amount-safe math · Fail-closed risk · Journal-first desk · Live capital off until go/no-go

[![CI](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml/badge.svg)](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chain](https://img.shields.io/badge/chain-Base%208453-0052FF)](https://base.org)
[![Posture](https://img.shields.io/badge/live%20capital-OFF-red)](docs/GO_NO_GO.md)

[Quick start](#quick-start) · [Math](#core-math) · [Architecture](#architecture) · [Desk](#sentinel-desk) · [Docs](#documentation) · [Scope](docs/SCOPE_REVIEW.md) · [Go/No-Go](docs/GO_NO_GO.md)

</div>

---

## Why this exists

Most UniswapX filler demos optimize for **speed and volume**.  
This stack optimizes for **survival of small capital**:

- Every money value is an **Amount** (`bigint`) — FloatLib discipline off-chain  
- **Edge is computed** against Uniswap v3 QuoterV2 — never assumed  
- **Dutch decay is resolved before** risk and policy  
- **Priority** on Base is classified and **ignored** until a written policy exists  
- The **journal is the book**; the desk only visualizes what was written  
- **Live mode is hard-disabled** until [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) clears  

> **Capital safety > daily PnL.**  
> **Journal quality > volume.**  
> **Accept rate ≠ win rate.**  
> **NEVER TRUST, ALWAYS VERIFY.**

---

## Quick start

```bash
git clone git@github.com:RedRobotKK/CavalRe-Sentinel-Base.git
cd CavalRe-Sentinel-Base
npm install
npm test && npm run typecheck && npm run audit:high
```

### Mainnet dry-run (no keys, no broadcast)

```bash
export BASE_RPC_URL=https://mainnet.base.org   # prefer a dedicated RPC for long runs
npm run dry-run
```

Writes `journals/dry-run-base-mainnet-*.jsonl` (including cycle heartbeats when the book is empty).

### Shadow markout (label accepts for W/L)

```bash
npm run shadow-markout
npm run shadow-markout -- --window 120
```

### Sentinel Desk (local quant UI)

```bash
npm run desk:api    # http://127.0.0.1:8787
npm run desk:web    # http://127.0.0.1:5173 (or next free port)
```

| Surface | Doc |
|---------|-----|
| Operator dry-run | [`docs/MAINNET_DRY_RUN.md`](docs/MAINNET_DRY_RUN.md) |
| Shadow markout | [`docs/SHADOW_MARKOUT.md`](docs/SHADOW_MARKOUT.md) |
| Desk USP | [`docs/DESK.md`](docs/DESK.md) · [`docs/DESK_QUANT_VIEW.md`](docs/DESK_QUANT_VIEW.md) |

---

## Core math

All value-bearing quantities are **non-negative integers in native token units** (`Amount` = `bigint`).  
No JavaScript `Number` for notionals, edges denominated in tokens, or markouts.

### Linear Dutch decay (UniswapX `DutchDecayLib` mirror)

For a decay window $[t_s, t_e]$ and amounts $A_s \rightarrow A_e$:

$$
A(t) =
\begin{cases}
A_s & t \le t_s \\
A_e & t \ge t_e \\
A_s + \dfrac{(A_e - A_s)\,(t - t_s)}{t_e - t_s} & t_s < t < t_e
\end{cases}
$$

Implemented with **integer division only** on `bigint` (`packages/strategy` → `dutch-decay.ts`).

Decay progress in basis points:

$$
\pi(t) = \mathrm{clamp}\!\left(\left\lfloor \frac{(t - t_s)\,10^{4}}{t_e - t_s} \right\rfloor,\, 0,\, 10^{4}\right)
$$

### Edge (computed, never assumed)

Given resolved output $O_{\mathrm{res}}$ (order obligation) and reference AMM output $O_{\mathrm{ref}}$ (QuoterV2) for the same input:

$$
e_{\mathrm{bps}} = \left\lfloor \frac{(O_{\mathrm{ref}} - O_{\mathrm{res}}) \cdot 10^{4}}{O_{\mathrm{ref}}} \right\rfloor
\quad (O_{\mathrm{ref}} > 0)
$$

If $O_{\mathrm{ref}} = 0$ or missing ⇒ **edge undefined** ⇒ **reject** (fail-closed).

### Markout (shadow / post-decision)

$$
m_{\mathrm{bps}} = \left\lfloor \frac{(P_{\mathrm{mark}} - P_{\mathrm{fill}}) \cdot 10^{4}}{P_{\mathrm{fill}}} \right\rfloor
$$

- **Win:** $m_{\mathrm{bps}} \ge 0$  
- **Loss:** $m_{\mathrm{bps}} < 0$  
- **Toxic (default):** $m_{\mathrm{bps}} \le -30$

Hit rate uses **labeled markouts only** — never accept count.

$$
h = \frac{\#\{m \ge 0\}}{\#\{m \text{ labeled}\}}
$$

---

## Architecture

```mermaid
flowchart LR
  API[UniswapX Orders API
  Base Dutch_V3] --> POLL[poll + parse]
  POLL --> CLS[classify]
  CLS -->|priority / exclusive / unknown| REJ[reject + journal]
  CLS -->|dutch| DEC[resolve decay]
  DEC --> EDGE[compute edge
  QuoterV2 eth_call]
  EDGE -->|undefined| REJ
  EDGE --> TOX[toxicity heuristic]
  TOX --> RISK[RiskEngine]
  RISK --> POL[FillPolicy
  accept | reject | wait]
  POL --> J[(DecisionJournal JSONL)]
  J --> SHADOW[shadow-markout]
  SHADOW --> J
  J --> DESK[Sentinel Desk]
```

### Packages

| Package | Responsibility |
|---------|----------------|
| [`@cavalre/core`](packages/core) | `Amount` primitive |
| [`@cavalre/risk-engine`](packages/risk-engine) | Position / daily loss / drawdown gates |
| [`@cavalre/journal`](packages/journal) | Append-only book + markout helpers |
| [`@cavalre/strategy`](packages/strategy) | Classify, decay, edge, toxicity, policy |
| [`@cavalre/uniswapx-base`](packages/uniswapx-base) | Poller, live wire parse, QuoterV2 |
| [`@cavalre/wallet`](packages/wallet) | Non-custodial LocalSigner + ERC-20 (Node only) |
| [`@cavalre/runner`](src/runner) | Compliant composition root |
| [`@cavalre/desk`](apps/desk) | Quant research UI |

### Compliant decision cycle

```
classify → resolve decay → compute edge → toxicity → risk(resolved size) → policy → feature journal
```

---

## Sentinel Desk

Local **read-only** research desk — not a Connect-Wallet dapp.

- Execution **circuit** with particle flow on activity  
- Funnel, timeline, edge histogram, class mix, reason bars  
- **Limits** (RiskEngine) · **Book quality** (accept rate, markout W/L) · **Wallet readiness**  
- Decision tape with full feature columns  

Keys never enter the browser. Optional `SENTINEL_ADDRESS` is **public display only**.

---

## Security & CI

**Workflow:** [Production Security & Quality Gate](.github/workflows/ci.yml)

| Stage | Gate |
|-------|------|
| 1 | TruffleHog verified secrets (full history) |
| 2 | `npm audit --audit-level=high` |
| 3 | Typecheck + full Vitest suite |

Dependencies pinned via `package-lock.json` when present; toolchain overrides for `esbuild` / `vite` — see [`docs/SECURITY_DEPS.md`](docs/SECURITY_DEPS.md).

---

## RULE OF TRUST

| Source | Role |
|--------|------|
| [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) | FloatLib, Ledger, accounting — [TRUST doc](docs/TRUST_CAVALRE_CONTRACTS.md) |
| [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) | Reactors, decay, Base deployments — [TRUST doc](docs/TRUST_UNISWAPX.md) |
| [DefiLlama](https://defillama.com/) | Volume / TVL claims only (not inside decision path) |
| [near/intents](https://github.com/near/intents) | Comparative intent patterns |
| This repository | Implementation under test |

---

## Live capital policy

**Default: NO-GO.**

Runner throws `live_mode_not_enabled` until every gate in [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) is satisfied with journal evidence (≥7 days dry-run, ≥100 shadow accepts, markout distribution, toxic fraction, worst-day bound).

Phase-1 live (only after Go): **$200** max equity, direct reactor execute, daily review, halt on model divergence.

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/SCOPE_REVIEW.md`](docs/SCOPE_REVIEW.md) | Original scope → completion status |
| [`docs/PRODUCTION.md`](docs/PRODUCTION.md) | Research-prod vs live-prod |
| [`docs/COMPLIANCE_REVIEW.md`](docs/COMPLIANCE_REVIEW.md) | JS/Cumberland MUST matrix |
| [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) | Live capital gates |
| [`docs/STRATEGY_DUTCH_LOW_CAPITAL.md`](docs/STRATEGY_DUTCH_LOW_CAPITAL.md) | Game theory + low-capital policy |
| [`docs/TRUST_UNISWAPX.md`](docs/TRUST_UNISWAPX.md) | UniswapX expert map |
| [`docs/TRUST_CAVALRE_CONTRACTS.md`](docs/TRUST_CAVALRE_CONTRACTS.md) | Float / Ledger primitives |
| [`docs/MAINNET_DRY_RUN.md`](docs/MAINNET_DRY_RUN.md) | Operator runbook |
| [`docs/SHADOW_MARKOUT.md`](docs/SHADOW_MARKOUT.md) | Markout labeling |
| [`docs/DESK.md`](docs/DESK.md) / [`DESK_QUANT_VIEW.md`](docs/DESK_QUANT_VIEW.md) | Desk design |
| [`docs/WALLET.md`](docs/WALLET.md) | Non-custodial wallet lifecycle |
| [`docs/PHASE_0.md`](docs/PHASE_0.md) | Phase 0 scope |
| [`docs/README.md`](docs/README.md) | Doc index |

---

## Roadmap

| Phase | Status |
|-------|--------|
| **0** — Dry-run foundation, Amount, risk, journal, strategy, mainnet poll, desk, CI | **Complete** |
| **0.5** — Sustained journals + shadow markouts + go/no-go evidence | **In progress** (ops) |
| **1** — Tiny live after written Go | Blocked on gates |
| **2** — Priority policy (separate), richer cost model | Not started |
| **3** — Ledger inventory sleeves / SLM toxicity | Not started |

Full checklist: [`docs/SCOPE_REVIEW.md`](docs/SCOPE_REVIEW.md).

---

## Related

- [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) — FloatLib + accounting source of truth  
- [UniswapX](https://github.com/Uniswap/UniswapX) — settlement protocol  
- [UniswapX filler docs](https://developers.uniswap.org/docs/liquidity/uniswapx/filling/overview) — order types by chain  
- [CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel) — prior research lineage  

---

<div align="center">

**NEVER TRUST, ALWAYS VERIFY.**

MIT © RedRobotKK

</div>
