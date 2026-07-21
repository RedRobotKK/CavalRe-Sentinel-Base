# RULE OF TRUST — CavalRe Contracts

**Source (mandatory verify):** https://github.com/CavalRe/cavalre-contracts  
**Also:** Uniswap/UniswapX, DefiLlama, near/intents, CavalRe-Sentinel, this repo

AI specialist and every other persona working on Sentinel-Base must know these primitives. This is training-critical material. Do not invent accounting or math behavior — verify here.

---

## Repository shape

```
cavalre-contracts/
├── modules/
│   ├── dispatcher/   # Dispatcher, Dispatchable, selector → module routing
│   ├── ledger/       # Hierarchical double-entry accounting
│   └── tree/         # Topology / debug (TreeView)
├── math/
│   ├── FloatLib.sol  # Fixed-point Float type (21 significant digits)
│   └── FloatStrings.sol
├── utilities/       # Initializable, ReentrancyGuard, MemoryLib, RandomLib
├── examples/         # ERC20, ERC4626, LedgerERC20, Sentry, Token
└── tests/            # Foundry mirrors of modules/libraries/examples
```

Philosophy: **accounting-first**, modular via Dispatcher, auditable separation of concerns.

---

## Primitive 1 — FloatLib (`math/FloatLib.sol`)

### Type

```solidity
type Float is int256;
```

Packed representation:
- **72-bit signed mantissa**
- **Remaining bits: base-10 exponent**
- Normalized magnitude: `[10^20, 10^21 - 1]` → **21 significant digits**

### Constants

`ZERO`, `ONE` … `TEN`, `HALF`, `PI`, `LOG10`  
`SIGNIFICANT_DIGITS = 21`, `MANTISSA_BITS = 72`

### Conversions (interface for off-chain / TS)

| Solidity | Meaning | Sentinel mapping |
|----------|---------|------------------|
| `toFloat(uint256 a, uint8 decimals)` | raw units → Float | `Amount` → scaled rational |
| `toUInt(Float, decimals)` | Float → uint (reverts if negative) | Float → `Amount` |
| `toInt(Float, decimals)` | Float → signed int | rare off-chain |
| `components` / `mantissa` / `exponent` | unpack | debug / journal |
| `normalize` | force canonical form | always after ops |

### Arithmetic

`plus`, `minus`, `times`, `divide`, `fullMulDiv`  
Comparisons: `isEQ`, `isGT`, `isGEQ`, `isLT`, `isLEQ`, `isZero`  
Transforms: `abs`, `shift`, `align`, `round`, `parts`  
Special: `exp`, `log`, `pow`, `powUint`, `powInt`, `sqrt`

### Errors

`FloatNegativeValue`, `LogNonPositive`, `PowBaseNotPositive`, `PowExponentTooSmall`, `PowZeroBase`, `ShiftMagnitudeTooLarge`

### Sentinel rule

Off-chain we use `Amount = bigint` (raw integer units) as the **wire and journal** type.  
Any pricing / edge / markout math that needs decimal scale should follow FloatLib semantics (normalize, never use JS `number` for value).  
When interfacing on-chain CavalRe ledgers later, convert:

```
Amount (raw, decimals D)  ↔→  FloatLib.toFloat(amount, D) / toUInt(float, D)
```

---

## Primitive 2 — Dispatcher / Dispatchable

**Dispatcher.sol** — immutable entrypoint. Selector → module address, `delegatecall`.  
**Dispatchable.sol** — base for modules:

- `__self` detects delegatecall context
- `enforceIsDelegated` / `enforceNotDelegated`
- `enforceIsOwner`
- `selectors()` — register commands

**Flow:** Module implements `selectors()` → Dispatcher maps selector → module. Call hits Dispatcher → lookup → delegatecall module.

Storage: **ERC-7201** namespaced slots per module (`cavalre.storage.ModuleName`). Never change storage layout without explicit permission.

**Sentinel relevance:** Future on-chain strategy / inventory modules would install behind a Dispatcher. Off-chain runner stays pure TS; only live settlement path talks to UniswapX reactors + optional CavalRe ledger.

---

## Primitive 3 — Ledger (hierarchical double-entry)

### Model

- **Tree** of accounts under token **roots**
- Roots are always **debit groups**
- **TokenKind:** `Native` | `External` | `Internal` | `Claim`
- **AccountKind:** registered vs unregistered; group vs leaf; debit vs credit
- Address taxonomy:
  - `absolute_` — global storage key
  - `holder_` — token-local ERC20 holder key
  - `relative_` — reusable child key
  - `LedgerLib.toAddress(root, holderParent, relative)`

Special:
- `NATIVE_ADDRESS` — native token (ETH)
- Each root auto-registers `SOURCE_ADDRESS` / `Source` as default credit source leaf
- `address(0)` reserved for ERC20 mint/burn event projection
- Internal + Claim roots are **self-wrapped** at creation (root address = ERC20 surface)
- Native / External roots do **not** get separate wrapper surfaces

### ILedger surface (mutations)

| Function | Role |
|----------|------|
| `initializeLedger(name, symbol)` | Bootstrap |
| `addSubAccountGroup(...)` | Add group under parent |
| `addSubAccount(...)` | Add leaf (isCredit flag) |
| `addNativeToken()` | Register native root |
| `addExternalToken(token)` | Register external ERC20 root |
| `createInternalToken(name, symbol, decimals, version)` | Deterministic internal root |
| `createClaimToken(...)` | Claim root on a non-claim leaf |
| `removeSubAccount` / `removeSubAccountGroup` | Topology cleanup |
| `transfer(root, fromHolderParent, from, toHolderParent, to, amount)` | Full routed transfer |
| `transfer(root, fromHolderParent, toHolderParent, to, amount)` | Shorthand |
| `wrap` / `unwrap` | Native/external wrap settlement |
| `handleNative()` | Receive native |

### Events

`LedgerAdded`, `SubAccountAdded/Removed`, `SubAccountGroupAdded/Removed`, `Credit`, `Debit`, standard `Transfer` / `Approval`

### Errors (fail-closed — mirror in off-chain risk language)

`InsufficientBalance`, `InsufficientAllowance`, `InvalidToken`, `InvalidAddress`, `DuplicateToken`, `HasBalance`, `HasSubAccount`, `UndercollateralizedToken`, `Unauthorized`, `LedgerUninitialized`, `ZeroAddress`, `DifferentRoots`, …

### TreeView

Read-only topology: `root`, `parent`, `flags`, `effectiveFlags`, `subAccounts`, `debugTree(s)`. Keep Ledger focused on mutations; TreeView for introspection.

---

## Primitive 4 — Examples (reference only)

- `LedgerERC20` — ERC20 API over LedgerLib state via Dispatcher
- `ERC20` / `ERC4626` / `Token` / `Sentry` — patterns, not production Sentinel paths

---

## Logic flows for Sentinel-Base

### A. Off-chain money path (current Phase 0+)

```
UniswapX wire amount (decimal string)
    → toAmount() → Amount (bigint)     // @cavalre/core
    → RiskEngine.checkPositionSize
    → DecisionJournal (amount as string on wire)
    → optional markout (Amount fill vs mark → bps string)
```

Aligns with FloatLib discipline: **no JS Number for value**; convert only at boundaries with known decimals.

### B. Future: inventory as Ledger leaves (optional on-chain)

```
External root = Base USDC / WETH (addExternalToken)
Sub-accounts = strategy sleeves / risk buckets (addSubAccount)
transfer(...) routes inventory between sleeves
Credit/Debit events → off-chain journal reconciliation
```

### C. Future: fill settlement bridge

```
RiskEngine allow
  → wallet signs / fill contract
  → UniswapX Reactor.execute(SignedOrder)   // TRUST_UNISWAPX
  → on success: record fill + optional Ledger.transfer for internal books
  → markout window → journal markout annotation
```

### D. Divergence / halt (Ledger spirit)

On-chain Ledger refuses undercollateralized / insufficient balance.  
Off-chain RiskEngine + Journal must refuse the same class of states:

- exceed max position
- exceed equity
- daily loss / drawdown halt
- toxic markout cluster → policy halt

---

## AI specialist — training checklist

Must be able to answer without guessing:

1. What is a `Float` and how is it packed?
2. How do you convert `uint256` token units at decimals D to/from Float?
3. What does normalize do and when is it required?
4. Difference between Native / External / Internal / Claim roots?
5. What is SOURCE_ADDRESS used for?
6. How does Dispatcher route a call?
7. Why is storage ERC-7201 namespaced?
8. Which ILedger errors map to RiskEngine reject reasons?
9. How does Sentinel `Amount` relate to FloatLib (and when must we not use Number)?
10. How does a fill flow combine UniswapX Reactor + optional Ledger transfer?

---

## Mapping table (contracts ↔ Sentinel packages)

| cavalre-contracts | Sentinel-Base |
|-------------------|---------------|
| FloatLib | `@cavalre/core` Amount + future Float port if needed |
| Ledger transfer / balance invariants | `@cavalre/risk-engine` hard gates |
| Credit/Debit + fail-closed errors | `@cavalre/journal` decisions + halt |
| TreeView debug | journal context / ops tooling |
| Dispatcher modules | future on-chain strategy modules (not Phase 0) |
| External token roots | Base USDC/WETH addresses in `uniswapx-base` constants |

---

## Rules for all personas

- **NEVER TRUST, ALWAYS VERIFY** against this repo for accounting/math claims
- Do not change imagined storage layouts or invent Float semantics
- Prefer deriving analytics off-chain; on-chain only mutations required for correctness
- Keep `Amount` as the off-chain wire type; document decimal scale at every boundary
- When in doubt: open FloatLib / ILedger / LedgerLib and read the source

**Primary training corpus for AI specialist:** this file + FloatLib.sol + ILedger.sol + AGENTS.md in cavalre-contracts + TRUST_UNISWAPX.md
