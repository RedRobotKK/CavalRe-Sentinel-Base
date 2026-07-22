# Phase C — FloatLib TypeScript port (subset)

> **Status:** Implemented (`packages/strategy/src/floatlib.ts`)  
> **Live capital:** OFF  
> **TRUST:** [FloatLib.sol](https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol)

---

## Goal

Provide **21-significant-digit** fixed-point ops in TS so edge/markout **ratios** can follow CavalRe FloatLib semantics — without IEEE `Number` and without claiming a full Solady/exp port.

---

## Shipped surface

| Function | Role |
|----------|------|
| `normalize` / `from` | 21-digit mantissa band |
| `toFloat` / `toUInt` | Amount ↔ Float at decimals |
| `plus` / `minus` / `times` / `divide` | Core arithmetic |
| `align` / `shift` | Add/sub support |
| `edgeBpsFloat` | `(ref-res)/ref*10000` via Float path |
| `isEQ` / `isGT` / `isZero` | Compare |

**Not ported yet:** `exp`, `log`, `pow`, `sqrt`, `fullMulDiv`, packed `int256` wire format.

---

## Production policy

| Path | Use |
|------|-----|
| Settlement amounts | Still **`Amount` bigint** |
| Policy thresholds | Integer bps from `computeEdgeBps` **or** `edgeBpsFloat` |
| IEEE `float-compare.ts` | Research only |

Phase C is **available**; dry-run still uses `computeEdgeBps` unless explicitly switched.

---

## TDD

```bash
npm run test:strategy
# floatlib.test.ts — roundtrip, arithmetic, edge vs bigint
```

---

## Next

- Optional: runner uses `edgeBpsFloat` behind a flag  
- **Phase D** — on-chain Dispatcher + Ledger (after Go/No-Go)  
