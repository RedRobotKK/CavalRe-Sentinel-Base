<div align="center">

# CavalRe Sentinel — Base

**Capital-safety-first UniswapX research filler on Base**

Selective Dutch · Amount-safe math · Fail-closed risk · Journal-first desk · Live capital off until go/no-go

[![CI](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml/badge.svg)](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chain](https://img.shields.io/badge/chain-Base%208453-0052FF)](https://base.org)
[![Posture](https://img.shields.io/badge/live%20capital-OFF-red)](docs/GO_NO_GO.md)
[![Phase A](https://img.shields.io/badge/Phase%20A-policy%20spec-goldenrod)](docs/PHASE_A.md)

[Quick start](#quick-start) · [Phases](#integration-phases-a--e) · [Math](#core-math) · [Architecture](#architecture) · [Desk](#sentinel-desk) · [Screenshots](#screenshots) · [Docs](#documentation)

</div>

---

## Why this exists

Most UniswapX filler demos optimize for **speed and volume**.  
This stack optimizes for **survival of small capital**:

- Every money value is an **Amount** (`bigint`) — [FloatLib](https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol) discipline off-chain  
- **Edge is computed** against Uniswap v3 QuoterV2 — never assumed  
- **Dutch decay is resolved before** risk and policy  
- **Post-exclusive** Dutch can trade after `decayStartTime` (exclusivity proxy)  
- The **journal is the book**; the desk only visualizes what was written  
- **Live mode is hard-disabled** until [`docs/GO_NO_GO.md`](docs/GO_NO_GO.md) clears  

> **Capital safety > daily PnL.**  
> **Journal quality > volume.**  
> **Accept rate ≠ win rate.**  
> **NEVER TRUST, ALWAYS VERIFY.**

---

## Integration phases (A → E)

Built on [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) as **source of truth** for Float + Ledger.

```text
A Policy spec ──► B Virtual books ──► C FloatLib port
                         │
                         ▼
                  D Live capital ──► E Product
```

| Phase | Name | Status | Live capital | What ships |
|-------|------|--------|--------------|------------|
| **A** | Policy spec | **Done** | No | FloatLib constants, Ledger→policy map, phase ladder in code + [PHASE_A.md](docs/PHASE_A.md) |
| **B** | Virtual books | Next | No | Journal accepts → ledger-shaped accounts (off-chain mirror) |
| **C** | FloatLib port | Planned | No | TS Float ops verified against forge tests |
| **D** | Live capital | Gated | **Yes*** | Dispatcher + Ledger on Base; filler module on accept |
| **E** | Product | Planned | Yes* | Claim/internal PnL sleeves |

\*Only after [GO_NO_GO.md](docs/GO_NO_GO.md). Runner throws `live_mode_not_enabled` until then.

Encoded in `@cavalre/strategy` as `INTEGRATION_PHASES` — tests fail if the ladder drifts.

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
export BASE_RPC_URL=https://mainnet.base.org
npm run dry-run
```

### Sentinel Desk

```bash
npm run desk:api    # :8787
npm run desk:web    # :5173
```

### Research helpers

```bash
npm run flow-report
npm run shadow-markout
npm run float-compare   # IEEE vs bigint research only — not FloatLib
```

---

## Screenshots

Operator captures (commit under `docs/assets/` when available):

| Asset | Capture |
|-------|---------|
| `docs/assets/desk-circuit.png` | Hero circuit / pipeline at http://127.0.0.1:5173 |
| `docs/assets/desk-drops.png` | Drop-reasons ranked list |
| `docs/assets/desk-intent-log.png` | Human-readable intent log |
| `docs/assets/dry-run-terminal.png` | `npm run dry-run` heartbeats |

```bash
# with stack running:
# open http://127.0.0.1:5173 → screenshot → save as above
mkdir -p docs/assets
```

Until assets are committed, the desk and terminal are the live “screenshots.”

---

## Core math

All value-bearing quantities are **non-negative integers** (`Amount` = `bigint`).  
No JavaScript `Number` for notionals.

### Linear Dutch decay

$$
A(t) =
\begin{cases}
A_s & t \le t_s \\
A_e & t \ge t_e \\
A_s + \dfrac{(A_e - A_s)\,(t - t_s)}{t_e - t_s} & t_s < t < t_e
\end{cases}
$$

### Edge (computed, never assumed)

$$
e_{\mathrm{bps}} = \left\lfloor \frac{(O_{\mathrm{ref}} - O_{\mathrm{res}}) \cdot 10^{4}}{O_{\mathrm{ref}}} \right\rfloor
$$

$O_{\mathrm{ref}} = 0$ ⇒ **reject** (fail-closed).

FloatLib (21 significant digits) is the **root of trust** for future ratio ports — see [PHASE_A.md](docs/PHASE_A.md).

---

## Architecture

```mermaid
flowchart LR
  API[UniswapX Orders API] --> POLL[poll + parse]
  POLL --> CLS[classify + exclusivity proxy]
  CLS -->|exclusive / priority / unknown| REJ[reject + journal]
  CLS -->|dutch| AUC[evaluateDutchAuction]
  AUC --> Q[QuoterV2 ref]
  Q --> POL[accept / wait / reject]
  POL --> J[(DecisionJournal)]
  J --> DESK[Sentinel Desk]
  J --> SHADOW[shadow-markout]
```

### Compliant cycle

```text
classify(now) → quote ref → evaluateDutchAuction → journal
```

---

## RULE OF TRUST

| Source | Role |
|--------|------|
| [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) | FloatLib, Ledger — [TRUST_CAVALRE_CONTRACTS](docs/TRUST_CAVALRE_CONTRACTS.md) · [TRUST](docs/TRUST.md) |
| [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) | Reactors, decay — [TRUST_UNISWAPX](docs/TRUST_UNISWAPX.md) |
| This repository | Implementation under test |

**NEVER TRUST, ALWAYS VERIFY.**

---

## Documentation

| Doc | Contents |
|-----|----------|
| [**PHASE_A.md**](docs/PHASE_A.md) | **Phase A policy spec (this milestone)** |
| [TRUST_CAVALRE_CONTRACTS.md](docs/TRUST_CAVALRE_CONTRACTS.md) | Float / Ledger primitives |
| [GO_NO_GO.md](docs/GO_NO_GO.md) | Live capital gates |
| [STRATEGY_DUTCH_LOW_CAPITAL.md](docs/STRATEGY_DUTCH_LOW_CAPITAL.md) | Low-capital Dutch policy |
| [DESK.md](docs/DESK.md) | Desk design |
| [MAINNET_DRY_RUN.md](docs/MAINNET_DRY_RUN.md) | Operator runbook |
| [docs/README.md](docs/README.md) | Full index |

---

## Related

- [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) — FloatLib + accounting source of truth  
- [UniswapX](https://github.com/Uniswap/UniswapX) — settlement protocol  

---

<div align="center">

**NEVER TRUST, ALWAYS VERIFY.**

MIT © RedRobotKK

</div>
