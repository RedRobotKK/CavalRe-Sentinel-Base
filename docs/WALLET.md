# Wallet Module — Non-Custodial EVM / ERC-20

## Purpose

Provide a minimal, auditable, non-custodial signing and ERC-20 interaction layer for CavalRe-Sentinel-Base on Base.

There is no "ERC-20 wallet" standard. This module is an EVM wallet component that can:

- Derive addresses (secp256k1 + Keccak-256)
- Sign digests (for transactions or typed data later)
- Encode ERC-20 `balanceOf`, `transfer`, and `approve` calldata using `Amount` (bigint)

## Security Posture

| Rule | Enforcement |
|------|-------------|
| Private keys never logged or put in errors | `WalletError` messages are code-only or generic |
| Private keys never enter the DecisionJournal | Journal only stores addresses and Amounts |
| Fail-closed validation | Explicit `WalletErrorCode` on every failure |
| LocalSigner is high-risk | Documented; prefer external `Signer` in production |
| Amounts are bigint | All ERC-20 quantities use `@cavalre/core` Amount |

## Lifecycle

1. User controls mnemonic / private key (non-custodial).
2. `LocalSigner` (or future hardware Signer) holds key only in memory.
3. Read path: `encodeBalanceOf` + eth_call (no key).
4. Write path: encode calldata → sign digest → broadcast (or return signed payload).
5. `destroy()` best-effort zeroizes the key buffer.

## Error Codes

- `WALLET_INVALID_PRIVATE_KEY`
- `WALLET_INVALID_PUBLIC_KEY`
- `WALLET_INVALID_PATH`
- `WALLET_INDEX_OUT_OF_RANGE`
- `WALLET_MISSING_PRIVATE_KEY`
- `WALLET_SIGN_FAILED`
- `WALLET_INVALID_ADDRESS`
- `ERC20_INVALID_ADDRESS`
- `ERC20_INVALID_AMOUNT`
- `ERC20_ENCODE_FAILED`

## Usage Notes

- For dry-run and tests, `LocalSigner` with a throwaway key is acceptable.
- For any real capital, inject an external `Signer` (hardware, remote, or MPC) that never exposes the key to this process.
- Never commit private keys. CI secret scan is already active.
