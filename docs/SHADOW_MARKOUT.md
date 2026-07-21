# Shadow markout (research production)

Labels dry-run **accepts** with post-decision markouts so the desk can show **wins / losses / hit rate**.

## Definition

For each `quote_accepted`:

- **fillPrice** = `resolvedOutput` (output we would have delivered)
- **markPrice** = QuoterV2 amountOut now for the same `resolvedInput` (input→output)
- **markoutBps** = `(mark - fill) * 10000 / fill` via `@cavalre/journal` Amount integer math
- **toxic** if markoutBps \< \-30

Appends `kind: "markout"` with `markoutBps` in context (desk `/journals/latest` summary picks this up).

Idempotent: will not double-label the same `ref` + `windowSec`.

## Run

```bash
export BASE_RPC_URL=https://mainnet.base.org

# after dry-run has some accepts (or periodically on a timer)
npm run shadow-markout
npm run shadow-markout -- --window 30
npm run shadow-markout -- --window 120 --dir journals
```

Then refresh the desk — **Book quality** panel updates when `markout` rows exist.

## Honest limits

- This is **shadow**, not a settled fill
- Empty accept set ⇒ nothing to label (Base Dutch may be quiet)
- Quoter failure / zero liquidity ⇒ skip that ref
