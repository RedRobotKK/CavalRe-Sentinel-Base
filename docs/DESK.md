# Sentinel Desk — Visual Research Book (USP)

Local, **read-only** interface. The product differentiator is **seeing the book**: every policy decision, edge, toxicity score, and reason code — as charts and as a table.

## Why visualization is the USP

Most filler stacks are black boxes. Sentinel Desk makes the research process legible:

- **Funnel** — accept / wait / reject volume
- **Timeline** — cumulative decisions (selectivity over time)
- **Edge histogram** — distribution of computed edgeBps
- **Class mix** — dutch vs priority vs exclusive vs unknown
- **Reason bars** — why we said no (toxicity, risk, class, edge)
- **Feature table** — full markout-ready rows from JSONL

Empty charts with an empty Base book are honest, not broken.

## Design rules

1. Journal is the only source of truth
2. Read-only — no live enable, no keys
3. Dense quant aesthetic (dark, mono numbers)
4. Local bind only (`127.0.0.1`)

## Run

```bash
# terminal 1 — optional feed
export BASE_RPC_URL=https://mainnet.base.org
npm run dry-run

# terminal 2
npm run desk:api

# terminal 3
npm install   # once, for recharts
npm run desk:web
```

Open http://127.0.0.1:5173
