/**
 * Wallet lifecycle postures aligned to Sentinel integration phases A–E.
 *
 * Rules:
 * - Keys never enter DecisionJournal or desk payloads (address only).
 * - VIEW / dry-run need no Signer.
 * - LIVE requires Go/No-Go + injected Signer (prefer non-LocalSigner).
 * - CavalRe Ledger/Dispatcher (Phase D+) are separate from EOA Signer;
 *   wallet signs txs that call Reactor / Dispatcher; Ledger holds books.
 */

import type { Address, Signer } from "./types.js";
import { assertAddress } from "./address.js";
import { WalletError } from "./errors.js";

export type WalletPosture = "none" | "view" | "ready" | "live";

export type IntegrationPhaseId = "A" | "B" | "C" | "D" | "E";

export interface WalletSession {
  posture: WalletPosture;
  /** Public address only — safe for desk / journal context */
  address: Address | null;
  hasSigner: boolean;
  phase: IntegrationPhaseId;
  liveCapitalAllowed: boolean;
}

export interface WalletLifecycleInput {
  phase: IntegrationPhaseId;
  /** Optional public address for desk display (no key). */
  displayAddress?: string | null;
  /** Injected signer — never serialized. */
  signer?: Signer | null;
  /** From @cavalre/strategy canEnableLive(evidence) */
  goNoGoSatisfied?: boolean;
}

/**
 * Resolve session posture for the current phase + credentials.
 * Fail-closed: live only if goNoGo + signer present.
 */
export function resolveWalletSession(input: WalletLifecycleInput): WalletSession {
  const phase = input.phase;
  const go = input.goNoGoSatisfied === true;
  const signer = input.signer ?? null;

  let address: Address | null = null;
  if (signer) {
    address = assertAddress(signer.address);
  } else if (input.displayAddress) {
    try {
      address = assertAddress(input.displayAddress);
    } catch {
      throw new WalletError("WALLET_INVALID_ADDRESS");
    }
  }

  // Phases A–C: research only — never live capital
  if (phase === "A" || phase === "B" || phase === "C") {
    if (signer) {
      return {
        posture: "ready",
        address,
        hasSigner: true,
        phase,
        liveCapitalAllowed: false,
      };
    }
    if (address) {
      return {
        posture: "view",
        address,
        hasSigner: false,
        phase,
        liveCapitalAllowed: false,
      };
    }
    return {
      posture: "none",
      address: null,
      hasSigner: false,
      phase,
      liveCapitalAllowed: false,
    };
  }

  // Phase D/E: live possible only with Go + Signer
  if (phase === "D" || phase === "E") {
    if (go && signer) {
      return {
        posture: "live",
        address,
        hasSigner: true,
        phase,
        liveCapitalAllowed: true,
      };
    }
    if (signer) {
      return {
        posture: "ready",
        address,
        hasSigner: true,
        phase,
        liveCapitalAllowed: false,
      };
    }
    if (address) {
      return {
        posture: "view",
        address,
        hasSigner: false,
        phase,
        liveCapitalAllowed: false,
      };
    }
    return {
      posture: "none",
      address: null,
      hasSigner: false,
      phase,
      liveCapitalAllowed: false,
    };
  }

  return {
    posture: "none",
    address: null,
    hasSigner: false,
    phase,
    liveCapitalAllowed: false,
  };
}

/** Journal-safe public fields only. */
export function walletPublicContext(session: WalletSession): {
  walletPosture: WalletPosture;
  walletAddress: string | null;
  liveCapitalAllowed: boolean;
  phase: IntegrationPhaseId;
} {
  return {
    walletPosture: session.posture,
    walletAddress: session.address,
    liveCapitalAllowed: session.liveCapitalAllowed,
    phase: session.phase,
  };
}

/**
 * Guard before any signing path (Reactor.execute / Ledger-moving tx).
 */
export function assertCanSign(session: WalletSession): void {
  if (!session.hasSigner) {
    throw new WalletError("WALLET_MISSING_PRIVATE_KEY");
  }
  if (!session.liveCapitalAllowed) {
    throw new WalletError("WALLET_SIGN_FAILED");
  }
  if (session.posture !== "live") {
    throw new WalletError("WALLET_SIGN_FAILED");
  }
}

/** Use-case matrix for docs/tests — single source of truth. */
export const WALLET_USE_CASES = [
  {
    id: "UC1_anonymous_research",
    phase: "A" as const,
    needsSigner: false,
    needsAddress: false,
    description: "Dry-run + desk without wallet; posture none",
  },
  {
    id: "UC2_display_address",
    phase: "A" as const,
    needsSigner: false,
    needsAddress: true,
    description: "SENTINEL_ADDRESS on desk only; posture view",
  },
  {
    id: "UC3_ready_not_live",
    phase: "C" as const,
    needsSigner: true,
    needsAddress: true,
    description: "Signer loaded for sim encode/sign tests; liveCapitalAllowed false",
  },
  {
    id: "UC4_live_blocked_no_go",
    phase: "D" as const,
    needsSigner: true,
    needsAddress: true,
    description: "Phase D with signer but Go/No-Go false → ready, cannot sign live",
  },
  {
    id: "UC5_live_unlocked",
    phase: "D" as const,
    needsSigner: true,
    needsAddress: true,
    description: "Go/No-Go true + Signer → posture live; Reactor/Ledger txs allowed",
  },
  {
    id: "UC6_product_sleeve",
    phase: "E" as const,
    needsSigner: true,
    needsAddress: true,
    description: "Same live gate; capital may route via Claim/Internal ledger sleeves",
  },
] as const;
