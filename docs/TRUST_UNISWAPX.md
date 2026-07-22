# RULE OF TRUST — UniswapX

**Source (mandatory verify):** https://github.com/Uniswap/UniswapX  
**Also:** DefiLlama, cavalre-contracts, near/intents, CavalRe-Sentinel, CavalRe-Sentinel-Base

Every professional / knowledge-expert persona working on CavalRe-Sentinel-Base is expected to know this repository cold. Do not invent filler behavior; verify against this source.

---

## What UniswapX Is

ERC-20 swap settlement protocol:

- Swappers sign **gasless** orders off-chain
- **Fillers** compete to settle them on-chain
- MEV protection + access to arbitrary liquidity (not only Uniswap pools)
- Settlement always goes through a **Reactor** + **Permit2**

There is no special "ERC-20 wallet" inside UniswapX. Fillers use ordinary EVM accounts / contracts that can hold and transfer ERC-20s and call the reactor.

---

## Core Architecture

```
Swapper signs order (off-chain)
        ↓
Order appears on public API / order service
        ↓
Filler selects order + strategy
        ↓
Reactor.execute(SignedOrder)  or  executeWithCallback(...)
        ↓
1. Validate order
2. Resolve → inputs / outputs (Dutch decay applied here)
3. Permit2 permitWitnessTransferFrom (pull input from swapper)
4. Optional: reactorCallback(fillContract)  ← filler strategy runs
5. Transfer outputs to recipients
6. Verify fulfillment
```

### Reactors (order-type specific settlement)

| Reactor | Role |
|---------|------|
| `LimitOrderReactor` | Static limit orders |
| `DutchOrderReactor` | Linear-decay Dutch |
| `ExclusiveDutchOrderReactor` | Dutch + exclusivity window before decay |
| `V2DutchOrderReactor` | V2 Dutch |
| `V3DutchOrderReactor` | V3 Dutch (**block-based** decay on Base and other L2s) |
| `PriorityOrderReactor` | Priority / RFQ-style (used on Base) |

Interface: `IReactor`

```solidity
function execute(SignedOrder calldata order) external payable;
function executeWithCallback(SignedOrder calldata order, bytes calldata callbackData) external payable;
function executeBatch(SignedOrder[] calldata orders) external payable;
function executeBatchWithCallback(SignedOrder[] calldata orders, bytes calldata callbackData) external payable;
```

### Fill paths

1. **Direct fill** — `execute` / `executeBatch`  
   Reactor pulls output tokens from `msg.sender`. No callback. Simplest for inventory-based fills.

2. **Callback fill** — `executeWithCallback` / `executeBatchWithCallback`  
   Reactor calls `IReactorCallback.reactorCallback(resolvedOrders, callbackData)` on the fill contract.  
   Fill contract must approve the reactor for each output token/amount before returning.

### Key structs (`ReactorStructs.sol`)

- `OrderInfo` — reactor, swapper, nonce, deadline, optional validation callback
- `InputToken` — token, amount, maxAmount (for decaying inputs)
- `OutputToken` — token, amount, recipient
- `ResolvedOrder` — fully resolved concrete order after decay
- `SignedOrder` — `bytes order` + `bytes sig` (what fillers submit)

### Permit2

Canonical address (all chains we care about):

`0x000000000022D473030F116dDEE9F6B43aC78BA3`

---

## Base (chainId 8453) — Our Primary Target

From UniswapX README deployments:

| Contract | Address |
|----------|---------|
| **Priority Order Reactor** | `0x000000001Ec5656dcdB24D90DFa42742738De729` |
| **V3 Dutch Order Reactor** | `0x000000008a8330B5d1F43A62Bf4C673A49f27ba0` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Base has **both** Priority and DutchV3 reactors. Our dry-run poller must not assume a single order type.

### Dutch V3 decay (mandatory)

On Base, exclusivity and decay are measured in **block numbers**, not timestamps.

- Cosigner: `decayStartBlock`, optional `exclusivityOverrideBps`
- Curve: `relativeBlocks[]` + `relativeAmounts[]` (piecewise linear, max 16 points)
- Sentinel implementation: `packages/strategy/src/dutch-block-decay.ts`
- Operator doc: [DUTCH_V3_DECAY.md](./DUTCH_V3_DECAY.md)

Resolve path:

1. V3 curve + `currentBlock` → `decayAtBlock`
2. Else V2 time window → `linearDecay`
3. Else static start amounts / reject missing window in runner

Soft exclusivity: non-exclusive fillers may fill during the exclusive window only by delivering more output (`exclusivityOverrideBps`).

---

## Filler Integration Rules (for Sentinel)

1. **Permissionless** — anyone can fill; no KYC in the protocol itself.
2. **Never invent settlement logic** — always go through the reactor.
3. **Resolve decay correctly** — use V3 block curve on Base; never assume startAmount is the live obligation.
4. **Output approvals** — on callback path, approve the reactor for exact output amounts before returning from `reactorCallback`.
5. **Direct fill** is preferred for minimal capital / simple inventory strategies.
6. **Fee-on-transfer** — recipient receives post-fee amount; size carefully.
7. **Audits** — V1 ABDK, V1.1 ABDK + OZ, V2 Spearbit. Read the version log; v1.0 had a known issue and is retired.

---

## Mapping to CavalRe-Sentinel-Base

| Sentinel component | UniswapX concept |
|--------------------|------------------|
| `uniswapx-base` poller + parser | Order service feed + `eth_blockNumber` |
| `ParsedOrder` V3 fields | `decayStartBlock`, curve, override bps |
| `resolveOrderAmounts` | Reactor resolve (off-chain mirror) |
| `RiskEngine` | Pre-filter before attempting `execute` |
| `DecisionJournal` | Record accept/reject/fill/markout against `orderHash` |
| `wallet` LocalSigner / external Signer | `msg.sender` for direct fill or owner of fill contract |
| Future fill executor | Either direct `execute` or minimal `IReactorCallback` contract |

Dry-run today: poll + parse + risk + journal only.  
Live later: construct `SignedOrder`, call reactor `execute` (direct) with controlled capital.

---

## Libraries worth knowing by name

- `DutchDecayLib` / **`NonlinearDutchDecayLib`** — price curves (V2 time vs V3 block)
- `ExclusivityLib` — exclusive filler windows
- `PriorityFeeLib` / `PriorityOrderLib` — Base Priority path
- `V2DutchOrderLib` / `V3DutchOrderLib`
- `Permit2Lib`
- `OrderQuoter` — off-chain resolution helper (lens)

---

## Operational checklist for any persona

- [ ] Read `README.md` + `IReactor` + `IReactorCallback` + `ReactorStructs`
- [ ] Know Base reactor addresses (Priority + DutchV3)
- [ ] Know Permit2 address
- [ ] Understand **block-based** V3 decay vs time-based V2
- [ ] Understand direct fill vs callback fill
- [ ] Never put private keys in journals or logs
- [ ] Treat order API data as untrusted until parsed and risk-checked
- [ ] Verify any new assumption against this repo + DefiLlama + our own journal data

**NEVER TRUST, ALWAYS VERIFY — starting with https://github.com/Uniswap/UniswapX**
