/**
 * Explicit wallet error codes.
 * Never include private keys, mnemonics, or raw secrets in messages.
 */
export type WalletErrorCode =
  | "WALLET_INVALID_PRIVATE_KEY"
  | "WALLET_INVALID_PUBLIC_KEY"
  | "WALLET_INVALID_PATH"
  | "WALLET_INDEX_OUT_OF_RANGE"
  | "WALLET_MISSING_PRIVATE_KEY"
  | "WALLET_SIGN_FAILED"
  | "WALLET_INVALID_ADDRESS"
  | "ERC20_INVALID_ADDRESS"
  | "ERC20_INVALID_AMOUNT"
  | "ERC20_ENCODE_FAILED";

export class WalletError extends Error {
  readonly code: WalletErrorCode;

  constructor(code: WalletErrorCode, message?: string) {
    super(message ?? code);
    this.name = "WalletError";
    this.code = code;
  }
}
