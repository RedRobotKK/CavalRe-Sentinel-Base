# Compliance Review — Jane Street / Cumberland Bar

**Date:** 2026-07-20  
**Thesis:** Selective Dutch, low capital, inventory-light, toxicity-first, UniswapX + CavalRe TRUST.  
**Live capital:** Forbidden until go/no-go clears (see `GO_NO_GO.md`).

---

## MUST requirements

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Edge **computed**, not assumed | **PASS (v1)** | `packages/strategy/src/edge.ts` — `computeEdgeBps(resolvedIn, resolvedOut, refOut)` |
| 2 | Decay **before** risk and policy | **PASS** | `src/runner` resolves input/output via `decayInput`/`decayOutput` before `checkPositionSize` / `decideFill` |
| 3 | Dry-run **markout-ready feature rows** | **PASS** | Journal context includes feature fields (see schema below) |
| 4 | Priority on Base **classified** | **PASS** | `classifyOrder` → `dutch` \| `priority` \| `exclusive` \| `unknown`; Priority **ignored** (reject) until separate policy |
| 5 | Live only after **written go/no-go** | **PASS** | `docs/GO_NO_GO.md`; runner still throws `live_mode_not_enabled` |

---

## Code path (compliant cycle)

```
poll → parse
  → classify (priority/exclusive/dutch/unknown)
  → if not dutch-tradable: reject + features
  → resolve decay at now (Amount)
  → compute edge vs reference cost (injectable)
  → heuristic toxicity
  → RiskEngine on resolved input size
  → FillPolicy (accept|reject|wait)
  → journal full feature row
```

---

## Feature row schema (markout-ready)

Every decision journals `context` string fields (JSONL-safe):

| Field | Meaning |
|-------|---------|
| `dryRun` | always true until live |
| `stage` | classify \| edge \| risk \| policy |
| `orderClass` | dutch \| priority \| exclusive \| unknown |
| `orderType` | wire orderType |
| `inputToken` / `outputToken` | addresses |
| `decayProgressBps` | 0–10000 |
| `edgeBps` | computed vs reference |
| `toxicity` | 0–1 heuristic |
| `resolvedInput` / `resolvedOutput` | decimal strings (Amount) |
| `refOutput` | reference cost output (Amount string) |
| `policyAction` | accept \| reject \| wait |
| `exclusiveFiller` | if any |

Post-hoc markout job joins on `ref` = orderHash and appends `kind: markout`.

---

## Residual gaps (tracked, not blockers for dry-run)

| Gap | Severity | Plan |
|-----|----------|------|
| Reference cost is injectable stub (no live AMM quote yet) | Med | Wire Uniswap quoter; until then harness passes explicit ref |
| Priority orders ignored, not separately modeled | Med | Intentional; open only with written Priority policy |
| Simulated markout job not automated in harness | Med | Next: harness records mid snapshot for +30s/+2m join |
| FloatLib-grade rational edge (not only integer bps) | Low | Amount-safe bps sufficient for shadow; upgrade if calibration needs |

---

## TRUST cross-check

| Source | Compliance note |
|--------|-----------------|
| UniswapX DutchDecayLib | `decayInput`/`decayOutput` mirror start/end constraints and linear interpolation |
| UniswapX Base Priority reactor | Classified; not traded |
| cavalre-contracts Float/Ledger | Amount only; fail-closed risk; no Number for value |
| DefiLlama | Not used inside decision path (correct); ops only |

---

## Sign-off posture

Dry-run pipeline is **compliant** with the MUST list for research and shadow books.  
Live capital remains **non-compliant** until `GO_NO_GO.md` thresholds are met with evidence from journals.
