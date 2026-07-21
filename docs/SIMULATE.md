# Simulate order flow

Drive the **real** decision pipeline with synthetic UniswapX-shaped orders so the desk, scope, and journals show signal without waiting on Base Dutch liquidity.

## What it is

| | |
|--|--|
| Real parse / classify / decay / edge / risk / policy | Yes |
| Real journal JSONL | Yes |
| Mainnet UniswapX API | **No** (mocked `fetchFn`) |
| Keys / broadcast | **No** |
| Live capital | **No** |

## Run

```bash
# terminal A — desk
npm run stack

# terminal B — simulation
npm run simulate
npm run simulate -- --cycles 30 --interval 1
```

Then open the desk UI. You should see:

- Circuit pulses on accepts / rejects
- Scope **SIGNAL** bursts when `raw > 0`
- Feed lines: `ACCEPT`, `REJECT`, `carrier`, not only heartbeats
- Journal file `journals/sim-base-dutch-*.jsonl`

Optional markout labels (age gate may skip fresh accepts):

```bash
npm run shadow-markout -- --windows 30,120
```

## Scenarios injected each cycle

1. Dutch with **good** edge (can accept)
2. Dutch with **bad** edge (reject)
3. **Priority** (class reject)
4. **Exclusive** filler set (class reject)
5. Every 4th cycle: **empty book** (carrier / noise floor)

## Do not confuse with mainnet dry-run

| Command | Source |
|---------|--------|
| `npm run dry-run` | Live Base UniswapX API |
| `npm run simulate` | Synthetic orders |
