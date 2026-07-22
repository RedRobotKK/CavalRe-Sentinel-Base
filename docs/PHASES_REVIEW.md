# Phases A–E review + wallet lifecycle

**Date:** 2026-07-22  
**TRUST:** [cavalre-contracts](https://github.com/CavalRe/cavalre-contracts) · [UniswapX](https://github.com/Uniswap/UniswapX) · this repo

---

## Phase scorecard

| Phase | Intent | Code | Tests | Live capital | Wallet role |
|-------|--------|------|-------|--------------|-------------|
| **A** Policy spec | FloatLib + Ledger vocabulary locked | `phase-a-spec.ts` | ✓ | No | Optional display address |
| **B** Virtual books | Off-chain root×sleeve inventory | `virtual-books.ts` | ✓ | No | Optional; books ≠ keys |
| **C** FloatLib TS | 21-digit ratio math subset | `floatlib.ts` | ✓ | No | None required |
| **D** Live scaffold | Go/No-Go gate + plan | `phase-d-live.ts` | ✓ | **Gated** | **Signer required for live** |
| **E** Product | Claim/internal sleeves | Spec only | — | After D | Signer + Ledger product |

**Dry-run / Desk today operate at A–C capability with D gate in place.** Runner `mode: live` remains blocked.

---

## Application logic vs CavalRe contracts

```text
┌─────────────────────────────────────────────────────────────┐
│ USER LIFECYCLE                                              │
│  none → view (address) → ready (Signer in memory) → live    │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│ SENTINEL APP                                                │
│  poll → classify → evaluateDutchAuction → journal           │
│  VirtualBooks (B) · FloatLib TS (C) · assertModeAllowed (D) │
└───────────────┬─────────────────────────────────────────────┘
                │ live only
┌───────────────▼─────────────────────────────────────────────┐
│ WALLET (@cavalre/wallet)                                    │
│  Signer.signDigest · ERC-20 encode · never log keys         │
└───────────────┬─────────────────────────────────────────────┘
                │ signed tx
┌───────────────▼─────────────────────────────────────────────┐
│ CHAIN (Phase D+)                                            │
│  UniswapX Reactor.execute                                   │
│  CavalRe Dispatcher → Ledger debit/credit External roots    │
└─────────────────────────────────────────────────────────────┘
```

| Concern | App / strategy | Wallet | cavalre-contracts |
|---------|----------------|--------|-------------------|
| Edge / decay | bigint + FloatLib TS | — | FloatLib.sol truth |
| Inventory research | VirtualBooks | — | Ledger semantics |
| Inventory live | RiskEngine + gate | signs settle tx | Ledger.transfer |
| Identity | address in journal | Signer holds key | Sentry ownership on modules |
| Desk | read-only | display address only | — |

---

## Wallet use-cases (tested)

| ID | Posture | Phase | Signer | Go/No-Go | Can sign live fill? |
|----|---------|-------|--------|----------|---------------------|
| UC1 Anonymous research | `none` | A–C | No | — | No |
| UC2 Desk display | `view` | A–C | No | — | No |
| UC3 Ready research | `ready` | A–C | Yes | ignored | No |
| UC4 Phase D, no Go | `ready` | D | Yes | false | No |
| UC5 Phase D unlocked | `live` | D | Yes | **true** | **Yes** |
| UC6 Product sleeve | `live` | E | Yes | true | Yes |

Implementation: `packages/wallet/src/lifecycle.ts` + `test/lifecycle.test.ts`.

### Security invariants

1. **Keys never in journal** — only `walletPublicContext` (address, posture, phase).  
2. **LocalSigner** is for tests / throwaway only; production injects hardware/MPC `Signer`.  
3. **`assertCanSign`** requires posture `live` (Go + Signer).  
4. **Desk** never receives a Signer object.  
5. **CavalRe Ledger** does not replace the EOA; it books capital the EOA moves via reactor/dispatcher.

---

## Gaps / next engineering

| Gap | Priority |
|-----|----------|
| Wire `resolveWalletSession` into desk `/meta` | Medium |
| Dry-run optional `postAccept` on VirtualBooks when accept | Medium |
| Full FloatLib forge parity tests | Low until markout needs it |
| Deploy scripts for Dispatcher+Ledger | After Go sign-off |
| Phase E claim-token product flows | After D live stable |

---

## Verify

```bash
npm run test:strategy   # phases A–D strategy
npm run test -w @cavalre/wallet   # includes lifecycle
```

**NEVER TRUST, ALWAYS VERIFY.**
