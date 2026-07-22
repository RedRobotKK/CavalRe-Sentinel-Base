# Root of trust — math & contracts

## NEVER TRUST, ALWAYS VERIFY

Canonical repos:

| Concern | Source |
|---------|--------|
| **Fixed-point / Float math** | [`CavalRe/cavalre-contracts` → `math/FloatLib.sol`](https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatLib.sol) |
| **Float strings** | [`math/FloatStrings.sol`](https://github.com/CavalRe/cavalre-contracts/blob/main/math/FloatStrings.sol) |
| **UniswapX reactors / Dutch decay (on-chain)** | [Uniswap/UniswapX](https://github.com/Uniswap/UniswapX) |
| **Sentinel contracts / related** | [CavalRe/cavalre-contracts](https://github.com/CavalRe/cavalre-contracts), [RedRobotKK/CavalRe-Sentinel](https://github.com/RedRobotKK/CavalRe-Sentinel/) as applicable |

## FloatLib (what it is)

- Custom **fixed-point** type `Float` (`int256` packed mantissa + exponent)
- **21 significant digits**, normalize / align / times / divide / fullMulDiv
- Built with Solady `FixedPointMathLib` for wad helpers
- **Not** IEEE-754 `number`

## Sentinel strategy math today

| Path | Use |
|------|-----|
| `@cavalre/core` **Amount (`bigint`)** | Production sizes, decay amounts, quoter outs |
| Policy scalars (`number`) | Thresholds only (bps, toxicity) |
| `float-compare.ts` IEEE Number | **Research A/B only** — must not fill |
| FloatLib | **Root of trust** for any future precision float port |

When porting ratio/edge math beyond integer bps, implement or bind to **FloatLib semantics** and verify against `cavalre-contracts` tests — do not treat JS `Number` as FloatLib.
