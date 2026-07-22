export { WalletError, type WalletErrorCode } from "./errors.js";
export type { Address, Hex, Signer, TransferParams, ApproveParams } from "./types.js";
export { publicKeyToAddress, assertAddress } from "./address.js";
export { ethPath, assertEthPath, ETH_PATH_PREFIX } from "./derivation.js";
export { LocalSigner, ethMessageHash } from "./signer.js";
export { encodeBalanceOf, encodeTransfer, encodeApprove } from "./erc20.js";
export {
  resolveWalletSession,
  walletPublicContext,
  assertCanSign,
  WALLET_USE_CASES,
  type WalletPosture,
  type IntegrationPhaseId,
  type WalletSession,
  type WalletLifecycleInput,
} from "./lifecycle.js";
