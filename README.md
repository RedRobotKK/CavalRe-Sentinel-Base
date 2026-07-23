<div align="center">

# CavalRe Sentinel — Base

### Capital-safety-first UniswapX Dutch_V3 research filler

Measure residual flow. Journal every decision. Never unlock capital without evidence.

[![CI](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml/badge.svg)](https://github.com/RedRobotKK/CavalRe-Sentinel-Base/actions/workflows/ci.yml)
[![Live capital](https://img.shields.io/badge/live%20capital-OFF-critical)](docs/SECURITY_QUALITY.md)
[![Posture](https://img.shields.io/badge/posture-VIEW%20%2F%20NO_GO-orange)](docs/GO_NO_GO.md)
[![Phase 0](https://img.shields.io/badge/Phase%200-measuring-blue)](docs/RESEARCH.md)
[![Soft prior](https://img.shields.io/badge/soft%20prior-disabled-lightgrey)](docs/SECURITY_QUALITY.md)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## Why this exists

Most small fillers either:

1. Race professionals on toxic flow and bleed, or  
2. Never measure whether residual Dutch flow is viable at all.

**Sentinel** is built the other way around:

- **Capital safety first** — live mode is gated until Go/No-Go evidence is real  
- **Measure before building** — Phase 0 quantifies residual density, survival, exclusivity  
- **Journal every decision** — accepts, rejects, waits, markouts, errors  
- **Fail closed** — soft models default to `no_opinion`; hard edge/risk gates stay authoritative  
- **NEVER TRUST, ALWAYS VERIFY** — against [UniswapX](https://github.com/Uniswap/UniswapX) and [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts)

This is a **research system** that can become a low-capital residual filler — not a demo that pretends to be production.

**Target use case:** deposit on the order of **1 ETH**, and let Sentinel run residual selection autonomously — *only after* research outcomes say the residual market exists and markouts support it. See [RESEARCH_OUTCOMES.md](docs/RESEARCH_OUTCOMES.md).

---

## Current posture

| Control | State |
|---------|--------|
| Live capital | **OFF** |
| Write / broadcast | **OFF** |
| Desk mode | **VIEW** |
| Go / No-Go | **NO_GO** (default) |
| Soft toxicity prior | **Disabled** |
| Phase 0 | **Measuring** residual Dutch_V3 on Base |
| Research outcome | **INCONCLUSIVE** until Phase 0 closes |

Production trading is **not approved**. See [Security & Quality](docs/SECURITY_QUALITY.md).

---

## Architecture (research stack)

```text
┌─────────────────────────────────────────────────────────────┐
│  Phase 0  — open Dutch_V3 residual observation (Base)       │
│  journals/phase0/*.jsonl  →  market note  →  CSV            │
└────────────────────────────┬────────────────────────────────┘
                             │ density / survival evidence
┌────────────────────────────▼────────────────────────────────┐
│  Decision path  — parse → edge → policy → risk → journal    │
│  dry-run / simulate  (no broadcast)                         │
└────────────────────────────┬────────────────────────────────┘
                             │ accepts + markouts
┌────────────────────────────▼────────────────────────────────┐
│  ML flywheel  — features v1 → walk-forward → soft prior     │
│  default: disabled · sim labels never unlock live capital   │
└────────────────────────────┬────────────────────────────────┘
                             │ only after real residual gates
┌────────────────────────────▼────────────────────────────────┐
│  Phase D  — limited live capital (scaffold, gated)          │
│  scale toward ~1 ETH autonomy only after stable markouts    │
└─────────────────────────────────────────────────────────────┘
```

**Packages:** `@cavalre/core` · `@cavalre/strategy` · `@cavalre/risk-engine` · `@cavalre/journal` · `@cavalre/runner` · `@cavalre/uniswapx-base` · desk UI

---

## Quick start

```bash
git clone https://github.com/RedRobotKK/CavalRe-Sentinel-Base.git
cd CavalRe-Sentinel-Base
npm install

npm run test:strategy
npm run quality
npm run phase0
```

Second terminal:

```bash
npm run ops:status
npm run phase0:note
npm run phase0:csv
```

### Simulation & ML (advisory only)

```bash
npm run simulate
npm run ml:sim-markout
npm run ml:loop -- --no-simulate
npm run ml:test
npm run ml:ingest-all
```

> Soft prior stays **disabled** until real residual walk-forward AUC ≥ 0.65 and calibration pass. Sim labels do **not** count.

---

## Integration phases

| Phase | Focus | Live capital |
|-------|--------|--------------|
| **A** | Policy spec (edge, toxicity, notional floors) | No |
| **B** | Virtual books / inventory sleeves | No |
| **C** | FloatLib TS parity | No |
| **0** | Market reality — residual density & survival | No |
| **D** | Limited live capital scaffold | **Gated** — [GO_NO_GO](docs/GO_NO_GO.md) |
| **E** | Product surface | After D stability |

Phase D encodes evidence requirements, tight notional limits, and settlement plans. **Default remains NO-GO. No broadcast.** First live size is ≪ 1 ETH; scale only on real markouts.

---

## Command reference

| Command | Purpose |
|---------|---------|
| `npm run phase0` | Live residual poller (Base Dutch_V3) |
| `npm run phase0:note` | One-page market reality note |
| `npm run phase0:csv` | Export residual sightings / survival |
| `npm run ops:status` | System posture snapshot |
| `npm run quality` | Tests + capital gates + audit |
| `npm run dry-run` | Real poll path, no capital |
| `npm run simulate` | Synthetic flow through real policy |
| `npm run shadow-markout` | Age-gated RPC markouts on accepts |
| `npm run ml:*` | Feature / train / ingest flywheel |
| `npm run go-no-go` | Capital unlock evidence report |
| `npm run desk` | Local research desk UI |

---

## Data layout

```text
journals/
├── phase0/          # live residual JSONL + market notes + CSV
├── sim-*.jsonl      # simulate-flow + offline markouts
├── dry-run-*.jsonl  # dry-run harness
└── ml/              # synthetic sets, coverage, walk-forward reports
```

Full map: **[docs/DATA_MAP.md](docs/DATA_MAP.md)**

---

## Capital gates (non-negotiable)

Live capital requires **all** of:

1. Phase 0 note verdict ≠ `INSUFFICIENT_RUNTIME`  
2. Residual density assessed (`TOO_SPARSE` / `LOW_DENSITY` / `MEASURABLE`)  
3. Real markouts on policy accepts (not sim-only labels)  
4. Walk-forward AUC ≥ 0.65 on **real** residual + calibration  
5. Explicit human review of Go/No-Go report  

Until then: **VIEW · WRITE OFF · NO_GO · soft prior disabled.**

---

## Documentation

| Document | Contents |
|----------|----------|
| [RESEARCH_OUTCOMES.md](docs/RESEARCH_OUTCOMES.md) | **Terminal outcomes A/B/C/D, failure modes, 1 ETH path** |
| [RESEARCH.md](docs/RESEARCH.md) | Daily research playbook |
| [DATA_MAP.md](docs/DATA_MAP.md) | Journals, producers, ingest path |
| [SECURITY_QUALITY.md](docs/SECURITY_QUALITY.md) | Threat model, quality gates, readiness |
| [GO_NO_GO.md](docs/GO_NO_GO.md) | Capital unlock criteria |
| [PHASE_A.md](docs/PHASE_A.md) · [B](docs/PHASE_B.md) · [C](docs/PHASE_C.md) · [D](docs/PHASE_D.md) | Integration phases |
| [DUTCH_V3_DECAY.md](docs/DUTCH_V3_DECAY.md) | Block-based decay semantics |

---

## Design principles

1. **Capital safety first** — ceremony never exceeds useful research data  
2. **Measure before building** — features and models justified by journals  
3. **Fail closed** — missing data, undefined edge, or disabled prior → no action  
4. **Verify upstream** — UniswapX + CavalRe contracts are source of truth  
5. **Honest metrics** — NO_SIGNAL and NO_GO_SPARSE are valid successful research results  

---

## Contributing / research hygiene

```bash
npm run quality
npm run test:strategy
npm run ml:test
```

Do not open PRs that:

- enable live capital or WRITE without Go/No-Go evidence  
- set soft-prior `enabled: true` on sim-only labels  
- expand feature schema before N ≥ 300 **real** labeled residual accepts  

---

## License

MIT © [RedRobotKK](https://github.com/RedRobotKK)

---

<div align="center">

**Measure. Journal. Verify. Then — and only then — trade.**

</div>
