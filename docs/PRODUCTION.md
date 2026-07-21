# Production posture

Two different meanings of "production":

## A. Research production (current target)

- [x] Mainnet dry-run harness stable (Base, Dutch_V3)
- [x] Edge computed (QuoterV2); decay before risk/policy
- [x] Priority classified ignore; feature journals
- [x] Desk visualizes circuit, book, limits, wallet readiness
- [x] CI: secrets + audit high + typecheck + tests
- [x] 0 high/critical npm audit (after remediation)
- [x] Live mode hard-disabled
- [x] Shadow markout job (`npm run shadow-markout`) for desk W/L
- [ ] `package-lock.json` on `main` via SSH push (operator)
- [ ] Multi-day journals accumulating
- [ ] Shadow markout sample large enough for go/no-go stats

## B. Live-capital production — NOT started

Blocked on [`GO_NO_GO.md`](GO_NO_GO.md).

## Operator loop (research prod)

```bash
export BASE_RPC_URL=https://mainnet.base.org

# terminal 1 — collect decisions
npm run dry-run

# terminal 2 / cron — label accepts when age ≥ window
npm run shadow-markout -- --window 120

# terminal 3–4 — visualize
npm run desk:api
npm run desk:web
```

SSH for git write:

```bash
git remote set-url origin git@github.com:RedRobotKK/CavalRe-Sentinel-Base.git
```
