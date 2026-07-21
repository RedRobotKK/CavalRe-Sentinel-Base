# Sentinel Desk — Research UI

Local, **read-only** interface for the Base UniswapX dry-run book.

## Design principles (JS / Cumberland bar)

1. **Journal is the book** — UI reads JSONL artifacts; it does not invent state.
2. **Read-only** — no enable-live, no key entry, no execute buttons.
3. **Dense, not decorative** — every pixel is a metric, reason code, or feature.
4. **Primitives first** — Amounts as decimal strings, orderClass, edgeBps, toxicity, decay, policyAction.
5. **Fail visible** — empty book and API errors shown plainly.
6. **Local-only** — binds to 127.0.0.1; not a public product surface.

## Run

Terminal A — dry-run harness (produces journals):

```bash
export BASE_RPC_URL=https://mainnet.base.org
npm run dry-run
```

Terminal B — API + desk:

```bash
npm run desk
```

Open http://127.0.0.1:5173  
API: http://127.0.0.1:8787

## Panels

| Panel | Source |
|-------|--------|
| Status strip | harness config constants + latest journal meta |
| Funnel | counts by policyAction / kind |
| Risk defaults | RiskEngine small-capital constants |
| Go/No-Go | static checklist from GO_NO_GO.md thresholds |
| Decisions table | tail of latest JSONL feature rows |
| Journal files | list under journals/ |
