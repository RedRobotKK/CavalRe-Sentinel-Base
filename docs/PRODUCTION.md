# Production posture

Two different meanings of "production":

## A. Research production (current target) — ACHIEVED when

- [x] Mainnet dry-run harness stable (Base, Dutch_V3)
- [x] Edge computed (QuoterV2); decay before risk/policy
- [x] Priority classified ignore; feature journals
- [x] Desk visualizes circuit, book, limits, wallet readiness
- [x] CI: secrets + audit high + typecheck + tests
- [x] 0 high/critical npm audit (after remediation)
- [x] Live mode hard-disabled
- [ ] `package-lock.json` on `main` via SSH push (operator)
- [ ] Multi-day journals accumulating
- [ ] Shadow markout job labeling accepts

## B. Live-capital production — NOT started

Blocked on [`GO_NO_GO.md`](GO_NO_GO.md).

Requires: external signer path review, reactor execute integration tests, inventory checks, kill switch, phase-1 size caps.

## Operator checklist (research prod)

```bash
npm ci   # or npm install if lock not yet on remote
npm test && npm run typecheck && npm run audit:high
export BASE_RPC_URL=...
npm run dry-run          # terminal 1
npm run desk:api         # terminal 2
npm run desk:web         # terminal 3
```

SSH for git write:

```bash
git remote set-url origin git@github.com:RedRobotKK/CavalRe-Sentinel-Base.git
```
