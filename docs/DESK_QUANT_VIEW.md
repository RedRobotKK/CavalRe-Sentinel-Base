# What a JS / Cumberland-style desk shows (mapped to Sentinel)

## Not this

- MetaMask "Connect Wallet" as primary UX
- Token price tickers as the main product
- Vanity PnL without markout methodology
- Live arming from the browser

## Yes — this

| Desk surface | Why it exists | Sentinel source |
|--------------|---------------|-----------------|
| **Book / posture** | Dry-run vs live, venue, capital at risk | meta + GO_NO_GO |
| **Limits** | Hard risk before cleverness | RiskEngine defaults |
| **Pipeline / circuit** | Where decisions die | stage + reason codes |
| **Selectivity** | Accept rate is a control, not a vanity metric | funnel |
| **Edge distribution** | Is computed edge sane? | edgeBps histogram |
| **Markout W/L** | Real skill measure | journal `kind: markout` |
| **Expectancy** | E[markout] after cost | markout bps mean |
| **Inventory / wallet** | Can we settle? balances, allowances, signer ready | wallet readiness (no keys in UI) |
| **Tape** | Full feature rows for autopsy | JSONL |

## Win / loss definition (FloatLib / Amount discipline)

A **win** is not "policy accepted."  
A **win** is a fill (or shadow fill) whose **markout** is ≥ 0 after costs, in consistent units.

```
markout_bps = f(fill_price, mark_price_at_horizon)   // Amount math off-chain
win  := markout_bps >= 0
loss := markout_bps < 0
hit_rate := wins / (wins + losses)   // only over labeled markouts
```

Until markout labels exist, the desk shows **insufficient sample** — never a fake win rate.

Accept rate ≠ win rate. Accept rate is selectivity; win rate is markout quality.

## Wallet on this desk

| Layer | Role |
|-------|------|
| Research desk | Show **readiness**: mode, optional public address from env, path not live |
| Live later | External signer / hardware; execute path outside browser |
| Never | Paste mnemonic/private key into the web UI |

`LocalSigner` stays in `@cavalre/wallet` for Node/tests. Browser does not hold keys.

## When live capital is allowed

Only after `docs/GO_NO_GO.md` — then desk adds: live inventory, open risk, kill switch status, fill vs shadow divergence. Not before.
