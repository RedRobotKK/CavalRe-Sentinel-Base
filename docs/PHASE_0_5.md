# Phase 0.5 — Evidence toward Go/No-Go

**Goal:** Turn dry-run journals into a written, quantitative go/no-go package.  
**Not in scope:** Live capital, reactor execute, browser keys.

## Deliverables

| Item | Command / artifact |
|------|---------------------|
| Continuous dry-run | `npm run dry-run` |
| Dual-window shadow markout (+30s, +2m) | `npm run shadow-markout -- --windows 30,120` |
| Go/No-Go report | `npm run go-no-go` → stdout + optional file |
| One-shot research ops | `npm run research-ops` |

## Exit criteria (enter Phase 1 planning only)

All gates in [`GO_NO_GO.md`](GO_NO_GO.md) **PASS** with journal evidence and a human signature line.

Until then: **NO-GO**. Runner still throws `live_mode_not_enabled`.

## Operator loop

```bash
export BASE_RPC_URL=https://mainnet.base.org

# long-running
npm run dry-run

# periodically (or cron)
npm run research-ops
```

Inspect desk for book quality; inspect report for gate table.
