import { WalletError } from "./errors.js";

/** Standard Ethereum BIP-44 path prefix. */
export const ETH_PATH_PREFIX = "m/44'/60'/0'/0";

/**
 * Build a BIP-44 derivation path for Ethereum account index.
 * index must be a non-negative integer.
 */
export function ethPath(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index > 2_147_483_647) {
    throw new WalletError(
      "WALLET_INDEX_OUT_OF_RANGE",
      "account index must be a non-negative integer"
    );
  }
  return `${ETH_PATH_PREFIX}/${index}`;
}

/**
 * Validate a BIP-44 style path. We only accept the standard ETH form for now.
 */
export function assertEthPath(path: string): void {
  // m/44'/60'/0'/0/N
  const re = /^m\/44'\/60'\/0'\/0\/\d+$/;
  if (!re.test(path)) {
    throw new WalletError(
      "WALLET_INVALID_PATH",
      "path must match m/44'/60'/0'/0/<index>"
    );
  }
}
