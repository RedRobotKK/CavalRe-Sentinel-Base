/** Base mainnet chain ID */
export const BASE_CHAIN_ID = 8453;

/** Canonical UniswapX orders endpoint (public) */
export const UNISWAPX_ORDERS_URL = "https://api.uniswap.org/v2/orders";

/**
 * Base mainnet token + protocol addresses.
 * TRUST: UniswapX README deployments, Uniswap v3 Base deployments docs.
 */
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_WETH = "0x4200000000000000000000000000000000000006";

/** Permit2 (canonical) */
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** UniswapX reactors on Base */
export const BASE_PRIORITY_REACTOR =
  "0x000000001Ec5656dcdB24D90DFa42742738De729";
export const BASE_DUTCH_V3_REACTOR =
  "0x000000008a8330B5d1F43A62Bf4C673A49f27ba0";

/** Uniswap v3 QuoterV2 on Base (official deployments list) */
export const BASE_QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

/** Default public Base RPC (override with BASE_RPC_URL) */
export const DEFAULT_BASE_RPC = "https://mainnet.base.org";

/** Fee tiers to probe for reference cost */
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;
