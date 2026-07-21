# Compliance Review — Jane Street / Cumberland Bar

**Date:** 2026-07-21 (updated)  
**Thesis:** Selective Dutch, low capital, inventory-light, toxicity-first, UniswapX + CavalRe TRUST.  
**Live capital:** Forbidden until go/no-go clears (see [`GO_NO_GO.md`](GO_NO_GO.md)).

---

## MUST requirements

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Edge **computed**, not assumed | **PASS** | `packages/strategy/src/edge.ts` + `uniswapx-base` QuoterV2 |
| 2 | Decay **before** risk and policy | **PASS** | `src/runner` resolve → edge → risk → policy |
| 3 | Dry-run **markout-ready feature rows** | **PASS** | Journal context schema below |
| 4 | Priority on Base **classified** | **PASS** | `classifyOrder`; Priority **reject** until separate policy |
| 5 | Live only after **written go/no-go** | **PASS** | `GO_NO_GO.md`; `live_mode_not_enabled` |

---

## Code path (compliant cycle)

```
poll → parse
  → classify (priority/exclusive/dutch/unknown)
  → if not dutch-tradable: reject + features
  → resolve decay at now (Amount)
  → compute edge vs QuoterV2 reference cost
  → heuristic toxicity
  → RiskEngine on resolved input size
  → FillPolicy (accept|reject|wait)
  → journal full feature row
  → (ops) shadow-markout appends kind=markout
```

---

## Feature row schema (markout-ready)

| Field | Meaning |
|-------|---------|
| `dryRun` | true until live |
| `stage` | classify \| resolve \| edge \| policy \| poll \| shadow_markout |
| `orderClass` | dutch \| priority \| exclusive \| unknown |
| `orderType` | wire type |
| `inputToken` / `outputToken` | addresses |
| `decayProgressBps` | 0–10000 |
| `edgeBps` | vs reference |
| `toxicity` | 0–1 heuristic |
| `resolvedInput` / `resolvedOutput` | Amount decimal strings |
| `refOutput` | Quoter output string |
| `policyAction` | accept \| reject \| wait |
| `exclusiveFiller` | if any |

---

## Residual gaps

| Gap | Severity | Plan |
|-----|----------|------|
| Priority not traded | Med | Intentional until written Priority policy |
| Markout sample size | Ops | Multi-day dry-run + shadow-markout |
| Gas in markout USDC-eq | Low | Document assumption in go/no-go report |
| SLM toxicity | Low | Phase 3; heuristic sufficient for shadow |

---

## TRUST cross-check

| Source | Note |
|--------|------|
| UniswapX DutchDecayLib | Integer linear decay mirror |
| UniswapX Base Priority | Classified; not traded |
| cavalre-contracts Float/Ledger | Amount only; fail-closed risk |
| DefiLlama | Outside decision path |

---

## Sign-off posture

Dry-run pipeline is **compliant** with the MUST list for research and shadow books.  
Live capital remains **non-compliant** until `GO_NO_GO.md` thresholds are met with journal evidence.
