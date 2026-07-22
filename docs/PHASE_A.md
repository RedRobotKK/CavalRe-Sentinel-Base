# Phase A — Policy specification (complete)

> **Status:** Implemented in code (`@cavalre/strategy` → `phase-a-spec`) + this document.  
> **Live capital:** OFF  
> **TRUST:** [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) · [TRUST_CAVALRE_CONTRACTS.md](./TRUST_CAVALRE_CONTRACTS.md)

---

## One-line goal

Lock **FloatLib** and **Ledger** semantics as the off-chain policy contract so every later phase (virtual books → Float port → live Ledger → product) inherits the same vocabulary — without deploying chain capital yet.

---

## What Phase A is / is not

| Is | Is not |
|----|--------|
| Constants matching FloatLib (21 digits, 72-bit mantissa) | A TS reimplementation of Float arithmetic |
| Ledger error → policy reason map | On-chain `Ledger.transfer` |
| External root catalog (WETH/USDC on Base) | Dispatcher deployment |
| Phase ladder A→E encoded in tests | Permission to enable `live` mode |
| Documentation + TDD gates | IEEE `Number` as FloatLib |

---

## Architecture (Phase A in the firm stack)

```text
┌─────────────────────────────────────────────────────────────────┐
│  cavalre-contracts (SOURCE OF TRUTH)                            │
│  FloatLib.sol · Ledger · Dispatcher                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ semantic lock
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase A — phase-a-spec.ts                                      │
│  digits · mantissa · error map · money rules · phase ladder     │
└────────────────────────────┬────────────────────────────────────┘
                             │ informs
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Sentinel today                                                 │
│  Amount(bigint) · classify · evaluateDutchAuction · RiskEngine  │
│  Journal JSONL · Desk UI · dry-run VIEW                         │
└─────────────────────────────────────────────────────────────────┘
```

**Principle:** UniswapX decides the auction; Phase A decides the **firm rules** those auctions must obey before we ever touch live capital.

---

## FloatLib lock (must match chain)

| Constant | Value | Source |
|----------|-------|--------|
| `SIGNIFICANT_DIGITS` | `21` | FloatLib.sol |
| `MANTISSA_BITS` | `72` | FloatLib.sol |
| Normalized mantissa | `[10^20, 10^21 - 1]` | FloatLib.sol |

**Money rule:** production path remains `Amount = bigint`. Thresholds (`minEdgeBps`, toxicity) may use JS `number`. **IEEE is not FloatLib.**

Root of trust URL (encoded in tests):

`https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol`

---

## Ledger → policy vocabulary

On-chain Ledger fails closed (`InsufficientBalance`, `UndercollateralizedToken`, …).  
Phase A maps those names to **stable policy reasons** so Phase B virtual books and Phase D live fills speak the same language:

| ILedger-style error | Policy reason |
|---------------------|---------------|
| `InsufficientBalance` | `exceeds_current_equity` |
| `InsufficientAllowance` | `risk_blocked` |
| `UndercollateralizedToken` | `undercollateralized` |
| `Unauthorized` | `unauthorized` |
| … | see `LEDGER_ERROR_TO_POLICY_REASON` |

---

## External roots (Base catalog)

Phase A names the External assets research already touches:

| Symbol | Address |
|--------|---------|
| WETH | `0x4200…0006` |
| USDC | `0x8335…2913` |

Future Internal/Claim roots appear in Phase E — not A.

---

## Phase ladder (A → E)

```text
A Policy spec     ──►  B Virtual books  ──►  C FloatLib port
                              │
                              ▼
                       D Live capital  ──►  E Product
```

| ID | Name | Posture | Live capital | Deliverable |
|----|------|---------|--------------|-------------|
| **A** | Policy spec | off-chain | no | This phase |
| **B** | Virtual books | off-chain | no | Journal → ledger-shaped accounts |
| **C** | FloatLib port | off-chain | no | TS Float verified vs forge |
| **D** | Live capital | on-chain | **yes** (after Go/No-Go) | Dispatcher + Ledger + filler module |
| **E** | Product | hybrid | yes | Claim/internal PnL sleeves |

Only **D** and **E** set `liveCapital: true` in code. Runner still throws `live_mode_not_enabled` until [GO_NO_GO.md](./GO_NO_GO.md).

---

## TDD surface

```bash
npm run test:strategy
# includes test/phase-a-spec.test.ts
```

Invariants enforced in tests:

1. FloatLib digit/mantissa constants  
2. Mantissa band ordering  
3. Ledger error map non-empty  
4. IEEE forbidden for value  
5. FloatLib URL present  
6. Phases A–E ordered; A–C `liveCapital === false`  
7. `assertPhaseAInvariants()` does not throw  

---

## Desk / screenshots (operator)

Phase A is **spec**, not a new UI panel. For README and stars, capture:

1. **Desk circuit** — http://127.0.0.1:5173 with dry-run feeding journals  
2. **Drop reasons ranked list** — exclusive vs edge share  
3. **Intent log** — human reasons  
4. **Terminal** — `npm run dry-run` heartbeat JSON  

Save under `docs/assets/` as:

- `desk-circuit.png`  
- `desk-drops.png`  
- `desk-intent-log.png`  
- `dry-run-terminal.png`  

Then link from the root README Screenshots section.

---

## Exit criteria (Phase A done)

- [x] `phase-a-spec.ts` + tests on `main`  
- [x] This document  
- [x] README roadmap lists A–E  
- [x] TRUST docs point at FloatLib + Ledger  
- [ ] Optional: operator screenshots committed under `docs/assets/`  

**Next:** Phase B — virtual books (journal accepts → ledger-shaped position model).  
