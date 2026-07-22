# Phase B — Virtual books (off-chain Ledger mirror)

> **Status:** Implemented (`VirtualBooks` in `@cavalre/strategy`) + **wired into runner / dry-run / simulate**  
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

On the **research path** the runner still journals `quote_accepted` and records `context.virtualBooks` (`posted` | policy reason).

---

## Wiring (done)

| Surface | Behavior |
|---------|----------|
| `runCycle` | Optional `deps.virtualBooks`; postAccept on accept |
| `npm run simulate` | Seeds WETH/USDC, passes books |
| `npm run dry-run` | Seeds research inventory, snapshots books on heartbeat |
| Runner tests | postAccept balance asserts + short inventory note |

---

## What this does not do

- No chain txs, no Dispatcher, no real ERC-20 moves  
- Not FloatLib arithmetic  
- Does not unlock live capital  

---

## TDD

```bash
npm run test -w @cavalre/runner
# Phase B VirtualBooks cases in runner.test.ts
npm run test:strategy
# virtual-books.test.ts
```

---

## Next

- **Phase C** — FloatLib TS port for edge/markout ratios (shipped; optional flag)  
- **Phase D** — `assertModeAllowed` gate already in runner; live still NO-GO until evidence  
