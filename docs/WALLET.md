# Wallet Module — Non-Custodial EVM / ERC-20

## Purpose

Minimal, auditable signing and ERC-20 interaction for CavalRe-Sentinel-Base on Base.

- Derive addresses (secp256k1 + Keccak-256)
- Sign digests (txs / typed data later)
- Encode ERC-20 `balanceOf`, `transfer`, `approve` with `Amount` (bigint)
- **Lifecycle postures** aligned to phases A–E (`lifecycle.ts`)

## Security posture

| Rule | Enforcement |
|------|-------------|
| Private keys never logged | `WalletError` code-only messages |
| Private keys never in DecisionJournal | Journal gets `walletPublicContext` only |
| Fail-closed validation | `WalletErrorCode` on every failure |
| LocalSigner is high-risk | Prefer external `Signer` in production |
| Amounts are bigint | `@cavalre/core` Amount |

## Lifecycle postures

| Posture | Meaning |
|---------|---------|
| `none` | No address, no signer — pure research |
| `view` | Public address for desk (e.g. `SENTINEL_ADDRESS`) |
| `ready` | Signer in process memory; **cannot** live-fill |
| `live` | Go/No-Go satisfied **and** Signer — may sign reactor/ledger txs |

```ts
import { resolveWalletSession, assertCanSign, walletPublicContext } from "@cavalre/wallet";

const session = resolveWalletSession({
  phase: "D",
  signer,                    // injected — never serialize
  goNoGoSatisfied: false,  // from strategy canEnableLive(evidence)
});
// posture: "ready" → assertCanSign throws
```

Full use-case matrix: [PHASES_REVIEW.md](./PHASES_REVIEW.md).

## User journeys

### 1. Researcher (default)

No wallet → `npm run dry-run` → journals → desk. Posture `none`.

### 2. Operator with display address

Set public address env for desk badge only. Posture `view`. No signing.

### 3. Integration test signer

`LocalSigner` with throwaway key encodes approve/transfer and signs digests in unit tests. Phase A–C → posture `ready`, `liveCapitalAllowed: false`.

### 4. Live filler (after Go/No-Go)

1. Human completes [GO_NO_GO.md](./GO_NO_GO.md) + sign-off  
2. Inject production `Signer` (hardware / remote / MPC)  
3. `resolveWalletSession({ phase: "D", signer, goNoGoSatisfied: true })` → `live`  
4. On accept: `assertCanSign` → sign `Reactor.execute` (and later Dispatcher/Ledger moves)  
5. Journal records **address + amounts only**  
6. `destroy()` / process exit clears LocalSigner buffers if used  

### 5. Product capital (Phase E)

Same live gate; Ledger **Claim/Internal** sleeves attribute PnL. Wallet still only signs; books live in CavalRe Ledger.

## Relation to CavalRe smart contracts

| Component | Holds keys? | Role |
|-----------|-------------|------|
| `@cavalre/wallet` Signer | Yes (in memory / HSM) | Authorize txs |
| UniswapX Reactor | No | Validate + settle order |
| CavalRe Dispatcher | No | Route module calls |
| CavalRe Ledger | No | Double-entry inventory |
| Sentry module | No | Module ownership transfers |

Wallet is **not** the Ledger. Filling without Ledger books is possible but not Phase D target architecture.

## Error codes

- `WALLET_INVALID_PRIVATE_KEY` / `WALLET_INVALID_PUBLIC_KEY` / `WALLET_INVALID_PATH`  
- `WALLET_INDEX_OUT_OF_RANGE` / `WALLET_MISSING_PRIVATE_KEY` / `WALLET_SIGN_FAILED`  
- `WALLET_INVALID_ADDRESS`  
- `ERC20_INVALID_ADDRESS` / `ERC20_INVALID_AMOUNT` / `ERC20_ENCODE_FAILED`  

## Tests

```bash
npm run test -w @cavalre/wallet
```

Includes address, derivation, erc20, signer, **lifecycle** use-cases UC1–UC6.
