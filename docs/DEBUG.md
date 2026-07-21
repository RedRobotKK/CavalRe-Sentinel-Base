# Debugging the VIEW pipeline

## Data path (nothing is on-chain)

```
UniswapX API  ──poll──►  dry-run harness  ──append──►  journals/*.jsonl
     ▲                         │
     │                    Base RPC eth_call
     │                    (QuoterV2 ref cost)
     │
desk-api :8787  ◄──read──  journals/
     │
     └── GET /journals/latest  ──►  desk UI (pipeline / stream / log)
```

## What gets written

Each cycle of `scripts/dry-run-harness.mjs`:

1. `runCycle()` polls open Dutch_V3 orders
2. For every order: parse → classify → resolve → edge → policy
3. One JSONL record per decision (`quote_rejected` | `quote_accepted` | `info` wait)
4. One `cycle_heartbeat` with `raw`, `accepted`, `rejected`, `waited`, `latencyMs`

### Useful fields on a record

| field | meaning |
|-------|---------|
| `kind` | `quote_rejected` / `quote_accepted` / `info` |
| `reason` | why (e.g. `class_not_tradable:exclusive`, `edge_undefined:…`) |
| `ref` | order hash |
| `context.stage` | parse / classify / resolve / edge / policy |
| `context.orderClass` | dutch / exclusive / … |
| `context.edgeBps` | edge vs AMM when quoted |
| `context.refOutput` | Quoter amount out |
| `context.inputToken` / `outputToken` | pair |
| `context.latencyMs` | on heartbeats only |

## CLI checks

```bash
# latest journal tail
tail -n 5 journals/*.jsonl | jq .

# reject reasons in latest file
jq -r 'select(.kind=="quote_rejected") | .reason' journals/$(ls -t journals | head -1) | sort | uniq -c | sort -rn

# Dutch that died on edge
jq 'select(.context.orderClass=="dutch" and (.reason|startswith("edge")))' journals/$(ls -t journals | head -1)

# API
curl -s http://127.0.0.1:8787/journals/latest?limit=20 | jq '.summary'
curl -s http://127.0.0.1:8787/meta | jq '.sources, .mode'
```

## How UI maps data → hero blocks

`Circuit.tsx` aggregates journal records into per-stage `pass` / `drop` counts and `lastHit` stage. That drives `PipelineScene` labels and which node is elevated. **Visuals never invent metrics** — empty pass means the wire never reached that stage.

## Interpreting common drops

| reason | action |
|--------|--------|
| `class_not_tradable:exclusive` | Expected — not our exclusive slot |
| `edge_undefined:…` | Quoter failed / zero — check RPC, pair liquidity, fee tiers |
| parse field errors | Wire shape — harden `parse.ts` |

## Logs

```bash
tail -f logs/dry-run.log    # cycle JSON + errors
tail -f logs/desk-api.log
tail -f logs/desk-web.log
```
