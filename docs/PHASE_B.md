# Phase B — Virtual books (off-chain Ledger mirror)

> **Status:** Implemented (`VirtualBooks` in `@cavalre/strategy`)  
> **Live capital:** OFF  
> **Depends on:** [Phase A](./PHASE_A.md)  
> **TRUST:** [cavalre-contracts Ledger](https://github.com/CavalRe/cavalre-contracts/tree/main/modules/ledger)

---

## Goal

Post research **accepts** into **ledger-shaped** accounts (External root × strategy sleeve) so inventory and fail-closed debit rules exist **before** Phase D deploys on-chain Ledger.

---

## Model

```text
External root (WETH / USDC / …)
    └── sleeve: uniswapx-filler | hedge | …
            balance: Amount (bigint)
```

| Operation | Ledger spirit |
|-----------|----------------|
| `credit` | Receive inventory |
| `debit` | Pay inventory — **InsufficientBalance** if short |
| `postAccept` | Dutch fill: debit **output**, credit **input** |
| `seed` | Research starting inventory |

Errors use Phase A map: `InsufficientBalance` → `exceeds_current_equity`.

---

## Dutch fill posting

Filler **pays** `outputToken`, **receives** `inputToken`:

```text
postAccept({
  inputRoot, outputRoot,
  inputAmount, outputAmount,  // resolved Amounts
  ref: orderHash
})
→ debit(output) then credit(input)
```

If output sleeve cannot cover obligation → throw (same class of refusal as RiskEngine equity gate).

---

## What this does not do

- No chain txs, no Dispatcher, no real ERC-20 moves  
- Does not auto-wire dry-run yet (call from runner/sim when ready)  
- Not FloatLib arithmetic  

---

## TDD

```bash
npm run test:strategy
# virtual-books.test.ts
```

---

## Next

- Optional: dry-run / simulate call `postAccept` on `quote_accepted`  
- **Phase C** — FloatLib TS port for edge/markout ratios  
