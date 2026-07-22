export {
  linearDecay,
  decayAmount,
  decayOutput,
  decayInput,
  decayProgressBps,
  DutchDecayError,
} from "./dutch-decay.js";
export {
  decayAtBlock,
  getBlockDecayedAmount,
  getV3EndAmount,
  linearDecayBlocks,
  applyExclusivityOverride,
  blockDecayProgressBps,
  firstAffordableBlock,
  DutchBlockDecayError,
  type NonlinearDutchCurve,
  type DutchBlockDecayConfig,
} from "./dutch-block-decay.js";
export {
  decideFill,
  heuristicToxicity,
  DEFAULT_LOW_CAPITAL_POLICY,
  type FillAction,
  type FillPolicyConfig,
  type FillFeatures,
  type FillDecision,
} from "./fill-policy.js";
export {
  classifyOrder,
  isExclusiveWindowOpen,
  isTradableClass,
  type OrderClass,
  type ClassifiableOrder,
} from "./classify.js";
export { computeEdgeBps, type EdgeInput, type EdgeResult } from "./edge.js";
export {
  resolveOrderAmounts,
  type ResolvableOrder,
  type ResolvedAmounts,
} from "./resolve.js";
export {
  summarizeFlow,
  type FlowRecord,
  type FlowSummary,
} from "./flow-taxonomy.js";
export {
  dutchAuctionPhase,
  evaluateDutchAuction,
  type DutchAuctionPhase,
  type DutchAuctionInput,
  type DutchAuctionResult,
} from "./dutch-auction.js";
export {
  floatLinearDecay,
  floatEdgeBps,
  compareDecayAndEdge,
  type MathCompareRow,
} from "./float-compare.js";
export {
  FLOATLIB_SIGNIFICANT_DIGITS,
  FLOATLIB_MANTISSA_BITS,
  FLOATLIB_NORMALIZED_MANTISSA_MIN,
  FLOATLIB_NORMALIZED_MANTISSA_MAX,
  PHASE_A_EXTERNAL_ROOTS,
  LEDGER_ERROR_TO_POLICY_REASON,
  mapLedgerErrorToPolicyReason,
  PHASE_A_MONEY_RULES,
  INTEGRATION_PHASES,
  phaseById,
  assertPhaseAInvariants,
  type LedgerTokenKind,
  type LedgerErrorName,
  type IntegrationPhase,
  type PhaseDefinition,
} from "./phase-a-spec.js";
export {
  VirtualBooks,
  VirtualBooksError,
  type AccountRef,
  type BookEntry,
  type SleeveId,
} from "./virtual-books.js";
export {
  normalize,
  from as floatFrom,
  toFloat,
  toUInt,
  plus,
  minus,
  times,
  divide,
  align,
  shift,
  isEQ,
  isGT,
  isZero,
  edgeBpsFloat,
  FLOAT_ZERO,
  FloatLibError,
  type Float,
} from "./floatlib.js";
export {
  LIVE_MODE_ERROR,
  DEFAULT_GO_NO_GO,
  isGoNoGoSatisfied,
  missingGoNoGoGates,
  assertModeAllowed,
  canEnableLive,
  PHASE_D_LIVE_LIMITS,
  PHASE_D_PLAN,
  type GoNoGoEvidence,
  type PhaseDDeploymentPlan,
  type RunnerMode,
} from "./phase-d-live.js";
