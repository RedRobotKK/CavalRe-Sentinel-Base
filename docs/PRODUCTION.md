# Production posture

## Phase map

| Phase | Meaning | Status |
|-------|---------|--------|
| 0 | Research stack (code) | **Complete** |
| **0.5** | Evidence toward go/no-go | **Active** |
| 1 | Tiny live ($200) | Blocked |

## Phase 0.5 commands

```bash
export BASE_RPC_URL=https://mainnet.base.org

npm run dry-run                          # collect
npm run shadow-markout -- --windows 30,120
npm run go-no-go                         # score gates (exit 2 = NO_GO)
npm run research-ops                     # markout both windows + report file
```

Reports land in `reports/go-no-go-*.json` (gitignored pattern optional).

## Live capital

Still **OFF**. See [`GO_NO_GO.md`](GO_NO_GO.md) and [`PHASE_0_5.md`](PHASE_0_5.md).
