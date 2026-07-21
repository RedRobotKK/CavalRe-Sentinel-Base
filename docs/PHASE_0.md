# Phase 0 — Complete

Phase 0 delivered a **research-production** dry-run stack on Base.

## Delivered

- Amount-safe core, RiskEngine, DecisionJournal  
- Strategy: classify, Dutch decay, edge, toxicity, FillPolicy  
- UniswapX Base poller + live API wire parse + QuoterV2 reference cost  
- Non-custodial wallet package (Node; not browser)  
- Compliant runner; live mode disabled  
- Dry-run harness with JSONL + cycle heartbeats  
- Shadow markout job  
- Sentinel Desk (circuit, charts, book quality, wallet readiness)  
- CI security + audit + tests  
- TRUST / compliance / go-no-go documentation  

## Not in Phase 0

- Live capital  
- Priority trading policy  
- Browser wallet connection  

## Next

Phase **0.5** = ops evidence (journals + markouts) toward [`GO_NO_GO.md`](GO_NO_GO.md).  
See [`SCOPE_REVIEW.md`](SCOPE_REVIEW.md).
