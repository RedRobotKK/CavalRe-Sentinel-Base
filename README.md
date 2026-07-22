<div align="center">

# CavalRe Sentinel — Base

**Capital-safety-first UniswapX research filler on Base**

Selective Dutch · Amount-safe math · Fail-closed risk · Journal-first desk · Live capital off until go/no-go

[![CI](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml/badge.svg)](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chain](https://img.shields.io/badge/chain-Base%208453-0052FF)](https://base.org)
[![Posture](https://img.shields.io/badge/live%20capital-OFF-red)](docs/GO_NO_GO.md)
[![Phase A](https://img.shields.io/badge/Phase%20A-done-goldenrod)](docs/PHASE_A.md)
[![Phase B](https://img.shields.io/badge/Phase%20B-done-goldenrod)](docs/PHASE_B.md)
[![Phase C](https://img.shields.io/badge/Phase%20C-FloatLib-goldenrod)](docs/PHASE_C.md)

[Quick start](#quick-start) · [Phases](#integration-phases-a--e) · [Docs](#documentation)

</div>

---

## Why this exists

Most UniswapX filler demos optimize for **speed and volume**.  
This stack optimizes for **survival of small capital** — with [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) as math/ledger **source of truth**.

> **NEVER TRUST, ALWAYS VERIFY.**

---

## Integration phases (A → E)

```text
A Policy spec ──► B Virtual books ──► C FloatLib port
                         │
                         ▼
                  D Live capital ──► E Product
```

| Phase | Name | Status | Live capital |
|-------|------|--------|--------------|
| **A** | Policy spec | **Done** | No — [PHASE_A.md](docs/PHASE_A.md) |
| **B** | Virtual books | **Done** | No — [PHASE_B.md](docs/PHASE_B.md) |
| **C** | FloatLib port | **Done** | No — [PHASE_C.md](docs/PHASE_C.md) |
| **D** | Live capital | Gated | **Yes*** |
| **E** | Product | Planned | Yes* |

\*After [GO_NO_GO.md](docs/GO_NO_GO.md).

---

## Quick start

```bash
git clone git@github.com:RedRobotKK/CavalRe-Sentinel-Base.git
cd CavalRe-Sentinel-Base
npm install
npm run test:strategy
npm run dry-run
```

Desk: `npm run desk:api` + `npm run desk:web` → http://127.0.0.1:5173

---

## RULE OF TRUST

| Source | Role |
|--------|------|
| [FloatLib.sol](https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol) | Fixed-point root of truth |
| [Ledger](https://github.com/CavalRe/cavalre-contracts/tree/main/modules/ledger) | Accounting root of truth |
| [UniswapX](https://github.com/Uniswap/UniswapX) | Reactors / Dutch decay |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [PHASE_A.md](docs/PHASE_A.md) | Policy spec |
| [PHASE_B.md](docs/PHASE_B.md) | Virtual books |
| [**PHASE_C.md**](docs/PHASE_C.md) | **FloatLib TS subset** |
| [TRUST_CAVALRE_CONTRACTS.md](docs/TRUST_CAVALRE_CONTRACTS.md) | Full primitives |
| [GO_NO_GO.md](docs/GO_NO_GO.md) | Live gates |

---

<div align="center">

**NEVER TRUST, ALWAYS VERIFY.**

MIT © RedRobotKK

</div>
