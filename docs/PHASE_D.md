# Phase D — Live capital (scaffold + hard gate)

> **Status:** Scaffold in code · **Live execution: BLOCKED** by default  
> **Authority:** [GO_NO_GO.md](./GO_NO_GO.md)  
> **TRUST:** [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) · [UniswapX](https://github.com/Uniswap/UniswapX)

---

## What Phase D is

| Delivered now | Not delivered |
|---------------|---------------|
| Go/No-Go evidence type + `assertModeAllowed` | Private keys / signing |
| Phase-1 limits ($200, reactor-only) | Deployed Dispatcher/Ledger on Base |
| Settlement flow checklist | `Reactor.execute` broadcast |
| TDD that live stays off by default | Automatic unlock |

**Default remains NO-GO.** Runner continues to throw `live_mode_not_enabled` for `mode: "live"` until evidence is complete **and** human sign-off exists.

---

## Target architecture (after Go)

```text
Off-chain                          On-chain (Base)
─────────                          ───────────────
poll → classify → evaluateDutchAuction
         │
         ▼ accept?
   VirtualBooks check
   RiskEngine allow
         │
         ▼
   assertModeAllowed("live", evidence)
         │
         ▼
                    Dispatcher
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
            Ledger   FillerMod  (Sentry)
              │         │
              │         └──► UniswapX Reactor.execute
              └── debit out / credit in (External roots)
```

Components from **cavalre-contracts**: Dispatcher, Ledger, optional Sentry ownership.  
Fill path: **direct reactor execute** only in phase-1 live (no complex callback executor required).

---

## Unlock checklist (all required)

See [GO_NO_GO.md](./GO_NO_GO.md). Encoded as `GoNoGoEvidence`:

- dry-run ≥ 7 days with feature rows  
- ≥ 100 shadow accepts  
- mean / median markout gates  
- toxic fraction ≤ 25%  
- worst-day PnL bound  
- no key leakage  
- priority policy OK  
- **humanSignOff**  

```ts
import { assertModeAllowed, DEFAULT_GO_NO_GO } from "@cavalre/strategy";
assertModeAllowed("live", DEFAULT_GO_NO_GO); // throws
```

---

## Phase-1 live limits (after Go)

| Limit | Value |
|-------|--------|
| Max equity | **$200** |
| Execute | Reactor.execute only |
| Review | Daily mandatory |
| Halt | On model divergence |

---

## TDD

```bash
npm run test:strategy
# phase-d-live.test.ts
```

---

## Explicit non-goals this commit

- No forge deploy scripts in this repo (yet)  
- No mainnet addresses claimed without verify  
- No softening of `live_mode_not_enabled` in the runner without evidence  

**Next:** keep dry-run + shadow markout until gates are green; then Phase D deploy playbook under human sign-off. Phase **E** = product sleeves on the live Ledger.  
